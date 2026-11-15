"""Reverse the Earth Twin search, keeping the existing pairwise model unchanged.

This module is imported on demand. It never constructs an Earth × planet matrix:
each planetary grid is evaluated against one fixed Earth cell. Public match
explanations are evaluated with Twin.dimensions/explain, the same path as forward
comparison. Vectorised screening is tested against that reference calculation.
"""
from __future__ import annotations

from copy import copy
from types import SimpleNamespace

import numpy as np

from .briefs import DIM_SOURCES
from .geo import RADIUS_KM, fmt_latlon, pick_distinct
from .registry import BY_ID
from .sites import documented
from .similarity import A_HIGHLAND, A_MARE, A_MARS, ICE_PURPOSE_MIN_INDEX, LITH, MIN_COVERAGE, PURPOSES, Twin, gauss_sim, log_sim, purpose_applicable
from .suitability import RANK_SEPARATION_KM, ramp, wmean


def _values(g, name):
    a = g.get(name)
    return np.full(g.shape, np.nan) if a is None else a.astype(np.float64)


def profile_arrays(g):
    """Array equivalent of Twin.profile for the fields used by similarity."""
    v = lambda name: _values(g, name)  # noqa: E731
    if g.body == "moon":
        hyd = ramp(v("h_ppm"), 60.0, 150.0)
        geo = np.clip(v("ice_nearby") / 0.8, 0.0, 1.0) if g.kind == "polar" else ramp(v("dist_psr_km"), 10.0, 1.0)
        ice = wmean([(0.5, geo), (0.5, hyd)])
        return {"mare": np.clip((v("feo_wt") - 6.0) / 10.0, 0.0, 1.0), "ice": ice}
    gate = ramp(v("tmean"), 215.0, 198.0)
    hyd = v("weh_wt")
    ice = np.where(np.isfinite(hyd), 0.5 * gate + 0.5 * gate * ramp(hyd, 2.5, 7.0), gate)
    return {"ice": ice, "dust": ramp(v("thermal_inertia"), 200.0, 80.0), "chlorine": ramp(v("cl_wt"), 0.45, 0.70)}


def screen_grid(twin: Twin, g, ei: int, ej: int, purpose: str):
    """All existing planetary cells against this Earth cell; missing stays NaN."""
    earth = twin.e
    p = profile_arrays(g)
    dims = {"terrain": wmean([(weight, log_sim(_values(g, name), earth.a[name][ei, ej], epsilon))
                               for name, weight, epsilon in [("slope_med", 0.4, 0.1), ("slope_p90", 0.3, 0.1), ("rough_iqr", 0.3, 1.0)]])}
    lith = next((code for code, value in LITH.items() if value == int(twin.lith[ei, ej])), None) if twin.lith_ok[ei, ej] else None
    geology = np.full(g.shape, np.nan)
    if lith and g.body == "moon" and lith in A_MARE:
        geology = p["mare"] * A_MARE[lith] + (1 - p["mare"]) * A_HIGHLAND[lith]
    elif lith and g.body == "mars" and lith in A_MARS:
        geology[:] = A_MARS[lith]
        if lith in ("su", "py", "vb"):
            base, change = {"su": (0.50, 0.30), "py": (0.75, 0.10), "vb": (1.00, -0.25)}[lith]
            geology = np.where(np.isfinite(p["dust"]), base + change * p["dust"], geology)
        elif lith == "ev":
            geology = np.where(np.isfinite(p["chlorine"]), 0.45 + 0.35 * p["chlorine"], geology)
        elif lith == "ig":
            geology = np.where(np.isfinite(p["ice"]), 0.10 + 0.50 * p["ice"], geology)
    dims.update(geology=geology, ice=1 - np.abs(p["ice"] - twin.frozen[ei, ej]),
                environment=np.full(g.shape, twin.s_env[ei, ej]))
    if g.body == "mars":
        dims.update(thermal=gauss_sim(_values(g, "tmean"), earth.a["tmean"][ei, ej], 40.0),
                    dust=log_sim(_values(g, "dust_tau"), earth.a["aod55"][ei, ej], 0.02))
    score, coverage = twin.combine(dims, PURPOSES[g.body][purpose]["w"])
    valid = g.valid.copy()
    if purpose == "ice":
        valid &= p["ice"] >= ICE_PURPOSE_MIN_INDEX
    return np.where(valid, score, np.nan), coverage


def explain_pair(twin: Twin, g, i: int, j: int, ei: int, ej: int, purpose: str):
    """Reference pair score without allocating full-Earth arrays for each match."""
    fixed = copy(twin)
    fixed.e = SimpleNamespace(a={key: array[ei:ei + 1, ej:ej + 1] for key, array in twin.e.a.items()})
    for key in ("lith", "lith_ok", "frozen", "s_env"):
        setattr(fixed, key, getattr(twin, key)[ei:ei + 1, ej:ej + 1])
    profile = twin.profile(g, i, j)
    # Broadcast views cost no full-grid allocation; explain reads only [ei, ej].
    dims = {key: None if array is None else np.broadcast_to(array, twin.e.shape) for key, array in fixed.dimensions(profile).items()}
    explanation = twin.explain(profile, dims, ei, ej, purpose)
    return profile, explanation


