"""RADIUM API (FastAPI).

Run:  uvicorn backend.app:app --port 8000
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from . import briefs, catalog, reference, registry, render, sites
from .geo import RADIUS_KM, fmt_latlon, gc_km, pick_distinct
from .naming import Earth as EarthNames
from .naming import Planetary
from .similarity import (custom_weights, A_HIGHLAND, A_MARE, A_MARS, AFFINITY_NOTES, DIMENSIONS, MIN_COVERAGE as SIM_MIN_COVERAGE,
                         PURPOSES, SEPARATION_KM, Twin, purpose_applicable)
from .store import DATA, Store
from .suitability import (CRITERIA, GRADE_EDGES, GRADE_MEANING, LIMITS, MIN_COVERAGE, MISSIONS, RANK_SEPARATION_KM,
                          Engine, grade_of, normalise)

app = FastAPI(title="RADIUM API", version="1.0")
app.add_middleware(GZipMiddleware, minimum_size=2000)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

store = Store()
engine = Engine(store)
twin = Twin(store)
pnames = {"moon": Planetary("moon"), "mars": Planetary("mars")}
enames = EarthNames()
PINS = {"moon": reference.moon_pins(pnames["moon"]), "mars": reference.mars_pins(pnames["mars"]), "earth": reference.earth_pins()}
DOCUMENTED_EARTH = [p for p in PINS["earth"] if sites.documented(p)]
TREK = json.loads((DATA / "layers_trek.json").read_text())
DOC_RADIUS_KM = 150.0


def clean(o):
    """Make numpy / NaN values JSON-safe."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return f if math.isfinite(f) else None
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    return o


def need_body(body: str, planetary: bool = False):
    ok = ("moon", "mars") if planetary else ("moon", "mars", "earth")
    if body not in ok:
        raise HTTPException(400, f"body must be one of {ok}")


def need_coordinates(lat: float, lon: float):
    if not (math.isfinite(lat) and math.isfinite(lon)):
        raise HTTPException(422, "latitude and longitude must be finite numbers")
    if not -90 <= lat <= 90:
        raise HTTPException(422, "latitude must be between -90 and 90")


def place_label(body: str, lat: float, lon: float):
    if body == "earth":
        return enames.place(lat, lon)
    return pnames[body].context(lat, lon)


def parse_weights(w: Optional[str]):
    if not w:
        return None
    try:
        d = json.loads(w)
        return {str(k): float(v) for k, v in d.items()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"weights must be a JSON object: {e}") from e


def parse_limits(limits: Optional[str]):
    if limits is None:
        return None
    return [x for x in limits.split(",") if x]


# =============================================================================
# Metadata
# =============================================================================
def grid_layers(body: str):
    """RADIUM's own data layers: variables of the processed grids that carry a
    colour scale. For the Moon a layer is listed if the global grid has it."""
    gid = "earth" if body == "earth" else body
    out = []
    for vid, m in catalog.VARS[gid].items():
        if "layer" not in m:
            continue
        lay = m["layer"]
        polar = body == "moon" and vid in catalog.VARS["moon_sp"] and "layer" in catalog.VARS["moon_sp"][vid]
        out.append({
            "id": vid, "kind": "grid", "group": m["cat"], "title": m["label"], "description": m["desc"],
            "unit": m["unit"], "fmt": m.get("fmt"), "evidence": m["evidence"], "source": m["source"], "res": m["res"],
            "caveat": m.get("caveat"), "legend": {"stops": render.legend_stops(lay["cmap"]), "min": lay["vmin"], "max": lay["vmax"], "log": lay["log"]},
            "has_polar": polar,
            "polar_legend": None if polar else ({"stops": render.legend_stops(catalog.VARS["moon_sp"][vid]["layer"]["cmap"]),
                              "min": catalog.VARS["moon_sp"][vid]["layer"]["vmin"], "max": catalog.VARS["moon_sp"][vid]["layer"]["vmax"],
                              "log": catalog.VARS["moon_sp"][vid]["layer"]["log"]} if polar else None),
        })
    if body == "moon":            # layers that exist only on the polar grids
        for vid, m in catalog.VARS["moon_sp"].items():
            if "layer" in m and vid not in catalog.VARS["moon"]:
                lay = m["layer"]
                out.append({
                    "id": vid, "kind": "grid", "group": m["cat"], "title": m["label"] + " (polar)", "description": m["desc"],
                    "unit": m["unit"], "fmt": m.get("fmt"), "evidence": m["evidence"], "source": m["source"], "res": m["res"],
                    "caveat": m.get("caveat"), "legend": None, "has_polar": True, "polar_only": True,
                    "polar_legend": {"stops": render.legend_stops(lay["cmap"]), "min": lay["vmin"], "max": lay["vmax"], "log": lay["log"]},
                })
    return out


EARTH_BASEMAPS = [
    {"id": "s2cloudless", "title": "Sentinel-2 cloudless", "provider": "EOX IT Services / Copernicus",
     "url": "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg", "max_zoom": 13,
     "attribution": "Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016 & 2017), CC BY 4.0",
     "description": "Cloud-free true-colour mosaic from Copernicus Sentinel-2, about 10 m."},
    {"id": "esri_world_imagery", "title": "Esri World Imagery", "provider": "Esri / Earthstar Geographics",
     "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", "max_zoom": 17,
     "attribution": "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
     "description": "Satellite and aerial imagery; resolution and acquisition date vary by location. Display only."},
    {"id": "bluemarble", "title": "Blue Marble", "provider": "NASA GIBS",
     "url": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg", "max_zoom": 8,
     "attribution": "NASA Blue Marble, NASA EOSDIS GIBS",
     "description": "NASA true-colour composite with shaded relief and bathymetry, 500 m."},
]


