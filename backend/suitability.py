"""Planetary Site Suitability — question A.

"How suitable is this Moon or Mars location for a defined mission?"

Method: a documented weighted multi-criteria model.

    score = Σ wᵢ · sᵢ / Σ wᵢ          (sum over criteria that have data)

* sᵢ ∈ [0, 1] is a criterion's suitability, produced by an explicit transfer
  function from measured quantities (linear ramps and one trapezoid, listed
  with every criterion and printed on the Methodology page).
* wᵢ are mission weights, normalised to sum to 1. Users may change them.
* Missing data: a criterion without data is left out and the remaining
  weights are renormalised. `coverage` = share of the weight that had data.
  Below 60 % coverage no grade is given.
* Hard limits: optional mission constraints exclude a cell outright. They are
  screening values chosen by RADIUM (rationale stated per limit), not agency
  requirements.
* Grades: A ≥ 0.80, B ≥ 0.65, C ≥ 0.50, D ≥ 0.35, F below. A RADIUM-defined
  scale, not a NASA certification.

This score is completely separate from Earth-analog similarity (similarity.py).
"""
from __future__ import annotations

import numpy as np

from .geo import pick_distinct
from .store import Grid, Store

GRADE_EDGES = [("A", 0.80), ("B", 0.65), ("C", 0.50), ("D", 0.35), ("F", 0.0)]
GRADE_MEANING = {"A": "Excellent", "B": "Good", "C": "Moderate", "D": "Poor", "F": "Very poor"}
MIN_COVERAGE = 0.60


def grade_of(score) -> str | None:
    if score is None or not np.isfinite(score):
        return None
    for g, edge in GRADE_EDGES:
        if score >= edge:
            return g
    return "F"


def ramp(x, zero_at: float, one_at: float):
    """Linear transfer: 0 at `zero_at`, 1 at `one_at`, clamped. Works in either
    direction (use zero_at > one_at when lower values are better)."""
    return np.clip((x - zero_at) / (one_at - zero_at), 0.0, 1.0)


def band(x, a: float, b: float, c: float, d: float):
    """Trapezoid: 0 at ≤ a, 1 between b and c, 0 at ≥ d."""
    return np.clip(np.minimum((x - a) / (b - a), (d - x) / (d - c)), 0.0, 1.0)


def wmean(parts):
    """Weighted mean of (weight, array) pairs over the parts that have data."""
    num = None
    den = None
    for w, a in parts:
        if a is None:
            continue
        ok = np.isfinite(a)
        n = np.where(ok, w * a, 0.0)
        d = np.where(ok, w, 0.0)
        num = n if num is None else num + n
        den = d if den is None else den + d
    if num is None:
        return None
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, num / den, np.nan)


# =============================================================================
# Criteria. Each returns suitability in [0, 1] (NaN where data are missing).
# =============================================================================
def moon_ice(g: Grid):
    prox = ramp(g.a["dist_psr_km"], 10.0, 1.0)
    hyd = ramp(g.a["h_ppm"], 60.0, 150.0)
    if g.kind == "polar":
        stab = np.clip(g.a["ice_nearby"] / 0.8, 0.0, 1.0)
        return wmean([(0.40, prox), (0.35, stab), (0.25, hyd)])
    return wmean([(0.40, prox), (0.25, hyd)])


def moon_solar(g: Grid):
    if g.kind == "polar":
        # sunlight on the best-lit buildable (≤ 10° slope) 240 m patch; a cell with
        # no buildable ground has nowhere to put arrays, hence 0 rather than "no data"
        return ramp(np.nan_to_num(g.a["illum_flat_max"], nan=0.0), 0.25, 0.85)
    return ramp(g.a["illum_frac"], 0.25, 0.85)


def moon_terrain(g: Grid):
    reg = 0.5 * ramp(g.a["slope_med"], 12.0, 1.5) + 0.5 * ramp(g.a["slope_p90"], 20.0, 4.0)
    if g.kind == "polar":
        return 0.6 * ramp(g.a["flat_frac"], 0.05, 0.60) + 0.4 * reg
    return reg


def moon_thermal(g: Grid):
    return band(g.a["tmax"], 120.0, 220.0, 330.0, 400.0)


def moon_comm(g: Grid):
    return np.clip(g.a["earth_vis"], 0.0, 1.0)