def _sources(body, dimension):
    ids = DIM_SOURCES[dimension].get(body, []) + DIM_SOURCES[dimension].get("earth", [])
    return [{"id": sid, "name": BY_ID[sid]["name"], "url": BY_ID[sid]["url"],
             "evidence": BY_ID[sid]["evidence"], "resolution": BY_ID[sid]["spatial_resolution"]} for sid in dict.fromkeys(ids)]


def search(store, twin: Twin, pins, names, earth_names, *, lat, lon, purpose, n, bodies):
    earth = twin.e
    ei, ej = earth.index(lat, lon)
    elat, elon = earth.centre(ei, ej)
    result = {"earth": {"lat": elat, "lon": elon, "requested_lat": lat, "requested_lon": lon,
                         "grid": earth.id, "cell_km": earth.size_km(ei), "place": earth_names.place(elat, elon),
                         "analysed": bool(earth.valid[ei, ej])},
              "purpose": purpose, "evidence": "computed", "min_coverage": MIN_COVERAGE,
              "method": "Existing Earth Twin pairwise similarity, searched in the reverse direction. No interpolation or new suitability score.",
              "results": [], "status": "ready", "note": None}
    if not earth.valid[ei, ej]:
        result.update(status="not_assessed", note="Not assessed: this Earth cell is outside the analysed land grid.")
        return result

    def match(g, i, j, *, site=None):
        profile, ex = explain_pair(twin, g, i, j, ei, ej, purpose)
        if not purpose_applicable(purpose, profile)[0] or ex["score"] is None:
            return None
        la, lo = g.centre(i, j)
        return {"id": f"{g.id}:{i}:{j}", "body": g.body, "lat": la, "lon": lo, "grid": g.id,
                "coords": fmt_latlon(la, lo), "cell_km": g.size_km(i), "name": site["name"] if site else names[g.body].context(la, lo)["label"],
                "site_id": site["id"] if site else None, "site_coordinates": {"lat": site["lat"], "lon": site["lon"]} if site else None,
                "score": ex["score"], "grade": ex["grade"], "coverage": ex["coverage"], "evidence": "computed",
                "dimensions": [{**d, "evidence": "interpreted" if d["id"] == "geology" else "computed", "sources": _sources(g.body, d["id"])} for d in ex["dimensions"]],
                "breaks_down": ex["breaks_down"], "curated_comparison": None}

    for body in bodies:
        group = {"body": body, "cells": [], "catalog": [], "searched_cells": 0,
                 "separation_km": RANK_SEPARATION_KM[body], "note": None}
        result["results"].append(group)
        if purpose not in PURPOSES[body]:
            group["note"] = "Not assessed: this research purpose is not defined for this world."
            continue
        grids = [g for g in store.g.values() if g.body == body]
        scores = []
        for grid in grids:
            score, _ = screen_grid(twin, grid, ei, ej, purpose)
            scores.append(score.ravel())
            group["searched_cells"] += int(grid.valid.sum())
        score = np.concatenate(scores)
        latitudes = np.concatenate([g.lat2d.ravel() for g in grids])
        longitudes = np.concatenate([g.lon2d.ravel() for g in grids])
        indices = pick_distinct(score, latitudes, longitudes, RADIUS_KM[body], RANK_SEPARATION_KM[body], n)
        ends = np.cumsum([g.valid.size for g in grids])
        for index in indices:
            grid_index = int(np.searchsorted(ends, index, side="right"))
            grid = grids[grid_index]
            local = index - (int(ends[grid_index - 1]) if grid_index else 0)
            i, j = np.unravel_index(local, grid.shape)
            row = match(grid, int(i), int(j))
            if row:
                group["cells"].append(row)
        for site in pins[body]:
            grid, i, j = store.locate(body, site["lat"], site["lon"])
            row = match(grid, i, j, site=site)
            if row:
                group["catalog"].append(row)
        group["cells"].sort(key=lambda row: -row["score"])
        group["catalog"].sort(key=lambda row: -row["score"])
        group["catalog"] = group["catalog"][:n]
        if not group["cells"]:
            group["note"] = "Not assessed: no planetary cells meet the coverage and purpose requirements."
            continue
        # This contextual count compares Earth places for one explicit planetary target;
        # it does not imply an independent Earth suitability or access assessment.
        top = group["cells"][0]
        grid, i, j = store.locate(body, top["lat"], top["lon"])
        scores = []
        for site in pins["earth"]:
            if body not in site.get("bodies", []) or not documented(site):
                continue
            si, sj = earth.index(site["lat"], site["lon"])
            if earth.valid[si, sj]:
                _, ex = explain_pair(twin, grid, i, j, si, sj, purpose)
                if ex["score"] is not None:
                    scores.append(ex["score"])
        top["curated_comparison"] = {"outscored": sum(value < top["score"] for value in scores), "scored": len(scores),
                                     "target_id": top["id"], "evidence": "computed"}
    return result
