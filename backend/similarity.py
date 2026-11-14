"""Earth Analog Similarity — question B.

"Which places on Earth share the characteristics of this Moon or Mars location
that matter for research and testing?"

This is a different problem from site suitability and uses a different model.
An excellent analog need not resemble a good landing site, and vice versa.

Method
------
For one planetary cell P and every Earth land cell E, each *dimension* d gives
a similarity s_d ∈ [0, 1]. Only dimensions that are physically meaningful to
compare are scored; the rest are reported as "where the analogy breaks down".

    similarity(P, E) = Σ w_d · s_d / Σ w_d      (dimensions with data on both sides)

Dimensions
  terrain      slope and roughness measured identically on all three worlds;
               Gaussian similarity of the log-ratio (a factor of 2 apart → 0.61)
  geology      measured planetary composition matched to mapped Earth rock type
               through an explicit affinity table (expert rule, printed in full)
  ice          planetary ice-evidence index vs Earth frozen-ground index
  environment  how bare and how dry the Earth cell is — a precondition for any
               Moon or Mars analog, the same for every planetary site
  thermal      (Mars only) annual-mean ground temperature, Gaussian, σ = 40 K
  dust         (Mars only) dust optical depth vs aerosol optical depth, log-ratio

Never scored: gravity, atmospheric pressure, radiation, and for the Moon
temperature — Earth cannot reproduce them. They are listed with numbers.

Weights depend on the research purpose (rover mobility, ice and drilling, …),
because an analog can be excellent for one use and poor for another.

Missing data: a dimension with no data on either side is dropped and weights
renormalised; `coverage` is the share of weight that was scored. Earth cells
below 80 % coverage are not ranked. Nothing is imputed.

Grades use the same A–F edges as suitability but grade a different quantity.
"""
from __future__ import annotations

import math

import numpy as np

from . import catalog
from .geo import gc_km, pick_distinct
from .store import Grid, Store
from .suitability import GRADE_EDGES, GRADE_MEANING, grade_of, ramp, wmean

LN2 = math.log(2.0)
MIN_COVERAGE = 0.80
SEPARATION_KM = 500.0

GRAVITY = {"moon": 1.62, "mars": 3.71, "earth": 9.81}
DAY_LENGTH = {"moon": "29.5 Earth days", "mars": "24 h 39 min", "earth": "24 h"}

# ---------------------------------------------------------------- lithology
LITH = {v[0]: k for k, v in catalog.LITH_CLASSES.items()}      # code → class id

A_MARE = dict(vb=1.00, pb=0.70, py=0.60, vi=0.50, pi=0.30, mt=0.25, va=0.20, su=0.20, ss=0.15, sm=0.15, pa=0.15, sc=0.10, ev=0.05, ig=0.0)
A_HIGHLAND = dict(pb=0.80, pi=0.45, mt=0.40, vb=0.35, pa=0.30, vi=0.30, py=0.30, va=0.20, su=0.20, ss=0.15, sm=0.15, sc=0.10, ev=0.05, ig=0.0)
A_MARS = dict(vb=1.00, py=0.75, vi=0.60, pb=0.60, su=0.50, ev=0.45, ss=0.35, sm=0.30, pi=0.30, va=0.25, mt=0.20, pa=0.15, sc=0.15, ig=0.10)

AFFINITY_NOTES = {
    "mare": "Lunar maria are iron-rich basalt. Terrestrial basalt is the closest rock; gabbro is its coarse-grained equivalent; pyroclastics and andesite share volcanic textures but not chemistry. Sedimentary, carbonate and evaporite rocks have no lunar counterpart.",
    "highland": "Lunar highlands are anorthosite and related feldspar-rich rocks. The lithology map groups anorthosite with gabbro (basic plutonic rocks) and cannot isolate it, so the best possible match is capped at 0.8.",
    "mars": "The Martian crust is dominated by basalt, with basaltic sand and dust, sulfate and chloride salts, and ice at high latitude. Affinities shift toward loose sediment where thermal inertia shows a dust mantle, toward evaporites where chlorine is high, and toward ice where ground ice is indicated.",
}


