"""Save one real, computed example for offline demos (venue Wi-Fi failures, cold starts).

Runs the actual API in-process and stores its responses verbatim in public/demo/snapshot.json.
The app shows this only when the data service is unreachable, labelled as a saved example, never as live analysis.

    .venv/bin/python scripts/build_snapshot.py
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

from backend.app import app  # noqa: E402

TARGET = {"body": "mars", "lat": -4.59, "lon": 137.44, "purpose": "mobility"}
NEAR_FROM = {"lat": 36.17, "lon": -115.14, "label": "Las Vegas, Nevada, United States of America"}


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
    snap = {
        "kind": "saved_example",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "build": sha,
        "inputs": {"target": TARGET, "earth_choice": "top-ranked Earth Twin match", "near_from": NEAR_FROM, "radius_km": 1500},
        "twin": {k: twin[k] for k in ("planet", "purpose", "dimensions", "candidates", "distribution", "separation_km")},
        "compare": compare,
        "brief": brief,
        "nearby": nearby,
    }
    out = ROOT / "public" / "demo" / "snapshot.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.0f} KB): {compare['earth']['place']['label']} grade {compare['match']['grade']}")


if __name__ == "__main__":
    main()