def moon_regolith(g: Grid):
    return ramp(g.a["tio2_wt"], 1.0, 8.0)


def mars_edl(g: Grid):
    return ramp(g.a["elev_mean"], 1000.0, -3000.0)


def mars_terrain(g: Grid):
    return 0.5 * ramp(g.a["slope_med"], 6.0, 1.0) + 0.5 * ramp(g.a["slope_p90"], 15.0, 3.0)


def mars_surface(g: Grid):
    return wmean([(0.6, ramp(g.a["thermal_inertia"], 100.0, 250.0)), (0.4, ramp(g.a["albedo"], 0.28, 0.20))])


def mars_dust(g: Grid):
    return ramp(g.a["dust_tau"], 0.55, 0.15)


def mars_solar(g: Grid):
    return ramp(g.a["solar_flux"], 60.0, 150.0)


def mars_thermal(g: Grid):
    return 0.5 * ramp(g.a["tmean"], 180.0, 222.0) + 0.5 * ramp(g.a["tmin"], 148.0, 188.0)


def mars_water(g: Grid):
    return ramp(g.a["weh_wt"], 2.5, 6.0)


CRITERIA = {
    # ------------------------------------------------------------------ Moon
    "moon_ice": dict(
        fn=moon_ice, label="Water-ice access", short="Ice",
        question="Is there evidence that ice could be reached from here?",
        inputs=["dist_psr_km", "ice_1m_frac", "coldtrap_frac", "h_ppm"],
        rule=("Blend of three indicators: distance to a permanently shadowed region of at least 1 km² (full credit within 1 km, none beyond 10 km; weight 0.40), "
              "share of ground within about 10 km where ice is thermally stable in the top metre (full credit at 80 %; weight 0.35; polar grids only), "
              "and hydrogen abundance (none at 60 ppm, full at 150 ppm; weight 0.25)."),
        caveat="Indicates where ice could survive and where hydrogen is enriched. It is not a detection of ice."),
    "moon_solar": dict(
        fn=moon_solar, label="Solar energy", short="Sun",
        question="How much of the time is this place in sunlight?",
        inputs=["illum_flat_max", "illum_max", "illum_frac"],
        rule="Fraction of time in sunlight: none at 25 %, full credit at 85 %. Near the poles the best-lit 240 m patch of buildable ground (slope 10° or less) in the cell is used; elsewhere the smooth-sphere value of 50 %.",
        caveat="Below 65° latitude the 14-day night is represented only through the 50 % figure."),
    "moon_terrain": dict(
        fn=moon_terrain, label="Terrain safety", short="Terrain",
        question="Is the ground gentle enough to land and build on?",
        inputs=["flat_frac", "slope_med", "slope_p90", "slope480_med"],
        rule=("Regional slope at a 3.8 km baseline: median (none at 12°, full at 1.5°) and 90th percentile (none at 20°, full at 4°), equally weighted. "
              "Polar cells combine this (weight 0.4) with the share of the cell that is buildable, meaning slope of 10° or less at a 480 m baseline (none at 5 %, full at 60 %; weight 0.6)."),
        caveat="Screening at hundreds of metres to kilometres. Boulders and craters at lander scale are not resolved."),
    "moon_thermal": dict(
        fn=moon_thermal, label="Temperature conditions", short="Temp",
        question="Does the peak surface temperature stay within a range hardware handles easily?",
        inputs=["tmax"],
        rule="Peak surface temperature: full credit between 220 K and 330 K, falling to none at 120 K and at 400 K.",
        caveat="Uses the daytime peak only; night-time cold is not part of this criterion."),
    "moon_comm": dict(
        fn=moon_comm, label="Communication with Earth", short="Comms",
        question="How often is Earth above the horizon for direct radio contact?",
        inputs=["earth_vis"],
        rule="Equal to the fraction of time Earth is visible.",
        caveat="Relay satellites would remove this limit; it matters for direct-to-Earth links."),
    "moon_regolith": dict(
        fn=moon_regolith, label="Ilmenite feedstock", short="TiO₂",
        question="Is the regolith rich in titanium-bearing ilmenite for oxygen extraction?",
        inputs=["tio2_wt"],
        rule="TiO₂ abundance: none at 1 wt%, full credit at 8 wt%.",
        caveat="Relevant to hydrogen-reduction oxygen production only; other processes can use any regolith. The data average about 60 km."),
    # ------------------------------------------------------------------ Mars
    "mars_edl": dict(
        fn=mars_edl, label="Atmosphere for descent", short="Descent",
        question="Is the site low enough for the thin air to slow a lander?",
        inputs=["elev_mean", "ps_mean"],
        rule="Elevation: none at +1 km, full credit at −3 km and below.",
        caveat="Every successful landing to date sits below −1.4 km on this grid (highest: Opportunity)."),
    "mars_terrain": dict(
        fn=mars_terrain, label="Terrain safety", short="Terrain",
        question="Is the ground gentle enough to land and drive on?",
        inputs=["slope_med", "slope_p90", "rough_iqr"],
        rule="Slope at a 3.7 km baseline: median (none at 6°, full at 1°) and 90th percentile (none at 15°, full at 3°), equally weighted.",
        caveat="A 30 km cell can mix a flat landing plain with a crater wall; rocks and dunes are not resolved."),
    "mars_surface": dict(
        fn=mars_surface, label="Firm, low-dust ground", short="Ground",
        question="Is the surface load-bearing rather than deep loose dust?",
        inputs=["thermal_inertia", "albedo"],
        rule="Thermal inertia (none at 100, full at 250 J m⁻² K⁻¹ s⁻½; weight 0.6) and albedo (none at 0.28, full at 0.20; weight 0.4).",
        caveat="Model surface fields on a 330 km grid, originally from TES mapping."),
    "mars_dust": dict(
        fn=mars_dust, label="Clear skies", short="Dust",
        question="How much dust hangs in the air in a typical year?",
        inputs=["dust_tau", "dust_tau_max"],
        rule="Annual-mean dust optical depth: none at 0.55, full credit at 0.15.",
        caveat="Typical-year climatology; global dust storms are not included."),
    "mars_solar": dict(
        fn=mars_solar, label="Solar energy", short="Sun",
        question="How much sunlight reaches the ground over a year?",
        inputs=["solar_flux"],
        rule="Annual-mean surface solar flux: none at 60 W/m², full credit at 150 W/m².",
        caveat="Model value on a 330 km grid."),
    "mars_thermal": dict(
        fn=mars_thermal, label="Temperature conditions", short="Temp",
        question="How cold does the ground get?",
        inputs=["tmean", "tmin", "tmax"],
        rule="Annual mean (none at 180 K, full at 222 K) and coldest pre-dawn temperature (none at 148 K, full at 188 K), equally weighted.",
        caveat="Model climatology on a 330 km grid."),
    "mars_water": dict(
        fn=mars_water, label="Water and ice resources", short="Water",
        question="Is there a hydrogen signal that points to water ice or hydrated minerals?",
        inputs=["weh_wt"],
        rule="Water-equivalent hydrogen: none at 2.5 wt%, full credit at 6 wt%.",
        caveat="Averages several hundred kilometres and the top decimetres only. Not available poleward of about 57°."),
}


