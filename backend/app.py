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
from pydantic import BaseModel

from . import catalog, reference, registry, render
from .geo import RADIUS_KM, fmt_latlon, gc_km
from .naming import Earth as EarthNames
from .naming import Planetary
from .similarity import (A_HIGHLAND, A_MARE, A_MARS, AFFINITY_NOTES, DIMENSIONS, MIN_COVERAGE as SIM_MIN_COVERAGE,
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
            "polar_legend": ({"stops": render.legend_stops(catalog.VARS["moon_sp"][vid]["layer"]["cmap"]),
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
        "cap": {"edge_lat": render.CAP_EDGE_LAT},
        "sources_index": {s["id"]: {"name": s["name"], "url": s["url"], "agency": s["agency"]} for s in registry.SOURCES},
    })


@app.get("/api/meta")
def meta():
    return _meta()


@app.get("/api/sources")
def sources():
    return {"sources": registry.SOURCES, "not_used": registry.NOT_USED}


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
            "purposes": {b: {pid: {"label": p["label"], "weights": p["w"]} for pid, p in ps.items()} for b, ps in PURPOSES.items()},
            "affinity": {"classes": lith, "mare": A_MARE, "highland": A_HIGHLAND, "mars": A_MARS, "notes": AFFINITY_NOTES},
        },
        "validation": val,
        "grids": {gid: {"cells": int(g.valid.sum()), "shape": list(g.shape), "cell_km": g.meta.get("cell_km")} for gid, g in store.g.items()},
        "earth_reclassified_ice_cells": int(store.g["earth"].a["ice_reclassified"].sum()),
        "reference_sites": len(reference.EARTH_ANALOGS),
    })


@app.get("/api/pins")
def pins(body: str):
    need_body(body)
    return {"pins": PINS[body]}


@app.get("/api/search")
def search(body: str, q: str = Query("", max_length=60)):
    need_body(body)
    q = q.strip()
    if body == "earth":
        res = enames.search(q)
        ql = q.lower()
        res = [{"name": p["name"], "type": "Documented analog site", "lat": p["lat"], "lon": p["lon"]}
               for p in PINS["earth"] if ql and ql in p["name"].lower()][:6] + res
    else:
        res = pnames[body].search(q)
        ql = q.lower()
        res = [{"name": p["name"], "type": "Landing site", "lat": p["lat"], "lon": p["lon"]}
               for p in PINS[body] if p["kind"] == "landing" and ql and ql in p["name"].lower()][:6] + res
    return {"results": res[:14]}


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


def site_card(g, i, j, mission, weights, limits):
    c = engine.cell(g, i, j, mission, weights, limits)
    lat, lon = g.centre(i, j)
    return {
        "id": f"{g.id}:{i}:{j}", "grid": g.id, "lat": lat, "lon": lon, "coords": fmt_latlon(lat, lon),
        "place": pnames[g.body].context(lat, lon)["label"], "score": c["score"], "grade": c["grade"],
        "coverage": c["coverage"], "cell_km": g.size_km(i),
        "factors": [{"id": f["id"], "short": f["short"], "label": f["label"], "value": f["value"], "grade": f["grade"],
                     "weight": f["weight"]} for f in c["factors"]],
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

    return clean({"mission": req.mission, "weights": w, "sites": sites, "stats": stats, "change": change,
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


class CompareRequest(TwinRequest):
    earth_lat: float
    earth_lon: float


def nearest_documented(lat, lon, body):
    best = None
    for p in PINS["earth"]:
        d = float(gc_km(lat, lon, p["lat"], p["lon"], RADIUS_KM["earth"]))
        if d <= DOC_RADIUS_KM and (best is None or d < best["distance_km"]):
            best = {"name": p["name"], "distance_km": d, "source": p["source"], "theme": p["theme"],
                    "for_this_body": body in p["bodies"]}
    return best


def twin_setup(req: TwinRequest):
    need_body(req.body, planetary=True)
    if req.purpose not in PURPOSES[req.body]:
        raise HTTPException(400, f"purpose must be one of {list(PURPOSES[req.body])}")
    g, i, j = store.locate(req.body, req.lat, req.lon)
    p, dims, score, cov = twin.score_all(g, i, j, req.purpose)
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
        ex = twin.explain(p, dims, ei, ej, req.purpose)
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
    for site in PINS["earth"]:
        ei, ej = e.index(site["lat"], site["lon"])
        v = float(score[ei, ej])
        ex = twin.explain(p, dims, ei, ej, req.purpose)
        documented.append({"name": site["name"], "country": site["country"], "lat": site["lat"], "lon": site["lon"],
                           "theme": site["theme"], "source": site["source"], "for_this_body": req.body in site["bodies"],
                           "score": ex["score"], "grade": ex["grade"], "strong": ex["strong"], "weak": ex["weak"],
                           "analysed": bool(e.valid[ei, ej]) and math.isfinite(v)})
    documented.sort(key=lambda d: -(d["score"] if d["score"] is not None else -1))

    applicable, purpose_note = purpose_applicable(req.purpose, p)
    w = PURPOSES[req.body][req.purpose]["w"]
    tw = sum(w.values())
    dim_status = [{"id": d, "label": DIMENSIONS[d]["label"], "weight": wd / tw, "available": dims.get(d) is not None}
                  for d, wd in w.items()]
    return clean({
        "planet": {"body": req.body, "grid": g.id, "lat": plat, "lon": plon, "coords": fmt_latlon(plat, plon),
                   "place": pnames[req.body].context(plat, plon), "profile": p, "cell_km": g.size_km(i)},
        "purpose": req.purpose, "purpose_applicable": applicable, "purpose_note": purpose_note,
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
    ex = twin.explain(p, dims, ei, ej, req.purpose)
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


# =============================================================================
# Map overlays (PNG)
# =============================================================================
def png_response(data: bytes):
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "public, max-age=600"})


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
        a = np.where(g.valid, g.a[var], np.nan)
        return render.png(render.colorize(a, m["cmap"], m["vmin"], m["vmax"], m["log"]))
    g = store.g["moon_sp" if region == "south" else "moon_np"]
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
    score = np.where(g.valid, score, np.nan)
    rgba = render.grade_rgba(score, excluded)
    if region != "global":
        rgba = render.polar_cap(rgba, g.half_m, g.cell_m, g.south)
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
def _twin_png(body: str, gid: str, i: int, j: int, purpose: str) -> bytes:
    g = store.g[gid]
    p, dims, score, cov = twin.score_all(g, i, j, purpose)
    if score is None:
        return render.png(np.zeros((2, 2, 4), np.uint8))
    return render.png(render.to_mercator(render.grade_rgba(score)))


@app.get("/api/overlay/twin.png")
def overlay_twin(body: str, lat: float, lon: float, purpose: str = "general"):
    need_body(body, planetary=True)
    if purpose not in PURPOSES[body]:
        raise HTTPException(400, "unknown purpose")
    g, i, j = store.locate(body, lat, lon)
    return png_response(_twin_png(body, g.id, i, j, purpose))


@app.get("/api/health")
def health():
    return {"ok": True, "grids": {gid: list(g.shape) for gid, g in store.g.items()}}
