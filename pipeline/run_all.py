"""Rebuild every processed grid from the public sources, in order.

  python -m pipeline.run_all              download (resumable) then build
  python -m pipeline.run_all --no-fetch   build from files already in data/raw

Downloads total about 5.6 GB and take 10–60 minutes; the Mars Climate Database
queries take about 40 minutes because the public service is slow. Builds take
about 5 minutes and write about 200 MB to data/processed.
"""
from __future__ import annotations

import sys
import time

from . import (build_earth, build_timeline, build_layers, build_mars, build_moon, build_moon_polar, build_names, fetch, fetch_earth,
               fetch_mcd)

FETCH = [("plain data files", fetch.main), ("NASA POWER and GIBS", fetch_earth.main), ("Mars Climate Database", fetch_mcd.main)]
BUILD = [("Moon, global grid", build_moon.main), ("Moon, polar grids", build_moon_polar.main), ("Mars grid", build_mars.main),
         ("Earth grid", build_earth.main), ("place names", build_names.main), ("map tile layers", build_layers.main),
         ("time series", build_timeline.main)]


def main() -> int:
    steps = ([] if "--no-fetch" in sys.argv else FETCH) + BUILD
    for label, fn in steps:
        t = time.time()
        print(f"\n=== {label} ===", flush=True)
        code = fn()
        if code:
            print(f"stopped: {label} did not finish")
            return 1
        print(f"--- {label}: {time.time() - t:.0f} s")
    print("\npipeline complete; run `npm test` to check the results")
    return 0


if __name__ == "__main__":
    sys.exit(main())