def affinity_vector(table: dict) -> np.ndarray:
    v = np.full(17, np.nan, np.float32)
    for code, a in table.items():
        v[LITH[code]] = a
    return v


def log_sim(p: float, e: np.ndarray, eps: float, tol: float = LN2):
    with np.errstate(invalid="ignore", divide="ignore"):
        d = np.log((p + eps) / (e + eps))
    return np.exp(-0.5 * (d / tol) ** 2)


def gauss_sim(p: float, e: np.ndarray, sigma: float):
    return np.exp(-0.5 * ((p - e) / sigma) ** 2)


DIMENSIONS = {
    "terrain": dict(label="Terrain", comparable="Directly comparable",
                    how="Median slope, steep-ground slope and roughness, each measured over a 3.7 km baseline on both worlds. Similarity falls to 0.61 when values differ by a factor of two and to 0.14 at a factor of four."),
    "geology": dict(label="Rock type", comparable="Comparable through a stated rule",
                    how="Measured planetary chemistry is matched to the mapped Earth rock class with RADIUM's affinity table. The table is an expert judgement, not a measurement."),
    "ice": dict(label="Ice and frozen ground", comparable="Comparable as an index",
                how="A 0–1 index of ice evidence at the planetary site is compared with a 0–1 index of frozen ground on Earth (permanent ice cover, or mean ground temperature from 0 °C down to −8 °C). Similarity = 1 − difference."),
    "environment": dict(label="Bare, dry ground", comparable="Precondition",
                        how="How much of the Earth cell is exposed rock or soil (not hidden by plants or glacier ice; vegetation index full credit at 0.10 or below, none at 0.35) and how dry it is (precipitation full credit at 60 mm/yr or below, none at 600 mm/yr). The same test for every planetary site."),
    "thermal": dict(label="Ground temperature", comparable="Comparable for Mars only",
                    how="Annual-mean ground temperature on both worlds, Gaussian with a 40 K tolerance: an Earth site 40 K warmer than the Mars site scores 0.61. Mars is colder than almost anywhere on Earth, so this rewards the coldest ground. Not scored for the Moon."),
    "dust": dict(label="Airborne dust", comparable="Partly comparable",
                 how="Visible optical depth of airborne dust on Mars against aerosol optical depth on Earth. The quantity is the same; particle size, composition and air density are not."),
}

PURPOSES = {
    "mars": {
        "general": dict(label="General analog", blurb="Balanced across everything that can be compared.",
                        w=dict(terrain=0.22, geology=0.22, environment=0.20, thermal=0.14, ice=0.12, dust=0.10)),
        "mobility": dict(label="Rover mobility", blurb="Driving and navigation trials over comparable ground.",
                         w=dict(terrain=0.50, environment=0.20, geology=0.15, dust=0.15)),
        "ice": dict(label="Ice and drilling", blurb="Ground-ice prospecting, drilling and sample handling in frozen soil.",
                    w=dict(ice=0.35, thermal=0.20, environment=0.25, geology=0.10, terrain=0.10)),
        "geology": dict(label="Geology and sampling", blurb="Field geology, instrument tests and sampling on similar rock.",
                        w=dict(geology=0.50, environment=0.20, terrain=0.20, ice=0.10)),
        "dust": dict(label="Dust and solar power", blurb="Dust accumulation on arrays and optics, filtration, visibility.",
                     w=dict(dust=0.40, environment=0.30, terrain=0.10, thermal=0.10, geology=0.10)),
        "astrobiology": dict(label="Habitability limits", blurb="Life-detection methods where cold and drought push life to its limit.",
                             w=dict(environment=0.35, thermal=0.25, ice=0.20, geology=0.20)),
    },
    "moon": {
        "general": dict(label="General analog", blurb="Balanced across everything that can be compared.",
                        w=dict(terrain=0.35, geology=0.35, environment=0.20, ice=0.10)),
        "mobility": dict(label="Rover mobility", blurb="Driving and navigation trials over comparable ground.",
                         w=dict(terrain=0.60, environment=0.25, geology=0.15)),
        "ice": dict(label="Polar volatiles and drilling", blurb="Prospecting and drilling in frozen, ice-bearing ground.",
                    w=dict(ice=0.45, environment=0.25, terrain=0.15, geology=0.15)),
        "geology": dict(label="Geology and ISRU feedstock", blurb="Field geology and processing tests on similar rock.",
                        w=dict(geology=0.60, environment=0.20, terrain=0.20)),
    },
}