@lru_cache(maxsize=1)
def _meta():
    missions = []
    for mid, m in MISSIONS.items():
        missions.append({
            "id": mid, "body": m["body"], "label": m["label"], "summary": m["summary"],
            "criteria": [{"id": cid, "label": CRITERIA[cid]["label"], "short": CRITERIA[cid]["short"],
                          "question": CRITERIA[cid]["question"], "rule": CRITERIA[cid]["rule"], "caveat": CRITERIA[cid]["caveat"],
                          "weight": w} for cid, w in m["weights"].items()],
            "limits": [{"id": lid, "label": LIMITS[lid]["label"], "rule": LIMITS[lid]["rule"], "why": LIMITS[lid]["why"]} for lid in m["limits"]],
        })
    purposes = {b: [{"id": pid, "label": p["label"], "blurb": p["blurb"],
                     "weights": {d: w / sum(p["w"].values()) for d, w in p["w"].items()}} for pid, p in ps.items()]
                for b, ps in PURPOSES.items()}
    grades = []
    for k, (g, edge) in enumerate(GRADE_EDGES):
        grades.append({"grade": g, "min": edge, "meaning": GRADE_MEANING[g], "color": render.GRADE_COLORS[g]})
    return clean({
        "bodies": {b: {**v, "gravity": {"moon": 1.62, "mars": 3.71, "earth": 9.81}[b]} for b, v in catalog.BODIES.items()},
        "evidence": catalog.EVIDENCE,
        "coverage_thresholds": {"suitability": MIN_COVERAGE, "similarity": SIM_MIN_COVERAGE},
        "overlay_rendering": {
            "continuous_ramp": render.CONTINUOUS_RAMP,
            "direction": "Low to high physical value; colour is not a suitability grade",
            "alpha": f"235 × ({render.ALPHA_LOW} + {1 - render.ALPHA_LOW:.2f} × t^{render.ALPHA_EXPONENT}) / 255, multiplied by the layer opacity control",
            "legend": "RGBA stops use the same colour lookup table and alpha transfer as rendered pixels",
            "exceptions": "Albedo remains greyscale reflectance; categorical suitability and similarity grades retain their A–F colours",
        },
        "categories": [{"id": c, "label": l} for c, l in catalog.CATEGORIES],
        "grades": grades,
        "missions": missions,
        "purposes": purposes,
        "dimensions": {k: {"label": v["label"], "comparable": v["comparable"], "how": v["how"]} for k, v in DIMENSIONS.items()},
        "layers": {
            "moon": {"tiles": TREK["moon"], "grid": grid_layers("moon")},
            "mars": {"tiles": TREK["mars"], "grid": grid_layers("mars")},
            "earth": {"tiles": EARTH_BASEMAPS, "grid": grid_layers("earth")},
        },
        "cap": {"edge_lat": render.CAP_EDGE_LAT, "boxes": _polar_boxes()},
        "sources_index": {s["id"]: {"name": s["name"], "url": s["url"], "agency": s["agency"]} for s in registry.SOURCES},
    })


@app.get("/api/meta")
def meta():
    return _meta()


@app.get("/api/sources")
def sources():
    return {"sources": registry.SOURCES, "not_used": registry.NOT_USED,
            "site_sources": [{"site_id": p["id"], "name": p["name"], "body": p["body"],
                              "verification_status": p["verification_status"], "sources": p["sources"]}
                             for pins in PINS.values() for p in pins],
            "catalogue": sites.summary()}


@app.get("/api/methodology")
def methodology():
    val = {gid: g.meta.get("validation", {}) for gid, g in store.g.items()}
    lith = {code: name for _, (code, name) in catalog.LITH_CLASSES.items()}
    return clean({
        "grade_edges": [{"grade": g, "min": e, "meaning": GRADE_MEANING[g]} for g, e in GRADE_EDGES],
        "suitability": {
            "min_coverage": MIN_COVERAGE, "rank_separation_km": RANK_SEPARATION_KM,
            "criteria": {cid: {k: c[k] for k in ("label", "question", "rule", "caveat", "inputs")} for cid, c in CRITERIA.items()},
            "limits": {lid: {k: l[k] for k in ("label", "rule", "why")} for lid, l in LIMITS.items()},
            "missions": {mid: {"label": m["label"], "body": m["body"], "weights": m["weights"], "limits": m["limits"]} for mid, m in MISSIONS.items()},
        },
        "similarity": {
            "min_coverage": SIM_MIN_COVERAGE, "separation_km": SEPARATION_KM, "dimensions": DIMENSIONS,
            "reverse": {
                "endpoint": "/api/twin/reverse", "evidence": "computed",
                "method": "Evaluate the existing pairwise Earth Twin model over every valid planetary grid cell against one fixed Earth land cell; no interpolation.",
                "coverage_threshold": SIM_MIN_COVERAGE, "weights": "Default research-purpose weights for each world; no new overall score.",
                "separation_km": {body: RANK_SEPARATION_KM[body] for body in ("moon", "mars")},
                "catalog": "Research sites are listed separately from screened grid-cell matches, using their actual analysis cells.",
                "curated_count": "Number of assessed, verified Earth analogs for that world scoring below the Earth cell for the explicitly named best-matched planetary target.",
                "limits": "Reverses search direction, not a generic symmetric metric. Gravity, pressure and radiation remain excluded and disclosed.",
                "analog_envelope": "Not assessed: no calibrated Earth analog-suitability envelope or interpolation of curated qualitative grades is introduced.",
            },
            "purposes": {b: {pid: {"label": p["label"], "weights": p["w"]} for pid, p in ps.items()} for b, ps in PURPOSES.items()},
            "affinity": {"classes": lith, "mare": A_MARE, "highland": A_HIGHLAND, "mars": A_MARS, "notes": AFFINITY_NOTES},
        },
        "validation": val,
        "grids": {gid: {"cells": int(g.valid.sum()), "shape": list(g.shape), "cell_km": g.meta.get("cell_km")} for gid, g in store.g.items()},
        "earth_reclassified_ice_cells": int(store.g["earth"].a["ice_reclassified"].sum()),
        "reference_sites": len(reference.EARTH_ANALOGS),
        "site_catalogue": sites.summary(),
    })


@app.get("/api/pins")
def pins(body: str):
    need_body(body)
    return {"pins": PINS[body]}


@app.get("/api/sites")
def site_catalogue(body: Optional[str] = None, q: str = Query("", max_length=100),
                   classification: Optional[str] = None, verified: bool = False):
    if body is not None:
        need_body(body)
    records = [p for b, pins in PINS.items() if body is None or b == body for p in pins]
    if q.strip():
        records = [p for p in records if sites.matches(p, q)]
    if classification:
        records = [p for p in records if p["classification"] == classification]
    if verified:
        records = [p for p in records if p["verification_status"] == "verified"]
    return {"sites": records, "catalogue": sites.summary()}