# =============================================================================
# Hard limits. fn returns True where the cell FAILS the limit.
# =============================================================================
def _nan_false(x):
    return np.where(np.isfinite(x), x, False).astype(bool)


LIMITS = {
    "moon_steep": dict(
        label="Too steep to build on",
        rule="Polar cells: less than 10 % of the cell has slope of 10° or less. Elsewhere: regional 90th-percentile slope above 20°.",
        why="Surface construction and repeated landings need a usable area of ground well inside vehicle tilt limits; 10° is a common planning value in lunar landing studies.",
        fn=lambda g: (_nan_false(g.a["flat_frac"] < 0.10) if g.kind == "polar" else _nan_false(g.a["slope_p90"] > 20.0))),
    "moon_shadow": dict(
        label="Mostly permanent shadow",
        rule="More than half of the cell never sees the Sun.",
        why="A crewed base inside permanent shadow has no solar power and sits at 40–100 K. Ice is reached from a sunlit site nearby.",
        fn=lambda g: _nan_false(g.a["psr_frac"] > 0.5)),
    "mars_high": dict(
        label="Above the datum",
        rule="Mean elevation above 0 km.",
        why="No landing has been made above −1.4 km; the limit leaves that margin beyond flight experience.",
        fn=lambda g: _nan_false(g.a["elev_mean"] > 0.0)),
    "mars_high_human": dict(
        label="Above +2 km",
        rule="Mean elevation above +2 km.",
        why="Screening value used in NASA's 2015 human Exploration Zone workshop call.",
        fn=lambda g: _nan_false(g.a["elev_mean"] > 2000.0)),
    "mars_lat50": dict(
        label="Poleward of 50°",
        rule="Latitude beyond 50° north or south.",
        why="Screening value used in NASA's 2015 human Exploration Zone workshop call (power and thermal limits).",
        fn=lambda g: np.abs(g.lat2d) > 50.0),
    "mars_steep": dict(
        label="Rugged terrain",
        rule="90th-percentile slope above 15° at a 3.7 km baseline.",
        why="A tenth of the cell steeper than 15° at this scale means crater walls, canyon sides or massifs across the area.",
        fn=lambda g: _nan_false(g.a["slope_p90"] > 15.0)),
    "mars_dustmantle": dict(
        label="Thick dust mantle",
        rule="Thermal inertia below 100 J m⁻² K⁻¹ s⁻½.",
        why="Very low thermal inertia marks metres of loose dust that may not bear a lander, the reason dust-mantled regions were excluded for past rovers.",
        fn=lambda g: _nan_false(g.a["thermal_inertia"] < 100.0)),
}