# A purpose can be irrelevant to a planetary site: an "ice and drilling" analog
# means nothing where the site shows no sign of ice. Such purposes are reported
# as not applicable instead of being graded.
ICE_PURPOSE_MIN_INDEX = 0.25


def purpose_applicable(purpose: str, p: dict):
    if purpose == "ice":
        idx = p.get("ice_index")
        if idx is None:
            return False, "No ice data for this planetary site, so an ice analog cannot be judged."
        if idx < ICE_PURPOSE_MIN_INDEX:
            return False, "This planetary site shows no evidence of ground ice, so an ice-drilling analog is not relevant here."
    return True, None


APPLICATION_TEXT = {
    "general": "broad field campaigns that combine geology, mobility and operations",
    "mobility": "rover driving, traverse planning and navigation trials",
    "ice": "ground-ice prospecting, drilling and cold sample handling",
    "geology": "field geology, instrument calibration and sampling practice",
    "dust": "dust mitigation, solar-array soiling and optical-instrument tests",
    "astrobiology": "life-detection and habitability studies at the dry, cold limit",
}


class Twin:
    def __init__(self, store: Store):
        self.store = store
        e = store.g["earth"]
        self.e = e
        a = e.a
        self.valid = e.valid
        self.lith = np.where(np.isfinite(a["lith"]), a["lith"], 0).astype(np.int16)
        self.lith_ok = np.isfinite(a["lith"]) & ~np.isin(self.lith, [LITH["wb"], LITH["nd"], 0])
        with np.errstate(invalid="ignore", divide="ignore"):
            self.frozen = np.maximum(np.nan_to_num(a["ice_frac"], nan=0.0), ramp(a["tmean"], 273.15, 265.15)).astype(np.float32)
            ice = np.nan_to_num(a["ice_frac"], nan=0.0)
            # Exposed ground: the share of the cell that is rock or soil, hidden
            # neither by plants nor by glacier ice. Where a vegetation index
            # exists it sets the plant-free share of the ice-free area; where it
            # does not (polar night, ice margins) the mapped barren share is used.
            s_ground = np.where(np.isfinite(a["ndvi_max"]), (1.0 - ice) * ramp(a["ndvi_max"], 0.35, 0.10),
                                np.nan_to_num(a["barren_frac"], nan=0.0))
            s_arid = ramp(np.log10(np.maximum(a["precip_mm_yr"], 1.0)), math.log10(600.0), math.log10(60.0))
        self.s_ground = np.clip(s_ground, 0.0, 1.0).astype(np.float32)
        self.s_arid = s_arid.astype(np.float32)
        self.s_env = (0.5 * self.s_ground + 0.5 * self.s_arid).astype(np.float32)
        self.lat = e.lat2d.ravel()
        self.lon = e.lon2d.ravel()

    # ---------------------------------------------------------------- planet
    def profile(self, g: Grid, i: int, j: int) -> dict:
        v = lambda n: g.value(n, i, j)  # noqa: E731
        p = {"body": g.body, "grid": g.id, "slope_med": v("slope_med"), "slope_p90": v("slope_p90"), "rough_iqr": v("rough_iqr")}
        if g.body == "moon":
            feo = v("feo_wt")
            p.update(feo_wt=feo, tio2_wt=v("tio2_wt"), h_ppm=v("h_ppm"), tmax=v("tmax"), tmin=v("tmin"), tmean=v("tmean"),
                     dist_psr_km=v("dist_psr_km"))
            p["mare_fraction"] = None if feo is None else float(np.clip((feo - 6.0) / 10.0, 0.0, 1.0))
            hyd = None if p["h_ppm"] is None else float(ramp(p["h_ppm"], 60.0, 150.0))
            if g.kind == "polar":
                near = v("ice_nearby")
                geo = None if near is None else float(np.clip(near / 0.8, 0.0, 1.0))
                p["ice_basis"] = "share of nearby ground where ice is thermally stable within 1 m, and hydrogen abundance"
            else:
                geo = None if p["dist_psr_km"] is None else float(ramp(p["dist_psr_km"], 10.0, 1.0))
                p["ice_basis"] = "distance to permanent shadow, and hydrogen abundance"
            parts = [x for x in (geo, hyd) if x is not None]
            p["ice_index"] = float(np.mean(parts)) if parts else None
        else:
            p.update(weh_wt=v("weh_wt"), thermal_inertia=v("thermal_inertia"), albedo=v("albedo"), cl_wt=v("cl_wt"),
                     fe_wt=v("fe_wt"), si_wt=v("si_wt"), tmean=v("tmean"), tmax=v("tmax"), tmin=v("tmin"),
                     dust_tau=v("dust_tau"), ps_mean=v("ps_mean"), solar_flux=v("solar_flux"))
            if p["tmean"] is not None:
                # Shallow ground ice persists where the annual-mean surface
                # temperature is at or below about 198 K (Mellon & Jakosky 1993);
                # the gate falls to zero at 215 K. Thermal stability alone earns
                # half the index; hydrogen enrichment inside the stable zone earns
                # the rest. Hydrogen in warm ground is not counted as ice (it is
                # more likely bound in hydrated minerals).
                gate = float(ramp(p["tmean"], 215.0, 198.0))
                p["ice_gate"] = gate
                if p["weh_wt"] is not None:
                    p["ice_index"] = 0.5 * gate + 0.5 * gate * float(ramp(p["weh_wt"], 2.5, 7.0))
                    p["ice_basis"] = ("thermal stability of shallow ground ice (annual mean 198 K or colder) and "
                                      "water-equivalent hydrogen, which counts only where ice is stable")
                else:
                    # Poleward of about 57° the GRS product reports no value because the
                    # ground is too ice-rich for its retrieval (Boynton et al. 2002).
                    p["ice_index"] = gate
                    p["ice_basis"] = ("thermal stability of shallow ground ice only; the hydrogen product reports "
                                      "no value at this latitude, where published analyses find ice-rich ground")
            else:
                p["ice_index"] = None
                p["ice_basis"] = "no temperature or hydrogen data"
            p["dust_index"] = None if p["thermal_inertia"] is None else float(ramp(p["thermal_inertia"], 200.0, 80.0))
        return p

    def affinity(self, p: dict):
        """Return (vector over lithology class ids, explanation text)."""
        if p["body"] == "moon":
            if p.get("mare_fraction") is None:
                return None, "No composition data."
            m = p["mare_fraction"]
            vec = m * affinity_vector(A_MARE) + (1 - m) * affinity_vector(A_HIGHLAND)
            kind = "mare basalt" if m > 0.66 else "feldspathic highland" if m < 0.34 else "mixed mare and highland material"
            return vec, f"FeO {p['feo_wt']:.1f} wt% indicates {kind} (mare fraction {m:.0%})."
        t = dict(A_MARS)
        notes = []
        d = p.get("dust_index")
        if d is not None and d > 0:
            t["su"] = 0.50 + 0.30 * d
            t["py"] = 0.75 + 0.10 * d
            t["vb"] = 1.00 - 0.25 * d
            if d > 0.3:
                notes.append(f"thermal inertia {p['thermal_inertia']:.0f} shows a dust mantle, raising the match to loose sediment")
        cl = p.get("cl_wt")
        if cl is not None:
            c = float(ramp(cl, 0.45, 0.70))
            t["ev"] = 0.45 + 0.35 * c
            if c > 0.3:
                notes.append(f"chlorine {cl:.2f} wt% raises the match to evaporites")
        ice = p.get("ice_index")
        if ice is not None and ice > 0:
            t["ig"] = 0.10 + 0.50 * ice
        base = "Basaltic crust is assumed, as mapped across Mars"
        if p.get("si_wt") is not None:
            base += f" (silicon {p['si_wt']:.1f} wt%, iron {p['fe_wt']:.1f} wt%)"
        return affinity_vector(t), base + ("; " + "; ".join(notes) if notes else "") + "."

    # ----------------------------------------------------------------- score
    def dimensions(self, p: dict):
        """Similarity of every Earth cell to planetary profile p, per dimension."""
        a = self.e.a
        out = {}
        parts = []
        if p["slope_med"] is not None:
            parts.append((0.4, log_sim(p["slope_med"], a["slope_med"], 0.1)))
        if p["slope_p90"] is not None:
            parts.append((0.3, log_sim(p["slope_p90"], a["slope_p90"], 0.1)))
        if p["rough_iqr"] is not None:
            parts.append((0.3, log_sim(p["rough_iqr"], a["rough_iqr"], 1.0)))
        out["terrain"] = wmean(parts) if parts else None

        vec, _ = self.affinity(p)
        if vec is not None:
            g = vec[self.lith]
            out["geology"] = np.where(self.lith_ok, g, np.nan)
        else:
            out["geology"] = None

        out["ice"] = None if p.get("ice_index") is None else 1.0 - np.abs(p["ice_index"] - self.frozen)
        out["environment"] = self.s_env
        if p["body"] == "mars":
            out["thermal"] = None if p.get("tmean") is None else gauss_sim(p["tmean"], a["tmean"], 40.0)
            out["dust"] = None if p.get("dust_tau") is None else log_sim(p["dust_tau"], a["aod55"], 0.02)
        return out

    @staticmethod
    def combine(dims: dict, weights: dict):
        num = None
        cov = None
        for d, w in weights.items():
            s = dims.get(d)
            if s is None:
                continue
            ok = np.isfinite(s)
            n = np.where(ok, w * s, 0.0)
            c = np.where(ok, w, 0.0)
            num = n if num is None else num + n
            cov = c if cov is None else cov + c
        total = sum(weights.values())
        if num is None:
            return None, None
        cov = cov / total
        with np.errstate(invalid="ignore", divide="ignore"):
            score = np.where(cov >= MIN_COVERAGE, num / (cov * total), np.nan)
        return score, cov

    def score_all(self, g: Grid, i: int, j: int, purpose: str):
        p = self.profile(g, i, j)
        dims = self.dimensions(p)
        w = PURPOSES[g.body][purpose]["w"]
        score, cov = self.combine(dims, w)
        if score is not None:
            score = np.where(self.valid, score, np.nan)
        return p, dims, score, cov

    # ----------------------------------------------------------- explanation
    def explain(self, p: dict, dims: dict, ei: int, ej: int, purpose: str):
        """Everything needed to justify one Earth cell as an analog of profile p."""
        e = self.e
        ev = lambda n: e.value(n, ei, ej)  # noqa: E731
        body = p["body"]
        w = PURPOSES[body][purpose]["w"]
        total_w = sum(w.values())
        rows = []
        for d, meta in DIMENSIONS.items():
            if d not in w and d not in dims:
                continue
            arr = dims.get(d)
            s = None
            if arr is not None:
                x = float(arr[ei, ej])
                s = x if math.isfinite(x) else None
            row = {"id": d, "label": meta["label"], "comparable": meta["comparable"], "how": meta["how"],
                   "weight": w.get(d, 0.0) / total_w, "score": s, "grade": grade_of(s), "pairs": [], "note": None}
            if d == "terrain":
                for vid in ("slope_med", "slope_p90", "rough_iqr"):
                    m = e.vars[vid]
                    row["pairs"].append({"label": m["label"], "unit": m["unit"], "dec": m["dec"], "planet": p.get(vid), "earth": ev(vid)})
            elif d == "geology":
                _, txt = self.affinity(p)
                lith = ev("lith")
                name = catalog.LITH_CLASSES[int(lith)][1] if lith is not None else None
                row["note"] = txt
                if body == "moon":
                    row["pairs"].append({"label": "Iron oxide (FeO)", "unit": "wt%", "dec": 1, "planet": p.get("feo_wt"), "earth": None, "earth_text": name})
                else:
                    row["pairs"].append({"label": "Thermal inertia", "unit": "J m⁻² K⁻¹ s⁻½", "dec": 0, "planet": p.get("thermal_inertia"), "earth": None, "earth_text": name})
                if arr is None:
                    row["note"] = "No composition data for this planetary cell."
                elif s is None:
                    row["note"] = "No mapped rock type for this Earth cell."
            elif d == "ice":
                row["pairs"].append({"label": "Ice index (0–1)", "unit": "", "dec": 2, "planet": p.get("ice_index"), "earth": float(self.frozen[ei, ej])})
                row["note"] = f"Planetary index from {p.get('ice_basis')}. Earth index from permanent ice cover and mean ground temperature."
                row["pairs"].append({"label": "Mean ground temperature", "unit": "K", "dec": 0, "planet": p.get("tmean"), "earth": ev("tmean")})
            elif d == "environment":
                row["pairs"].append({"label": "Peak greenness (NDVI)", "unit": "", "dec": 2, "planet": 0.0, "earth": ev("ndvi_max"), "planet_text": "none"})
                row["pairs"].append({"label": "Precipitation", "unit": "mm/yr", "dec": 0, "planet": 0.0, "earth": ev("precip_mm_yr"), "planet_text": "none"})
                row["pairs"].append({"label": "Exposed rock or soil", "unit": "", "dec": 2, "fmt": "percent", "planet": 1.0, "earth": float(self.s_ground[ei, ej])})
                if (ev("ice_frac") or 0) > 0.5:
                    row["note"] = "Most of this cell is glacier ice, which hides the ground just as vegetation would."
            elif d == "thermal":
                row["pairs"].append({"label": "Annual-mean ground temperature", "unit": "K", "dec": 0, "planet": p.get("tmean"), "earth": ev("tmean")})
            elif d == "dust":
                row["pairs"].append({"label": "Optical depth of airborne dust", "unit": "", "dec": 2, "planet": p.get("dust_tau"), "earth": ev("aod55")})
            rows.append(row)

        scored = [r for r in rows if r["score"] is not None and r["weight"] > 0]
        num = sum(r["weight"] * r["score"] for r in scored)
        cov = sum(r["weight"] for r in scored)
        score = num / cov if cov >= MIN_COVERAGE else None
        strong = [r["label"] for r in sorted(scored, key=lambda r: -r["score"]) if r["score"] >= 0.70]
        weak = [r["label"] for r in sorted(scored, key=lambda r: r["score"]) if r["score"] < 0.45]
        missing = [r["label"] for r in rows if r["score"] is None and r["weight"] > 0]

        fitness = []
        for pid, pm in PURPOSES[body].items():
            n = c = 0.0
            for d, wd in pm["w"].items():
                arr = dims.get(d)
                if arr is None:
                    continue
                x = float(arr[ei, ej])
                if math.isfinite(x):
                    n += wd * x
                    c += wd
            tw = sum(pm["w"].values())
            ps = n / c if c / tw >= MIN_COVERAGE else None
            ok, why_not = purpose_applicable(pid, p)
            if not ok:
                ps = None
            fitness.append({"id": pid, "label": pm["label"], "score": ps, "grade": grade_of(ps),
                            "use": APPLICATION_TEXT[pid], "coverage": c / tw, "applicable": ok, "note": why_not})

        return {
            "score": score, "grade": grade_of(score), "meaning": GRADE_MEANING.get(grade_of(score) or ""),
            "coverage": cov, "dimensions": rows, "strong": strong, "weak": weak, "missing": missing,
            "fitness": fitness, "breaks_down": self.breaks_down(p, ei, ej),
        }

    def breaks_down(self, p: dict, ei: int, ej: int):
        """Conditions Earth cannot reproduce — always reported, never scored."""
        e = self.e
        body = p["body"]
        ps_e = e.value("ps_mean", ei, ej)
        items = [{
            "label": "Gravity", "planet": f"{GRAVITY[body]:.2f} m/s²", "earth": f"{GRAVITY['earth']:.2f} m/s²",
            "text": f"Earth's gravity is {GRAVITY['earth'] / GRAVITY[body]:.1f} times stronger. Loads, traction, dust settling and human movement all differ.",
        }]
        if body == "mars":
            ps_p = p.get("ps_mean")
            if ps_p and ps_e:
                items.append({"label": "Air pressure", "planet": f"{ps_p:,.0f} Pa", "earth": f"{ps_e:,.0f} Pa",
                              "text": f"The air here is about {ps_e / ps_p:,.0f} times denser than at the Mars site. Wind forces, heat transfer, parachutes and boiling points cannot be reproduced outdoors."})
        else:
            items.append({"label": "Air pressure", "planet": "vacuum", "earth": f"{ps_e:,.0f} Pa" if ps_e else "—",
                          "text": "The Moon has no atmosphere. Vacuum effects on lubricants, seals, dust and heat rejection need a chamber, not a field site."})
            tx, tn = p.get("tmax"), p.get("tmin")
            ex, en = e.value("tmax", ei, ej), e.value("tmin", ei, ej)
            if tx and ex:
                lunar = f"{tn:.0f}–{tx:.0f} K" if tn else f"up to {tx:.0f} K"
                items.append({"label": "Temperature", "planet": lunar, "earth": f"{en:.0f}–{ex:.0f} K",
                              "text": "Lunar surface temperatures are set by sunlight and radiation to space with no air to moderate them. No place on Earth spans this range, so temperature is not scored for the Moon."})
        items.append({"label": "Radiation", "planet": "unshielded", "earth": "shielded",
                      "text": "With no global magnetic field and little or no air, surface radiation is far higher than anywhere on Earth. RADIUM holds no radiation dataset and does not score it."})
        ndvi, pr = e.value("ndvi_max", ei, ej), e.value("precip_mm_yr", ei, ej)
        life = []
        if pr is not None:
            life.append(f"{pr:,.0f} mm of precipitation a year")
        if ndvi is not None:
            life.append(f"a peak vegetation index of {ndvi:.2f}")
        items.append({"label": "Water and life", "planet": "none known", "earth": "present",
                      "text": ("This Earth cell has " + " and ".join(life) + ". " if life else "") +
                              "Liquid water, weathering and microbes alter rock and soil in ways that have no counterpart at the planetary site."})
        items.append({"label": "Length of day", "planet": DAY_LENGTH[body], "earth": DAY_LENGTH["earth"],
                      "text": "Thermal cycling and lighting follow a different rhythm." if body == "moon" else "Close to Earth's, one of the few conditions that nearly matches."})
        return items

    # ----------------------------------------------------------------- search
    def top(self, score: np.ndarray, n: int = 10):
        idx = pick_distinct(score.ravel(), self.lat, self.lon, self.e.radius_km, SEPARATION_KM, n)
        return [divmod(int(k), self.e.shape[1]) for k in idx]

    @staticmethod
    def distribution(score: np.ndarray):
        v = score[np.isfinite(score)]
        out = {}
        prev = np.inf
        for k, edge in GRADE_EDGES:
            out[k] = int(((v >= edge) & (v < prev)).sum())
            prev = edge
        return {"cells": int(v.size), "grades": out,
                "best": float(v.max()) if v.size else None, "median": float(np.median(v)) if v.size else None}