@app.get("/api/search")
def search(body: str, q: str = Query("", max_length=60)):
    need_body(body)
    q = q.strip()
    res = enames.search(q) if body == "earth" else pnames[body].search(q)
    labels = {"historical_mission": "Historical landing site", "candidate_region": "Studied candidate region",
              "geological_research_region": "Named geological region", "terrestrial_analog": "Documented analog site",
              "research_candidate": "Research site · evidence review needed"}
    curated = [{**p, "type": labels[p["classification"]]} for p in PINS[body] if sites.matches(p, q)]
    curated.sort(key=lambda p: (not sites.normalise_text(p["name"]).startswith(sites.normalise_text(q)), p["name"]))
    # The curated coordinates take precedence over older gazetteer snapshots.
    names = {p["name"].casefold() for p in curated}
    return {"results": (curated + [p for p in res if p["name"].casefold() not in names])[:14]}


# =============================================================================
# One location
# =============================================================================
def suitability_for(g, i, j, mission, weights, limits):
    if mission is None or MISSIONS.get(mission, {}).get("body") != g.body:
        return None
    return engine.cell(g, i, j, mission, weights, limits)


@app.get("/api/cell")
def cell(body: str, lat: float, lon: float, mission: Optional[str] = None, w: Optional[str] = None,
         limits: Optional[str] = None):
    need_body(body)
    need_coordinates(lat, lon)
    if not (-90 <= lat <= 90):
        raise HTTPException(400, "lat out of range")
    lon = ((lon + 180.0) % 360.0) - 180.0
    g, i, j = store.locate(body, lat, lon)
    d = store.describe(g, i, j)
    clat, clon = g.centre(i, j)
    d["place"] = place_label(body, clat, clon)
    d["coords"] = fmt_latlon(clat, clon)
    d["query"] = {"lat": lat, "lon": lon}
    d["analysed"] = bool(g.valid[i, j])
    if body == "earth" and not d["analysed"]:
        d["note"] = "This cell is mostly water, so RADIUM does not analyse it."
    d["suitability"] = suitability_for(g, i, j, mission, parse_weights(w), parse_limits(limits))
    near = []
    for p in PINS[body]:
        dist = float(gc_km(clat, clon, p["lat"], p["lon"], RADIUS_KM[body]))
        if dist < (DOC_RADIUS_KM if body == "earth" else 60.0):
            near.append({**p, "distance_km": dist})
    d["nearby_pins"] = sorted(near, key=lambda x: x["distance_km"])[:3]
    return clean(d)


# =============================================================================
# Suitability ranking
# =============================================================================
class RankRequest(BaseModel):
    mission: str
    weights: Optional[dict] = None
    limits: Optional[list] = None
    prev_weights: Optional[dict] = None
    prev_limits: Optional[list] = None
    n: int = 12
    # Scenario comparison: grade these places under this request's weights and limits too.
    probe: Optional[list] = None


def site_card(g, i, j, mission, weights, limits):
    c = engine.cell(g, i, j, mission, weights, limits)
    lat, lon = g.centre(i, j)
    return {
        "id": f"{g.id}:{i}:{j}", "grid": g.id, "lat": lat, "lon": lon, "coords": fmt_latlon(lat, lon),
        "place": pnames[g.body].context(lat, lon)["label"], "score": c["score"], "grade": c["grade"],
        "coverage": c["coverage"], "min_coverage": MIN_COVERAGE, "cell_km": g.size_km(i),
        "factors": [{"id": f["id"], "short": f["short"], "label": f["label"], "value": f["value"], "grade": f["grade"],
                     "weight": f["weight"], "contribution": f["contribution"], "inputs": f["inputs"]} for f in c["factors"]],
    }


