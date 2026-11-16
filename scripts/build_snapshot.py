"""Save real, computed results for the start screen, the Findings view and offline demos.

Runs the actual API in-process and stores its responses verbatim, so no number shown before the
live service answers can drift from the model:

  public/demo/snapshot.json   one worked example for venue Wi-Fi failures and cold starts. The app shows it
                              only when the data service is unreachable, labelled "Saved example".
  src/data/findings.json      the headline results behind the start screen cards, the Findings view,
                              the famous-site list and the daily featured target. Every entry carries the
                              request that produced it and a deep link that reproduces it live.

    .venv/bin/python scripts/build_snapshot.py        (or: npm run snapshot)
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from backend import registry  # noqa: E402
from backend.app import app  # noqa: E402

TARGET = {"body": "mars", "lat": -4.59, "lon": 137.44, "purpose": "mobility"}
NEAR_FROM = {"lat": 36.17, "lon": -115.14, "label": "Las Vegas, Nevada, United States of America"}

# The short list of famous places offered first in "Find Earth Twins". Coordinates come from the site
# catalogue (pin id) except the ridge beside Shackleton, which is the published best-lit south-polar point
# (Mazarico et al. 2011; 89.45°S, 222.69°E) that tests/test_science.py checks against the illumination grid.
FAMOUS = [
    {"id": "shackleton-ridge", "body": "moon", "name": "Shackleton ridge", "lat": -89.45, "lon": -137.31,
     "line": "Best-lit ground near the south pole, beside Shackleton crater.",
     "source": "Mazarico et al. 2011, Icarus 211; LOLA polar illumination products"},
    {"id": "mons-mouton", "body": "moon", "name": "Mons Mouton", "pin": "moon-feature-Mons Mouton",
     "line": "Flat-topped mountain near the south pole, a candidate landing region."},
    {"id": "apollo-11", "body": "moon", "name": "Apollo 11", "pin": "moon-landing-Apollo 11",
     "line": "First crewed landing, 1969, on the basalt plain of Mare Tranquillitatis."},
    {"id": "gale", "body": "mars", "name": "Gale crater (Curiosity)", "pin": "mars-landing-Curiosity",
     "line": "Curiosity rover landing site, 2012, beside a layered central mound."},
    {"id": "jezero", "body": "mars", "name": "Jezero crater (Perseverance)", "pin": "mars-landing-Perseverance",
     "line": "Perseverance rover landing site, 2021, on a preserved river delta."},
    {"id": "arcadia", "body": "mars", "name": "Arcadia Planitia", "pin": "mars-feature-Arcadia Planitia",
     "line": "Northern plain where radar and fresh craters reveal shallow ice."},
]

# Findings shown on the start screen and in the Findings view: (id, famous site, purpose).
FINDINGS = [
    ("gale-mobility", "gale", "mobility"),
    ("ridge-ice", "shackleton-ridge", "ice"),
    ("ridge-general", "shackleton-ridge", "general"),
    ("arcadia-ice", "arcadia", "ice"),
]
# Daily featured target: a fixed, curated rotation. Each is computed here; nothing is authored.
FEATURED = [
    ("gale", "mobility"), ("shackleton-ridge", "ice"), ("arcadia", "ice"), ("jezero", "astrobiology"),
    ("apollo-11", "mobility"), ("mons-mouton", "ice"), ("gale", "dust"),
]


def link(**q):
    return "#" + "&".join(f"{k}={v}" for k, v in q.items())


def main():
    c = TestClient(app)

    def ok(r):
        r.raise_for_status()
        return r.json()

    twin = ok(c.post("/api/twin", json={**TARGET, "n": 10}))
    best = twin["candidates"][0]
    compare = ok(c.post("/api/twin/compare", json={**TARGET, "earth_lat": best["lat"], "earth_lon": best["lon"]}))
    brief = ok(c.post("/api/brief", json={**TARGET, "earth_lat": best["lat"], "earth_lon": best["lon"], "setting": "field"}))
    nearby = ok(c.post("/api/analogs/nearby", json={"lat": NEAR_FROM["lat"], "lon": NEAR_FROM["lon"], "radius_km": 1500, "mode": "best",
                                                    "body": "mars", "target_lat": TARGET["lat"], "target_lon": TARGET["lon"],
                                                    "purpose": TARGET["purpose"], "limit": 10}))
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip() or "unknown"
    except OSError:
        sha = "unknown"
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y-%m-%d %H:%M UTC")
    snap = {
        "kind": "saved_example",
        "generated_utc": stamp,
        "build": sha,
        "inputs": {"target": TARGET, "earth_choice": "top-ranked Earth Twin match", "near_from": NEAR_FROM, "radius_km": 1500},
        "twin": {k: twin[k] for k in ("planet", "purpose", "purposes", "purpose_applicable", "purpose_note", "dimensions", "planet_coverage",
                                      "candidates", "documented", "distribution", "separation_km")},
        "compare": compare,
        "brief": brief,
        "nearby": nearby,
    }
    out = ROOT / "public" / "demo" / "snapshot.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.0f} KB): {compare['earth']['place']['label']} grade {compare['match']['grade']}")

    # ------------------------------------------------------------------ findings
    meta = ok(c.get("/api/meta"))
    pins = {b: {p["id"]: p for p in ok(c.get(f"/api/pins?body={b}"))["pins"]} for b in ("moon", "mars", "earth")}
    purpose_label = {b: {p["id"]: p["label"] for p in meta["purposes"][b]} for b in ("moon", "mars")}

    famous = {}
    for f in FAMOUS:
        if "pin" in f:
            p = pins[f["body"]][f["pin"]]
            f = {**f, "lat": p["lat"], "lon": p["lon"], "source": p["source"]}
        famous[f["id"]] = f

    def study(site_id: str, purpose: str, n: int = 5):
        """One target and purpose, searched over every Earth land cell, with its best match compared."""
        f = famous[site_id]
        req = {"body": f["body"], "lat": f["lat"], "lon": f["lon"], "purpose": purpose}
        t = ok(c.post("/api/twin", json={**req, "n": n}))
        top = t["candidates"][0]
        cmp_ = ok(c.post("/api/twin/compare", json={**req, "earth_lat": top["lat"], "earth_lon": top["lon"]}))
        verified = [d for d in t["documented"] if d["analysed"] and d["score"] is not None and d["verification_status"] != "review_needed"]
        best_doc = max(verified, key=lambda d: d["score"]) if verified else None
        target = f"{f['body']},{f['lat']},{f['lon']}"
        return {
            "site": site_id, "body": f["body"], "name": f["name"], "lat": f["lat"], "lon": f["lon"],
            "coords": t["planet"]["coords"], "place": t["planet"]["place"]["label"], "cell_km": t["planet"]["cell_km"],
            "purpose": purpose, "purpose_label": purpose_label[f["body"]][purpose],
            "request": {"endpoint": "POST /api/twin", **req},
            "cells": t["distribution"]["cells"], "grades": t["distribution"]["grades"], "best": t["distribution"]["best"],
            "top": [{"rank": x["rank"], "name": x["place"]["label"], "lat": x["lat"], "lon": x["lon"], "coords": x["coords"],
                     "score": x["score"], "grade": x["grade"], "new_lead": x["novel"]} for x in t["candidates"][:3]],
            "best_documented": None if not best_doc else {"name": best_doc["name"], "score": best_doc["score"], "grade": best_doc["grade"]},
            "documented_scored": len(verified),
            "documented_below_top": sum(1 for d in verified if d["score"] < top["score"]),
            "breaks_down": cmp_["match"]["breaks_down"],
            "dimensions": [{k: d[k] for k in ("id", "label", "score", "grade", "weight")} for d in cmp_["match"]["dimensions"] if d["weight"] > 0],
            "link": link(v=2, m="twin", b=f["body"], t=target, p=purpose),
            "compare_link": link(v=2, m="compare", b=f["body"], t=target, p=purpose, e=f"{top['lat']},{top['lon']}", ct="pair"),
        }

    studies = {}

    def get(site_id, purpose):
        key = (site_id, purpose)
        if key not in studies:
            studies[key] = study(site_id, purpose)
        return studies[key]

    near = ok(c.post("/api/analogs/nearby", json={"lat": NEAR_FROM["lat"], "lon": NEAR_FROM["lon"], "radius_km": 1500, "mode": "nearest", "limit": 5}))
    nearest = near["documented"][0]
    rank = ok(c.post("/api/rank", json={"mission": "lunar_base", "n": 3}))
    mission = next(m for m in meta["missions"] if m["id"] == "lunar_base")
    ranks = {}
    for m in meta["missions"]:
        r = ok(c.post("/api/rank", json={"mission": m["id"], "n": 3}))
        ranks[m["id"]] = {"mission": m["id"], "label": m["label"], "body": m["body"], "cells": r["stats"]["cells"], "graded": r["stats"]["graded"],
                          "excluded": r["stats"]["excluded"], "grades": r["stats"]["grades"],
                          "top": [{"place": s["place"], "coords": s["coords"], "lat": s["lat"], "lon": s["lon"], "grade": s["grade"], "score": s["score"]} for s in r["sites"][:3]],
                          "request": {"endpoint": "POST /api/rank", "mission": m["id"]},
                          "link": link(v=2, m="mission", b=m["body"], mi=m["id"], ms="candidates")}

    sources = registry.SOURCES
    findings = {
        "kind": "computed_findings",
        "generated_utc": stamp,
        "generated_date": now.strftime("%-d %B %Y"),
        "build": sha,
        "note": "Every value is the unchanged output of the RADIUM API for the request stored beside it. Regenerate with npm run snapshot.",
        "counts": {
            "sources": len(sources),
            "earth_cells": get("gale", "mobility")["cells"],
            "moon_cells": ranks["lunar_base"]["cells"],
            "mars_cells": ranks["mars_robotic"]["cells"],
            "documented_sites": near["catalogue_size"],
            "tests": None,
        },
        "famous": [{k: f[k] for k in ("id", "body", "name", "lat", "lon", "line", "source")} for f in famous.values()],
        "cards": {
            "moon": get("shackleton-ridge", "ice"),
            "mars": get("gale", "mobility"),
            "near": {"from": NEAR_FROM, "radius_km": near["query"]["radius_km"], "in_radius": near["documented_in_radius"],
                     "catalogue_size": near["catalogue_size"],
                     "request": {"endpoint": "POST /api/analogs/nearby", "lat": NEAR_FROM["lat"], "lon": NEAR_FROM["lon"], "radius_km": 1500, "mode": "nearest"},
                     "nearest": [{"name": d["name"], "country": d["country"], "distance_km": d["distance_km"], "theme": d["theme"], "lat": d["lat"], "lon": d["lon"]}
                                 for d in near["documented"][:3]]},
            "rank": ranks["lunar_base"],
        },
        "missions": ranks,
        "findings": [get(site, purpose) | {"id": fid} for fid, site, purpose in FINDINGS],
        "featured": [get(site, purpose) for site, purpose in FEATURED],
    }
    assert nearest["name"] == findings["cards"]["near"]["nearest"][0]["name"] and mission["id"] == rank["mission"]
    fout = ROOT / "src" / "data" / "findings.json"
    fout.parent.mkdir(parents=True, exist_ok=True)
    fout.write_text(json.dumps(findings, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {fout.relative_to(ROOT)} ({fout.stat().st_size / 1024:.0f} KB)")
    for f in findings["findings"]:
        t = f["top"][0]
        print(f"  {f['name']} / {f['purpose_label']}: {t['name']} {t['score']:.2f} {t['grade']}; A cells {f['grades']['A']} of {f['cells']:,}")
    r = findings["cards"]["rank"]
    print(f"  {r['label']}: {r['grades']['A']} of {r['cells']:,} cells grade A; nearest to Las Vegas: {nearest['name']} {nearest['distance_km']:.0f} km")


if __name__ == "__main__":
    main()