MISSIONS = {
    "lunar_base": dict(
        body="moon", label="Lunar permanent base",
        summary="A long-lived crewed outpost that needs power, a path to water ice, buildable ground and contact with Earth.",
        weights={"moon_ice": 0.30, "moon_solar": 0.25, "moon_terrain": 0.20, "moon_thermal": 0.10, "moon_comm": 0.10, "moon_regolith": 0.05},
        limits=["moon_steep", "moon_shadow"]),
    "mars_robotic": dict(
        body="mars", label="Mars robotic landing",
        summary="A lander or rover: safe descent and touchdown first, then power, mobility and a scientific reason to be there.",
        weights={"mars_terrain": 0.25, "mars_edl": 0.20, "mars_water": 0.15, "mars_surface": 0.15, "mars_solar": 0.10, "mars_dust": 0.08, "mars_thermal": 0.07},
        limits=["mars_high", "mars_steep", "mars_dustmantle"]),
    "mars_human": dict(
        body="mars", label="Mars human exploration",
        summary="A crewed surface mission: water to live on and make propellant, power, safe ground and a tolerable climate.",
        weights={"mars_water": 0.30, "mars_terrain": 0.18, "mars_solar": 0.12, "mars_edl": 0.12, "mars_thermal": 0.10, "mars_surface": 0.10, "mars_dust": 0.08},
        limits=["mars_lat50", "mars_high_human", "mars_steep"]),
}

# Minimum spacing between ranked sites, so a list shows different places.
RANK_SEPARATION_KM = {"moon": 60.0, "moon_sp": 25.0, "moon_np": 25.0, "mars": 400.0}


def normalise(weights: dict | None, mission: str) -> dict:
    base = MISSIONS[mission]["weights"]
    w = {k: max(0.0, float((weights or {}).get(k, base[k]))) for k in base}
    total = sum(w.values())
    if total <= 0:
        return {k: 1.0 / len(base) for k in base}
    return {k: v / total for k, v in w.items()}