@app.post("/api/rank")
def rank(req: RankRequest):
    if req.mission not in MISSIONS:
        raise HTTPException(400, "unknown mission")
    n = max(3, min(int(req.n), 30))
    w = normalise(req.weights, req.mission)
    top, stats = engine.rank(req.mission, req.weights, req.limits, n)
    sites = [site_card(store.g[gid], i, j, req.mission, req.weights, req.limits) for _, gid, i, j in top]
    for k, s in enumerate(sites):
        s["rank"] = k + 1

    change = None
    if req.prev_weights is not None:
        pw = normalise(req.prev_weights, req.mission)
        ptop, _ = engine.rank(req.mission, req.prev_weights, req.prev_limits, n)
        prev_rank = {f"{gid}:{i}:{j}": k + 1 for k, (_, gid, i, j) in enumerate(ptop)}
        moved = sorted(((cid, w[cid] - pw[cid]) for cid in w), key=lambda t: -abs(t[1]))
        moved = [(cid, d) for cid, d in moved if abs(d) >= 0.005]
        for s in sites:
            s["prev_rank"] = prev_rank.get(s["id"])
            g = store.g[s["grid"]]
            _, i, j = s["id"].split(":")
            pc = engine.cell(g, int(i), int(j), req.mission, req.prev_weights, req.prev_limits)
            s["prev_grade"] = pc["grade"]
            s["prev_score"] = pc["score"]
            drivers = []
            for f in s["factors"]:
                dw = w[f["id"]] - pw[f["id"]]
                if f["value"] is not None and abs(dw) >= 0.005:
                    drivers.append({"id": f["id"], "label": f["label"], "delta_weight": dw, "value": f["value"],
                                    "effect": dw * f["value"]})
            s["drivers"] = sorted(drivers, key=lambda d: -abs(d["effect"]))[:2]
        # Which sliders did the user actually move? Compare the raw values sent;
        # the other shares change only because weights are renormalised to 100 %.
        base = MISSIONS[req.mission]["weights"]
        raw_new = {c: float((req.weights or {}).get(c, base[c])) for c in base}
        raw_old = {c: float((req.prev_weights or {}).get(c, base[c])) for c in base}
        touched = sorted((c for c in base if abs(raw_new[c] - raw_old[c]) > 1e-9), key=lambda c: -abs(w[c] - pw[c]))
        gone = [k for k in prev_rank if k not in {s['id'] for s in sites}]
        new = [s for s in sites if s["prev_rank"] is None]
        summary = None
        if touched:
            bits = [f"{'raised' if raw_new[c] > raw_old[c] else 'lowered'} {CRITERIA[c]['label']} to {w[c]:.0%} of the score (was {pw[c]:.0%})"
                    for c in touched[:3]]
            summary = "You " + ", and ".join(bits) + "."
            if len(touched) < len(base):
                summary += " The other criteria changed share in proportion."
            lead = touched[0]
            summary += (f" Sites strong on {CRITERIA[lead]['label']} moved up." if raw_new[lead] > raw_old[lead]
                        else f" Sites that relied on {CRITERIA[lead]['label']} moved down.")
        limits_changed = sorted(req.prev_limits if req.prev_limits is not None else base and MISSIONS[req.mission]["limits"]) != \
            sorted(req.limits if req.limits is not None else MISSIONS[req.mission]["limits"])
        if limits_changed:
            summary = (summary + " " if summary else "") + "Hard limits changed, so different cells are eligible."
        if summary:
            if new:
                summary += f" {len(new)} site{'s' if len(new) != 1 else ''} entered the top {len(sites)} and {len(gone)} left."
            elif any(s["prev_rank"] != s["rank"] for s in sites):
                summary += " The same sites remain, in a new order."
            else:
                summary += " The top sites and their order did not change."
        change = {"summary": summary, "weights_before": pw, "entered": len(new), "left": len(gone)}

    probes = []
    for q in (req.probe or [])[:40]:
        try:
            plat, plon = float(q["lat"]), float(q["lon"])
        except (KeyError, TypeError, ValueError):
            raise HTTPException(422, "each probe needs numeric lat and lon")
        if not (math.isfinite(plat) and math.isfinite(plon)) or abs(plat) > 90:
            raise HTTPException(422, "probe latitude must be within -90..90")
        g, i, j = store.locate(MISSIONS[req.mission]["body"], plat, plon)
        c = engine.cell(g, i, j, req.mission, req.weights, req.limits)
        rid = f"{g.id}:{i}:{j}"
        probes.append({"id": rid, "lat": plat, "lon": plon, "score": c["score"], "grade": c["grade"], "coverage": c["coverage"],
                       "excluded": bool(c.get("excluded")), "failed_limits": [l["id"] for l in c.get("failed_limits", [])],
                       "rank": next((s_["rank"] for s_ in sites if s_["id"] == rid), None)})

    return clean({"mission": req.mission, "weights": w, "sites": sites, "stats": stats, "change": change, "probes": probes,
                  "limits": MISSIONS[req.mission]["limits"] if req.limits is None else req.limits})


# =============================================================================
# Earth Twin
# =============================================================================
class TwinRequest(BaseModel):
    body: str
    lat: float
    lon: float
    purpose: str = "general"
    n: int = 10
    weights: Optional[dict] = None   # user override of the purpose's dimension weights (0–100 each)


class CompareRequest(TwinRequest):
    earth_lat: float
    earth_lon: float


def nearest_documented(lat, lon, body):
    best = None
    for p in DOCUMENTED_EARTH:
        d = float(gc_km(lat, lon, p["lat"], p["lon"], RADIUS_KM["earth"]))
        if d <= DOC_RADIUS_KM and (best is None or d < best["distance_km"]):
            best = {"name": p["name"], "distance_km": d, "source": p["source"], "theme": p["theme"],
                    "site_id": p["id"], "sources": p["sources"], "verification_status": p["verification_status"],
                    "relationship": "Nearby documented research site; proximity does not establish an identical field location or analogy.",
                    "for_this_body": body in p["bodies"]}
    return best


def req_weights(req):
    try:
        return custom_weights(req.body, req.purpose, getattr(req, "weights", None))
    except ValueError as e:
        raise HTTPException(422, str(e))


def twin_setup(req: TwinRequest):
    need_body(req.body, planetary=True)
    need_coordinates(req.lat, req.lon)
    if hasattr(req, "earth_lat"):
        need_coordinates(req.earth_lat, req.earth_lon)
    if req.purpose not in PURPOSES[req.body]:
        raise HTTPException(400, f"purpose must be one of {list(PURPOSES[req.body])}")
    g, i, j = store.locate(req.body, req.lat, req.lon)
    p, dims, score, cov = twin.score_all(g, i, j, req.purpose, req_weights(req))
    return g, i, j, p, dims, score, cov


def why_text(ex):
    scored = [d for d in ex["dimensions"] if d["score"] is not None and d["weight"] > 0]
    top = sorted(scored, key=lambda d: -(d["weight"] * d["score"]))[:2]
    low = sorted(scored, key=lambda d: d["score"])[:1]
    s = "Ranks here because " + " and ".join(f"{d['label'].lower()} ({d['grade']})" for d in top) + " carry the match"
    if low and low[0]["score"] < 0.45 and low[0] not in top:
        s += f"; {low[0]['label'].lower()} ({low[0]['grade']}) holds it back"
    return s + "."


