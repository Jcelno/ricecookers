"""Fetch global climatological fields from the Mars Climate Database (MCD v6.2)
public web interface and cache the raw ASCII responses.

The MCD is a model climatology (LMD Mars GCM runs, dust scenario "climatology
average solar" built from the observed MY24–35 dust record). Everything taken
from it is labelled *modelled* in RADIUM.

Queries (sequential, with pauses — the service is a shared public resource):
  * 12 seasons (Ls = 15, 45 … 345°), diurnal mean of surface temperature,
    surface pressure, incident solar flux at the surface, dust optical depth.
  * 6 seasons × 2 fixed local times (14 h ≈ daily maximum, 5 h ≈ pre-dawn
    minimum) of surface temperature, to bound the diurnal extremes.
  * 1 query for the static surface fields used by the model (thermal inertia,
    bare-ground albedo, model orography).

Run:  python -m pipeline.fetch_mcd
"""
from __future__ import annotations

import re
import sys
import time

import requests

from .common import RAW

BASE = "https://www-mars.lmd.jussieu.fr/mcd_python/"
CGI = BASE + "cgi-bin/mcdcgi.py"
UA = {"User-Agent": "Mozilla/5.0 (research-client)"}
OUTDIR = RAW / "mars" / "mcd"


def params(vars4, ls, averaging="loct", fixed_lt=False, localtime=0.0):
    v = list(vars4) + ["none"] * (4 - len(vars4))
    return {
        "var1": v[0], "var2": v[1], "var3": v[2], "var4": v[3],
        "datekeyhtml": "1", "ls": f"{ls}", "localtime": f"{localtime}",
        "year": "", "month": "", "day": "", "hours": "", "minutes": "", "seconds": "",
        "julian": "", "martianyear": "", "sol": "",
        "latitude": "all", "longitude": "all", "altitude": "10.", "zkey": "3",
        "spacecraft": "none", "isfixedlt": "on" if fixed_lt else "off",
        "dust": "1",            # scenario 1 = climatology, average solar EUV
        "hrkey": "0",           # native GCM grid (5.625° × 3.83°)
        "averaging": averaging, "dpi": "80", "islog": "off", "colorm": "jet",
        "minval": "", "maxval": "", "proj": "cyl", "palt": "", "plon": "", "plat": "",
        "trans": "", "iswind": "off", "latpoint": "", "lonpoint": "",
    }


def run(name: str, p: dict, tries: int = 8) -> bool:
    out = OUTDIR / f"{name}.txt"
    if out.exists() and out.stat().st_size > 10_000:
        print(f"[skip] {name}")
        return True
    for attempt in range(1, tries + 1):
        try:
            t0 = time.time()
            r = requests.get(CGI, params=p, headers=UA, timeout=420)
            m = re.search(r"\.\./(txt/[a-f0-9]+\.txt)", r.text)
            if r.status_code != 200 or not m:
                raise RuntimeError(f"HTTP {r.status_code}, no data link in response")
            d = requests.get(BASE + m.group(1), headers=UA, timeout=180)
            d.raise_for_status()
            if "Mars Climate Database" not in d.text:
                raise RuntimeError("unexpected payload")
            out.write_text(d.text)
            print(f"[ok]   {name}  {len(d.text)//1024} kB  {time.time()-t0:.0f}s", flush=True)
            time.sleep(6)
            return True
        except Exception as e:  # noqa: BLE001 - report and retry
            wait = min(60 * attempt, 300)
            print(f"[retry {attempt}/{tries}] {name}: {type(e).__name__}: {str(e)[:120]} — waiting {wait}s", flush=True)
            time.sleep(wait)
    print(f"[FAIL] {name}", flush=True)
    return False


def main() -> int:
    OUTDIR.mkdir(parents=True, exist_ok=True)
    ok = True
    ok &= run("static", params(["thermal_inertia", "ground_albedo", "oro_gcm"], 0, averaging="off"))
    for ls in range(15, 360, 30):
        ok &= run(f"mean_ls{ls:03d}", params(["tsurf", "ps", "fluxsurf_dn_sw", "dod"], ls, averaging="loct"))
    for ls in range(15, 360, 60):
        ok &= run(f"lt14_ls{ls:03d}", params(["tsurf"], ls, averaging="off", fixed_lt=True, localtime=14.0))
        ok &= run(f"lt05_ls{ls:03d}", params(["tsurf"], ls, averaging="off", fixed_lt=True, localtime=5.0))
    print("MCD fetch complete" if ok else "MCD fetch finished with failures")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
