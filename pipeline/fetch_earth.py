"""Fetch the Earth-observation inputs that are not plain file downloads.

1. NASA GIBS (Global Imagery Browse Services) — MODIS vegetation index and
   land-cover maps. GIBS serves these science layers as palette images whose
   colours map one-to-one onto data-value bins through a published colour-map
   document (the mechanism NASA Worldview uses to read values under the
   cursor). We request each map once at 0.05° (7200 × 3600) with
   nearest-neighbour sampling and keep the PNG plus the colour map; decoding
   happens in build_earth.py.

2. NASA POWER climatology (MERRA-2 reanalysis 0.5° × 0.625°, CERES SYN1deg 1°)
   read from the project's public Zarr stores on AWS Open Data and cached as
   compressed NumPy archives.

Run:  python -m pipeline.fetch_earth
"""
from __future__ import annotations

import sys
import time

import numpy as np
import requests

from .common import RAW

UA = {"User-Agent": "Mozilla/5.0 (research-client)"}
GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
GIBS_DIR = RAW / "earth" / "gibs"
POWER_DIR = RAW / "earth" / "power"
POWER_S3 = "https://nasa-power.s3.us-west-2.amazonaws.com/"

NDVI_LAYER = "MODIS_Terra_L3_NDVI_Monthly"
NDVI_YEAR = 2019
IGBP_LAYER = "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual"
IGBP_DATE = "2022-01-01"

MERRA2_VARS = ["TS", "TS_MAX", "TS_MIN", "T2M", "PS", "PRECTOTCORR", "GWETTOP", "FRSNO", "WS10M", "RH2M"]
SYN1DEG_VARS = ["ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN", "TOA_SW_DWN", "AOD_55", "ALLSKY_SRF_ALB"]


def gibs_map(layer: str, date: str, width=7200, height=3600) -> bool:
    out = GIBS_DIR / f"{layer}_{date}.png"
    if out.exists() and out.stat().st_size > 50_000:
        print(f"[skip] {out.name}")
        return True
    p = {"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": layer, "STYLES": "",
         "FORMAT": "image/png", "TRANSPARENT": "true", "CRS": "EPSG:4326",
         "BBOX": "-90,-180,90,180", "WIDTH": width, "HEIGHT": height, "TIME": date}
    for attempt in range(1, 6):
        try:
            r = requests.get(GIBS_WMS, params=p, headers=UA, timeout=300)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/png"):
                out.write_bytes(r.content)
                print(f"[ok]   {out.name} {len(r.content)//1024} kB", flush=True)
                return True
            raise RuntimeError(f"HTTP {r.status_code} {r.headers.get('content-type')} {r.text[:120]}")
        except Exception as e:  # noqa: BLE001
            print(f"[retry {attempt}] {out.name}: {str(e)[:140]}", flush=True)
            time.sleep(10 * attempt)
    return False


def power_store(store: str, names, out_name: str) -> bool:
    out = POWER_DIR / out_name
    if out.exists():
        print(f"[skip] {out.name}")
        return True
    import fsspec
    import zarr
    g = zarr.open_consolidated(fsspec.get_mapper(POWER_S3 + store), mode="r")
    data = {"lat": np.asarray(g["lat"][:]), "lon": np.asarray(g["lon"][:]), "time": np.asarray(g["time"][:])}
    attrs = {}
    for n in names:
        if n not in g:
            print(f"[warn] {n} missing in {store}")
            continue
        a = g[n]
        arr = np.asarray(a[:], dtype=np.float32)
        fill = a.attrs.get("_FillValue", a.fill_value)
        if fill is not None:
            arr[arr == np.float32(fill)] = np.nan
        arr[arr <= -900] = np.nan
        data[n] = arr
        attrs[n] = f"{a.attrs.get('long_name', n)} [{a.attrs.get('units', '')}]"
        print(f"[ok]   {store.split('/')[-1]}:{n} {arr.shape} {attrs[n]}", flush=True)
    data["_attrs"] = np.array([f"{k}={v}" for k, v in attrs.items()])
    np.savez_compressed(out, **data)
    return True


def main() -> int:
    GIBS_DIR.mkdir(parents=True, exist_ok=True)
    POWER_DIR.mkdir(parents=True, exist_ok=True)
    ok = True
    ok &= power_store("merra2/spatial/power_merra2_climatology_spatial_utc.zarr", MERRA2_VARS, "merra2_climatology.npz")
    ok &= power_store("syn1deg/spatial/power_syn1deg_climatology_spatial_utc.zarr", SYN1DEG_VARS, "syn1deg_climatology.npz")
    for name in ("MODIS_L3_NDVI", "MODIS_IGBP_Land_Cover_Type"):
        f = GIBS_DIR / f"{name}.xml"
        if not f.exists():
            f.write_bytes(requests.get(f"https://gibs.earthdata.nasa.gov/colormaps/v1.3/{name}.xml", headers=UA, timeout=60).content)
    ok &= gibs_map(IGBP_LAYER, IGBP_DATE)
    for m in range(1, 13):
        ok &= gibs_map(NDVI_LAYER, f"{NDVI_YEAR}-{m:02d}-01")
    print("Earth fetch complete" if ok else "Earth fetch finished with failures")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