@app.post("/api/twin")
def twin_search(req: TwinRequest):
    g, i, j, p, dims, score, cov = twin_setup(req)
    plat, plon = g.centre(i, j)
    if score is None:
        raise HTTPException(422, "No comparable data for this planetary cell.")
    n = max(3, min(int(req.n), 20))
    e = store.g["earth"]
    cands = []
    for ei, ej in twin.top(score, n):
        lat, lon = e.centre(ei, ej)
        ex = twin.explain(p, dims, ei, ej, req.purpose, req_weights(req))
        doc = nearest_documented(lat, lon, req.body)
        cands.append({
            "id": f"earth:{ei}:{ej}", "lat": lat, "lon": lon, "coords": fmt_latlon(lat, lon), "place": enames.place(lat, lon),
            "score": ex["score"], "grade": ex["grade"], "coverage": ex["coverage"], "strong": ex["strong"], "weak": ex["weak"],
            "dimensions": [{k: d[k] for k in ("id", "label", "score", "grade", "weight")} for d in ex["dimensions"]],
            "fitness": [{k: f[k] for k in ("id", "label", "grade", "score")} for f in ex["fitness"]],
            "documented": doc, "novel": doc is None, "why": why_text(ex),
        })
    for k, c in enumerate(cands):
        c["rank"] = k + 1

    documented = []
    for site in DOCUMENTED_EARTH:
        ei, ej = e.index(site["lat"], site["lon"])
        v = float(score[ei, ej])
        ex = twin.explain(p, dims, ei, ej, req.purpose, req_weights(req))
        documented.append({"name": site["name"], "country": site["country"], "lat": site["lat"], "lon": site["lon"],
                           "site_id": site["id"], "sources": site["sources"], "verification_status": site["verification_status"],
                           "theme": site["theme"], "source": site["source"], "for_this_body": req.body in site["bodies"],
                           "score": ex["score"], "grade": ex["grade"], "strong": ex["strong"], "weak": ex["weak"],
                           "analysed": bool(e.valid[ei, ej]) and math.isfinite(v)})
    documented.sort(key=lambda d: -(d["score"] if d["score"] is not None else -1))

    applicable, purpose_note = purpose_applicable(req.purpose, p)
    w = req_weights(req) or PURPOSES[req.body][req.purpose]["w"]
    tw = sum(w.values())
    dim_status = [{"id": d, "label": DIMENSIONS[d]["label"], "weight": wd / tw, "available": dims.get(d) is not None}
                  for d, wd in w.items()]
    return clean({
        "planet": {"body": req.body, "grid": g.id, "lat": plat, "lon": plon, "coords": fmt_latlon(plat, plon),
                   "place": pnames[req.body].context(plat, plon), "profile": p, "cell_km": g.size_km(i)},
        "purpose": req.purpose, "purpose_applicable": applicable, "purpose_note": purpose_note,
        "custom_weights": req_weights(req) is not None,
        "purposes": [{"id": pid, "applicable": purpose_applicable(pid, p)[0], "note": purpose_applicable(pid, p)[1]}
                     for pid in PURPOSES[req.body]],
        "dimensions": dim_status,
        "planet_coverage": sum(d["weight"] for d in dim_status if d["available"]),
        "candidates": cands, "documented": documented, "distribution": twin.distribution(score),
        "separation_km": SEPARATION_KM,
    })


@app.post("/api/twin/compare")
def twin_compare(req: CompareRequest):
    g, i, j, p, dims, score, cov = twin_setup(req)
    e = store.g["earth"]
    ei, ej = e.index(req.earth_lat, req.earth_lon)
    elat, elon = e.centre(ei, ej)
    ex = twin.explain(p, dims, ei, ej, req.purpose, req_weights(req))
    plat, plon = g.centre(i, j)
    pd = store.describe(g, i, j)
    ed = store.describe(e, ei, ej)
    rank_among = None
    if score is not None and ex["score"] is not None:
        v = score[np.isfinite(score)]
        rank_among = {"better_cells": int((v > ex["score"]).sum()), "cells": int(v.size)}
    return clean({
        "planet": {**pd, "place": pnames[req.body].context(plat, plon), "coords": fmt_latlon(plat, plon)},
        "earth": {**ed, "place": enames.place(elat, elon), "coords": fmt_latlon(elat, elon), "analysed": bool(e.valid[ei, ej])},
        "purpose": req.purpose, "match": ex, "documented": nearest_documented(elat, elon, req.body),
        "rank_among": rank_among, "why": why_text(ex) if ex["score"] is not None else None,
    })


class ReverseTwinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lat: float
    lon: float
    purpose: str = "general"
    n: int = Field(default=5, ge=1, le=10)
    body: Optional[str] = None


@app.post("/api/twin/reverse")
def reverse_twin(req: ReverseTwinRequest):
    need_coordinates(req.lat, req.lon)
    bodies = [req.body] if req.body else ["moon", "mars"]
    if any(body not in PURPOSES for body in bodies):
        raise HTTPException(422, "body must be moon or mars, or omitted to search both")
    if not any(req.purpose in PURPOSES[body] for body in bodies):
        raise HTTPException(422, "Unknown research purpose for the requested worlds")
    from .reverse import search  # Optional code and arrays load only when requested.
    return clean(search(store, twin, PINS, pnames, enames, lat=req.lat, lon=(req.lon + 180) % 360 - 180,
                        purpose=req.purpose, n=req.n, bodies=bodies))


# =============================================================================
# Near Me: documented analog sites by distance, or the best analogs within a radius
# =============================================================================
EARTH_CIRCUMFERENCE_HALF_KM = math.pi * RADIUS_KM["earth"]


class NearbyRequest(BaseModel):
    lat: float
    lon: float
    radius_km: float = 1000.0
    mode: str = "nearest"            # "nearest" (geographic) or "best" (similarity within radius)
    body: Optional[str] = None       # Moon or Mars target, needed for similarity
    target_lat: Optional[float] = None
    target_lon: Optional[float] = None
    purpose: str = "general"
    documented_only: bool = False
    limit: int = 20
    weights: Optional[dict] = None


@lru_cache(maxsize=1)
def _earth_centres():
    e = store.g["earth"]
    lat = 90.0 - e.dlat * (np.arange(e.n_lat) + 0.5)
    lon = -180.0 + e.dlon * (np.arange(e.n_lon) + 0.5)
    return np.repeat(lat, e.n_lon), np.tile(lon, e.n_lat)


@lru_cache(maxsize=16)
def _twin_score(gid: str, i: int, j: int, purpose: str, wkey: str = ""):
    """Earth Twin score for every Earth cell (the same array /api/twin ranks), cached per target, purpose and weights."""
    p, dims, score, cov = twin.score_all(store.g[gid], i, j, purpose, json.loads(wkey) if wkey else None)
    return p, dims, score