class Engine:
    """Evaluates criteria once per grid (they do not depend on the weights) and
    combines them on demand, so moving a slider only costs a weighted sum."""

    def __init__(self, store: Store):
        self.store = store
        self._crit: dict[tuple[str, str], np.ndarray] = {}
        self._limit: dict[tuple[str, str], np.ndarray] = {}

    def criterion(self, gid: str, cid: str) -> np.ndarray:
        key = (gid, cid)
        if key not in self._crit:
            g = self.store.g[gid]
            with np.errstate(invalid="ignore"):
                a = CRITERIA[cid]["fn"](g)
            self._crit[key] = np.asarray(a, dtype=np.float32) if a is not None else np.full(g.shape, np.nan, np.float32)
        return self._crit[key]

    def limit(self, gid: str, lid: str) -> np.ndarray:
        key = (gid, lid)
        if key not in self._limit:
            g = self.store.g[gid]
            with np.errstate(invalid="ignore"):
                self._limit[key] = np.broadcast_to(np.asarray(LIMITS[lid]["fn"](g), dtype=bool), g.shape).copy()
        return self._limit[key]

    def grids_for(self, mission: str):
        from .catalog import BODIES
        return BODIES[MISSIONS[mission]["body"]]["grids"]

    def evaluate(self, gid: str, mission: str, weights: dict | None, limits_on: list[str] | None):
        """Return (score, coverage, excluded) arrays for one grid."""
        w = normalise(weights, mission)
        g = self.store.g[gid]
        num = np.zeros(g.shape, np.float64)
        cov = np.zeros(g.shape, np.float64)
        for cid, wi in w.items():
            s = self.criterion(gid, cid)
            ok = np.isfinite(s)
            num += np.where(ok, wi * s, 0.0)
            cov += np.where(ok, wi, 0.0)
        with np.errstate(invalid="ignore", divide="ignore"):
            score = np.where(cov >= MIN_COVERAGE, num / cov, np.nan)
        active = MISSIONS[mission]["limits"] if limits_on is None else [x for x in limits_on if x in MISSIONS[mission]["limits"]]
        excluded = np.zeros(g.shape, bool)
        for lid in active:
            excluded |= self.limit(gid, lid)
        return score, cov, excluded

    # ------------------------------------------------------------------ one cell
    def cell(self, g: Grid, i: int, j: int, mission: str, weights: dict | None, limits_on: list[str] | None):
        w = normalise(weights, mission)
        score, cov, excluded = self.evaluate(g.id, mission, weights, limits_on)
        s = float(score[i, j])
        factors = []
        for cid, wi in w.items():
            c = CRITERIA[cid]
            v = float(self.criterion(g.id, cid)[i, j])
            inputs = []
            for vid in c["inputs"]:
                if vid in g.vars:
                    inputs.append({"id": vid, "label": g.vars[vid]["label"], "unit": g.vars[vid]["unit"],
                                   "dec": g.vars[vid]["dec"], "fmt": g.vars[vid].get("fmt"), "value": g.value(vid, i, j),
                                   "evidence": g.vars[vid]["evidence"]})
            factors.append({"id": cid, "label": c["label"], "short": c["short"], "question": c["question"],
                            "weight": wi, "value": v if np.isfinite(v) else None, "grade": grade_of(v),
                            "contribution": wi * v if np.isfinite(v) else None,
                            "rule": c["rule"], "caveat": c["caveat"], "inputs": inputs})
        active = MISSIONS[mission]["limits"] if limits_on is None else [x for x in limits_on if x in MISSIONS[mission]["limits"]]
        failed = [{"id": lid, "label": LIMITS[lid]["label"], "rule": LIMITS[lid]["rule"], "why": LIMITS[lid]["why"]}
                  for lid in active if bool(self.limit(g.id, lid)[i, j])]
        return {
            "mission": mission, "score": s if np.isfinite(s) else None, "grade": grade_of(s),
            "meaning": GRADE_MEANING.get(grade_of(s) or "", None),
            "coverage": float(cov[i, j]), "excluded": bool(excluded[i, j]), "failed_limits": failed,
            "factors": factors,
        }

    # ------------------------------------------------------------------ ranking
    def rank(self, mission: str, weights: dict | None, limits_on: list[str] | None, n: int = 12):
        cands = []
        stats = {"cells": 0, "graded": 0, "excluded": 0, "grades": {k: 0 for k, _ in GRADE_EDGES}}
        for gid in self.grids_for(mission):
            g = self.store.g[gid]
            score, cov, excluded = self.evaluate(gid, mission, weights, limits_on)
            usable = g.valid & np.isfinite(score)
            stats["cells"] += int(g.valid.sum())
            stats["graded"] += int(usable.sum())
            stats["excluded"] += int((usable & excluded).sum())
            sc = np.where(usable & ~excluded, score, np.nan)
            for k, edge in GRADE_EDGES:
                pass
            vals = sc[np.isfinite(sc)]
            prev = np.inf
            for k, edge in GRADE_EDGES:
                stats["grades"][k] += int(((vals >= edge) & (vals < prev)).sum())
                prev = edge
            flat = sc.ravel()
            idx = pick_distinct(flat, g.lat2d.ravel(), g.lon2d.ravel(), g.radius_km, RANK_SEPARATION_KM[gid], n)
            for k in idx:
                i, j = divmod(int(k), g.shape[1])
                cands.append((float(flat[k]), gid, i, j))
        cands.sort(key=lambda t: -t[0])
        return cands[:n], stats