def _validate_nearby(req: NearbyRequest):
    for name in ("lat", "lon", "radius_km"):
        if not math.isfinite(getattr(req, name)):
            raise HTTPException(422, f"{name} must be a finite number")
    if not -90.0 <= req.lat <= 90.0:
        raise HTTPException(422, "latitude must be between -90 and 90")
    if req.mode not in ("nearest", "best"):
        raise HTTPException(422, "mode must be 'nearest' or 'best'")
    if not 10.0 <= req.radius_km <= EARTH_CIRCUMFERENCE_HALF_KM + 1:
        raise HTTPException(422, f"radius_km must be between 10 and {EARTH_CIRCUMFERENCE_HALF_KM:.0f}")
    lon = ((req.lon + 180.0) % 360.0) - 180.0
    limit = max(1, min(int(req.limit), 50))
    target = None
    if req.body is not None:
        need_body(req.body, planetary=True)
        if req.purpose not in PURPOSES[req.body]:
            raise HTTPException(422, f"purpose must be one of {list(PURPOSES[req.body])}")
        if req.target_lat is None or req.target_lon is None or not (math.isfinite(req.target_lat) and math.isfinite(req.target_lon)):
            raise HTTPException(422, "a Moon or Mars target needs target_lat and target_lon")
        if abs(req.target_lat) > 90:
            raise HTTPException(422, "target latitude must be between -90 and 90")
        target = store.locate(req.body, req.target_lat, req.target_lon)
    if req.mode == "best" and target is None:
        raise HTTPException(422, "Ranking by similarity needs a Moon or Mars target; choose one, or rank by distance instead.")
    return lon, limit, target


@app.post("/api/analogs/nearby")
def analogs_nearby(req: NearbyRequest):
    lon, limit, target = _validate_nearby(req)
    lat = req.lat
    e = store.g["earth"]
    p = dims = score = None
    cw = None
    tinfo = None
    if target is not None:
        g, i, j = target
        cw = req_weights(req)
        p, dims, score = _twin_score(g.id, i, j, req.purpose, json.dumps(cw, sort_keys=True) if cw else "")
        tlat, tlon = g.centre(i, j)
        tinfo = {"body": req.body, "lat": tlat, "lon": tlon, "coords": fmt_latlon(tlat, tlon),
                 "label": pnames[req.body].context(tlat, tlon)["label"], "purpose": req.purpose,
                 "purpose_label": PURPOSES[req.body][req.purpose]["label"],
                 "score_context": f"{'Moon' if req.body == 'moon' else 'Mars'} {PURPOSES[req.body][req.purpose]['label'].lower()} similarity",
                 "comparable": score is not None}

    def similarity_at(slat, slon):
        if score is None:
            return None
        ei, ej = e.index(slat, slon)
        ex = twin.explain(p, dims, ei, ej, req.purpose, cw)
        return {"score": ex["score"], "grade": ex["grade"], "coverage": ex["coverage"], "strong": ex["strong"], "weak": ex["weak"]}

    # Documented sites: straight-line (great-circle) distance on Earth's surface.
    docs = []
    for site in DOCUMENTED_EARTH:
        d = float(gc_km(lat, lon, site["lat"], site["lon"], RADIUS_KM["earth"]))
        if d <= req.radius_km:
            docs.append({"kind": "documented", "name": site["name"], "country": site["country"], "lat": site["lat"], "lon": site["lon"],
                         "site_id": site["id"], "sources": site["sources"], "verification_status": site["verification_status"],
                         "coords": fmt_latlon(site["lat"], site["lon"]), "distance_km": d, "theme": site["theme"],
                         "tags": site["tags"], "source": site["source"], "bodies": site["bodies"]})
    for dd in docs:
        sim = similarity_at(dd["lat"], dd["lon"])
        dd["similarity"] = sim

    regions = []
    if req.mode == "best":
        if score is None:
            raise HTTPException(422, "This Moon or Mars cell has too little data to compare; choose another target.")
        if not req.documented_only:
            clat, clon = _earth_centres()
            dist = gc_km(lat, lon, clat, clon, RADIUS_KM["earth"])
            flat = score.ravel()
            masked = np.where((dist <= req.radius_km) & np.isfinite(flat), flat, np.nan)
            sep = float(min(300.0, max(30.0, req.radius_km / 8.0)))
            for k in pick_distinct(masked, clat, clon, RADIUS_KM["earth"], sep, limit):
                ei, ej = divmod(int(k), e.n_lon)
                rlat, rlon = e.centre(ei, ej)
                sim = similarity_at(rlat, rlon)
                regions.append({"kind": "modelled_region", "lat": rlat, "lon": rlon, "coords": fmt_latlon(rlat, rlon),
                                "place": enames.place(rlat, rlon)["label"], "distance_km": float(dist[k]), "cell_km": e.size_km(ei),
                                "similarity": sim, "documented_nearby": nearest_documented(rlat, rlon, req.body)})
        docs = [d for d in docs if d["similarity"] and d["similarity"]["score"] is not None]
        docs.sort(key=lambda d: (-d["similarity"]["score"], d["distance_km"], d["name"]))
        regions.sort(key=lambda r: (-r["similarity"]["score"], r["distance_km"]))
    else:
        docs.sort(key=lambda d: (d["distance_km"], d["name"]))

    return clean({
        "query": {"lat": lat, "lon": lon, "radius_km": req.radius_km, "mode": req.mode, "documented_only": req.documented_only,
                  "limit": limit},
        "target": tinfo,
        "documented": docs[:limit],
        "documented_in_radius": len(docs),
        "regions": regions[:limit],
        "catalogue_size": len(DOCUMENTED_EARTH),
        "review_pending": len(PINS["earth"]) - len(DOCUMENTED_EARTH),
        "notes": [
            "Distances are straight-line (great-circle) distances on Earth's surface. They say nothing about roads, borders, permits or access.",
            "Documented sites come from RADIUM's reference list of published analog sites; a place missing from it may still have been studied.",
            "Modelled regions are Earth Twin grid cells (about 28 km), not named or verified field sites.",
        ],
    })


# =============================================================================
# Research Test Brief
# =============================================================================
class BriefRequest(CompareRequest):
    setting: str = "either"          # "field", "lab" or "either"


@app.post("/api/brief")
def research_brief(req: BriefRequest):
    if req.setting not in ("field", "lab", "either"):
        raise HTTPException(422, "setting must be field, lab or either")
    if not (math.isfinite(req.earth_lat) and math.isfinite(req.earth_lon)) or abs(req.earth_lat) > 90:
        raise HTTPException(422, "Earth latitude must be between -90 and 90")
    g, i, j, p, dims, score, cov = twin_setup(req)
    e = store.g["earth"]
    ei, ej = e.index(req.earth_lat, req.earth_lon)
    elat, elon = e.centre(ei, ej)
    ex = twin.explain(p, dims, ei, ej, req.purpose, req_weights(req))
    plat, plon = g.centre(i, j)
    doc = nearest_documented(elat, elon, req.body)
    earth_label = enames.place(elat, elon)["label"]
    if doc and doc["distance_km"] < 40:
        earth_label = doc["name"]
    return clean(briefs.build(
        body=req.body, purpose=req.purpose, purpose_label=PURPOSES[req.body][req.purpose]["label"],
        planet_label=pnames[req.body].context(plat, plon)["label"], planet_coords=fmt_latlon(plat, plon), planet_cell_km=g.size_km(i),
        earth_label=earth_label, earth_coords=fmt_latlon(elat, elon), earth_cell_km=e.size_km(ei),
        match=ex, documented=doc, setting=req.setting,
        share={"body": req.body, "lat": round(req.lat, 4), "lon": round(req.lon, 4), "earth_lat": round(req.earth_lat, 4),
               "earth_lon": round(req.earth_lon, 4), "purpose": req.purpose, "setting": req.setting},
    ))


# =============================================================================
# Regional terrain profile: cell-mean elevation along a transect through one cell
# =============================================================================
@app.get("/api/profile")
def terrain_profile(body: str, lat: float, lon: float, axis: str = "ns", half: int = 12):
    need_body(body)
    if not (math.isfinite(lat) and math.isfinite(lon)) or abs(lat) > 90:
        raise HTTPException(422, "latitude must be between -90 and 90")
    if axis not in ("ns", "ew"):
        raise HTTPException(422, "axis must be ns or ew")
    half = max(3, min(int(half), 30))
    g = store.g[body]                     # always the global grid: one consistent cell size along the line
    i, j = g.index(lat, ((lon + 180.0) % 360.0) - 180.0)
    clat, clon = g.centre(i, j)
    elev = g.a["elev_mean"]
    slope = g.a.get("slope_med")
    pts = []
    for k in range(-half, half + 1):
        ii, jj = (i + k, j) if axis == "ns" else (i, (j + k) % g.n_lon)
        if not 0 <= ii < g.n_lat:
            continue
        plat, plon = g.centre(ii, jj)
        e = float(elev[ii, jj])
        ok = math.isfinite(e) and (body != "earth" or bool(g.valid[ii, jj]))
        d = float(gc_km(clat, clon, plat, plon, RADIUS_KM[body])) * (1 if k >= 0 else -1)
        sv = float(slope[ii, jj]) if slope is not None else float("nan")
        pts.append({"offset_km": d, "lat": plat, "lon": plon, "elev_m": e if ok else None,
                    "slope_deg": sv if ok and math.isfinite(sv) else None})
    return clean({"body": body, "axis": axis, "centre": {"lat": clat, "lon": clon, "coords": fmt_latlon(clat, clon)},
                  "cell_km": g.size_km(i), "points": pts,
                  "source": {"moon": "lola_gdr", "mars": "mola_megdr", "earth": "etopo2022"}[body],
                  "note": "Cell-mean elevation on RADIUM's global grid. A regional screening profile, not a landing-hazard or traverse profile."})


# =============================================================================
# Time series for one cell: Moon by local hour, Mars by season, Earth by month
# =============================================================================
TIMELINE = {
    "moon": [("moon_t_hour", "Surface temperature", "K", "observed", "diviner_gcp",
              "Diviner bolometric temperature, mean of the observed quarter-hour bins in each local hour. Hours without an observation are left empty, never filled.")],
    "mars": [("mars_t_season", "Surface temperature, seasonal mean", "K", "modelled", "mcd",
              "Mars Climate Database v6.2 day-and-night mean for each 30° of solar longitude (a typical year without global dust storms)."),
             ("mars_flux_season", "Sunlight at the surface, seasonal mean", "W/m²", "modelled", "mcd",
              "Mars Climate Database v6.2 incident solar flux at the surface, day-and-night mean per season.")],
    "earth": [("earth_t_month", "Skin temperature, monthly mean", "K", "modelled", "power_merra2",
               "NASA POWER (MERRA-2 reanalysis) monthly climatology of surface skin temperature, 2001–2020.")],
}
AXIS = {"moon": ("Local solar time (hour)", [f"{h:02d}:30" for h in range(24)]),
        "mars": ("Season, solar longitude Ls", [f"Ls {ls}°" for ls in range(15, 360, 30)]),
        "earth": ("Month", ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


@lru_cache(maxsize=8)
def _series(name: str):
    path = DATA / "timeline" / f"{name}.npz"
    if not path.exists():
        return None
    with np.load(path) as z:
        return z["a"]


@app.get("/api/timeline")
def timeline(body: str, lat: float, lon: float):
    need_body(body)
    if not (math.isfinite(lat) and math.isfinite(lon)) or abs(lat) > 90:
        raise HTTPException(422, "latitude must be between -90 and 90")
    lon = ((lon + 180.0) % 360.0) - 180.0
    out = []
    for name, label, unit, evidence, source, note in TIMELINE[body]:
        a = _series(name)
        if a is None:
            continue
        n_t, n_lat, n_lon = a.shape
        i = min(n_lat - 1, max(0, int((90.0 - lat) / (180.0 / n_lat))))
        j = min(n_lon - 1, max(0, int((lon + 180.0) / (360.0 / n_lon))))
        vals = [None if not np.isfinite(v) else round(float(v), 1) for v in a[:, i, j]]
        if body == "earth" and not bool(store.g["earth"].valid[min(i, store.g["earth"].n_lat - 1), min(j, store.g["earth"].n_lon - 1)]):
            vals = [None] * n_t                              # open water: not analysed
        out.append({"id": name, "label": label, "unit": unit, "evidence": evidence, "source": source, "note": note,
                    "values": vals, "observed": sum(v is not None for v in vals)})
    axis, ticks = AXIS[body]
    return clean({"body": body, "lat": lat, "lon": lon, "axis": axis, "ticks": ticks, "series": out})


# =============================================================================
# Map overlays (PNG)
# =============================================================================
def png_response(data: bytes):
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "public, max-age=600"})


def _polar_boxes():
    """Outline of each lunar 2.4 km polar grid (a square in polar-stereographic metres) as lon/lat rings."""
    from .geo import polar_latlon
    out = {}
    for key, gid in (("south", "moon_sp"), ("north", "moon_np")):
        g = store.g[gid]
        h = g.half_m
        t = np.linspace(-h, h, 41)
        xs = np.concatenate([t, np.full(41, h), t[::-1], np.full(41, -h)])
        ys = np.concatenate([np.full(41, h), t[::-1], np.full(41, -h), t])
        la, lo = polar_latlon(xs, ys, g.south)
        out[key] = [[round(float(a), 4), round(float(b), 4)] for a, b in zip(lo, la)]
    return out


def _polar_var(var: str) -> bool:
    return var in catalog.VARS["moon_sp"] and "layer" in catalog.VARS["moon_sp"][var]


def _global_layer(var: str):
    v = catalog.VARS["moon"].get(var)
    return v["layer"] if v and "layer" in v else None


@lru_cache(maxsize=96)
def _var_png(body: str, var: str, region: str) -> bytes:
    if body == "earth":
        g = store.g["earth"]
        m = g.vars[var]["layer"]
        a = np.where(g.valid, g.a[var], np.nan)
        return render.png(render.to_mercator(render.colorize(a, m["cmap"], m["vmin"], m["vmax"], m["log"])))
    if region == "global":
        g = store.g[body]
        if var not in g.vars or "layer" not in g.vars[var]:
            return render.png(np.zeros((2, 4, 4), np.uint8))
        m = g.vars[var]["layer"]
        rgba = render.colorize(np.where(g.valid, g.a[var], np.nan), m["cmap"], m["vmin"], m["vmax"], m["log"])
        if body == "moon" and _polar_var(var):
            rgba = render.blank_caps(rgba)        # the polar cap images draw everything poleward of 75.5°
        return render.png(rgba)
    g = store.g["moon_sp" if region == "south" else "moon_np"]
    gl = _global_layer(var)
    if gl is not None:
        # One colour scale on both grids, and global values fill the cap outside the 2.4 km square.
        mg = store.g["moon"]
        rgba = render.colorize(g.a[var], gl["cmap"], gl["vmin"], gl["vmax"], gl["log"])
        outside = render.colorize(np.where(mg.valid, mg.a[var], np.nan), gl["cmap"], gl["vmin"], gl["vmax"], gl["log"])
        return render.png(render.polar_cap(rgba, g.half_m, g.cell_m, g.south, outside=outside))
    m = g.vars[var]["layer"]
    rgba = render.colorize(g.a[var], m["cmap"], m["vmin"], m["vmax"], m["log"])
    return render.png(render.polar_cap(rgba, g.half_m, g.cell_m, g.south))


@app.get("/api/overlay/var.png")
def overlay_var(body: str, var: str, region: str = "global"):
    need_body(body)
    if region not in ("global", "south", "north"):
        raise HTTPException(400, "region must be global, south or north")
    gid = body if region == "global" or body != "moon" else ("moon_sp" if region == "south" else "moon_np")
    if region != "global" and body != "moon":
        raise HTTPException(400, "polar caps exist only for the Moon")
    if var not in catalog.VARS[gid] or "layer" not in catalog.VARS[gid][var]:
        if not (body == "moon" and region == "global"):
            raise HTTPException(404, "no such layer")
    return png_response(_var_png(body, var, region))


@lru_cache(maxsize=48)
def _suit_png(mission: str, wkey: str, lkey: str, region: str) -> bytes:
    weights = json.loads(wkey) if wkey else None
    limits = None if lkey == "*" else [x for x in lkey.split(",") if x]
    body = MISSIONS[mission]["body"]
    gid = body if region == "global" else ("moon_sp" if region == "south" else "moon_np")
    g = store.g[gid]
    score, cov, excluded = engine.evaluate(gid, mission, weights, limits)
    rgba = render.grade_rgba(np.where(g.valid, score, np.nan), excluded)
    if body == "moon" and region == "global":
        rgba = render.blank_caps(rgba)            # the cap images draw everything poleward of 75.5°
    elif region != "global":
        gs, gc, ge = engine.evaluate("moon", mission, weights, limits)
        outside = render.grade_rgba(np.where(store.g["moon"].valid, gs, np.nan), ge)
        rgba = render.polar_cap(rgba, g.half_m, g.cell_m, g.south, outside=outside)
    return render.png(rgba)


@app.get("/api/overlay/suitability.png")
def overlay_suit(mission: str, w: Optional[str] = None, limits: Optional[str] = None, region: str = "global"):
    if mission not in MISSIONS:
        raise HTTPException(400, "unknown mission")
    if region != "global" and MISSIONS[mission]["body"] != "moon":
        raise HTTPException(400, "polar caps exist only for the Moon")
    weights = parse_weights(w)
    wkey = json.dumps(normalise(weights, mission), sort_keys=True) if weights else ""
    lkey = "*" if limits is None else ",".join(sorted(parse_limits(limits)))
    return png_response(_suit_png(mission, wkey, lkey, region))


@lru_cache(maxsize=32)
def _twin_png(body: str, gid: str, i: int, j: int, purpose: str, wkey: str = "") -> bytes:
    g = store.g[gid]
    p, dims, score, cov = twin.score_all(g, i, j, purpose, json.loads(wkey) if wkey else None)
    if score is None:
        return render.png(np.zeros((2, 2, 4), np.uint8))
    return render.png(render.to_mercator(render.grade_rgba(score)))


@app.get("/api/overlay/twin.png")
def overlay_twin(body: str, lat: float, lon: float, purpose: str = "general", w: Optional[str] = None):
    need_body(body, planetary=True)
    if purpose not in PURPOSES[body]:
        raise HTTPException(400, "unknown purpose")
    try:
        cw = custom_weights(body, purpose, json.loads(w) if w else None)
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(422, str(e))
    g, i, j = store.locate(body, lat, lon)
    return png_response(_twin_png(body, g.id, i, j, purpose, json.dumps(cw, sort_keys=True) if cw else ""))


@app.get("/api/health")
def health():
    return {"ok": True, "grids": {gid: list(g.shape) for gid, g in store.g.items()}}
