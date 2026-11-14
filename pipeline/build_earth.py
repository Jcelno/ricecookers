"""Build the global Earth analysis grid (0.25° × 0.25°, 1440 × 720 cells ≈ 27.8 km).

Inputs:
  ETOPO 2022 (60 arc-second, ice surface)   elevation                      (observed / compiled)
  MODIS IGBP land cover via GIBS (0.05°)    land-cover class fractions      (classified observation)
  MODIS Terra NDVI monthly via GIBS (0.05°) vegetation index, 2019          (observed, 0.01 bins)
  NASA POWER / MERRA-2 (0.5° × 0.625°)      skin temperature, pressure,
                                            precipitation, soil wetness,
                                            snow cover, wind, humidity      (reanalysis)
  NASA POWER / CERES SYN1deg (1°)           surface & TOA shortwave, AOD,
                                            surface albedo                  (satellite-derived)
  GLiM v1.0 (0.5°)                          surface lithology class         (compiled geological maps)

Run:  python -m pipeline.build_earth
"""
from __future__ import annotations

import io
import re
import zipfile

import netCDF4
import numpy as np
from PIL import Image

from .common import (OUT, RAW, R_EARTH, block_view, cell_centres, regrid_bilinear, save_grid, save_json,
                     terrain_cells)
from .fetch_earth import IGBP_DATE, IGBP_LAYER, NDVI_LAYER, NDVI_YEAR

GRID = "earth"
N_LAT, N_LON = 720, 1440
E = RAW / "earth"
Image.MAX_IMAGE_PIXELS = None

IGBP_NAMES = {
    1: "Evergreen needleleaf forest", 2: "Evergreen broadleaf forest", 3: "Deciduous needleleaf forest",
    4: "Deciduous broadleaf forest", 5: "Mixed forest", 6: "Closed shrubland", 7: "Open shrubland",
    8: "Woody savanna", 9: "Savanna", 10: "Grassland", 11: "Permanent wetland", 12: "Cropland",
    13: "Urban and built-up", 14: "Cropland / natural vegetation mosaic", 15: "Permanent snow and ice",
    16: "Barren", 17: "Water",
}


def packed_rgb(path):
    a = np.asarray(Image.open(path).convert("RGBA"))
    key = (a[..., 0].astype(np.uint32) << 16) | (a[..., 1].astype(np.uint32) << 8) | a[..., 2].astype(np.uint32)
    return key, a[..., 3] > 0


def lookup(key, opaque, table: dict, default=np.nan, dtype=np.float32):
    ks = np.array(sorted(table), dtype=np.uint32)
    vs = np.array([table[k] for k in ks], dtype=dtype)
    idx = np.clip(np.searchsorted(ks, key), 0, len(ks) - 1)
    hit = (ks[idx] == key) & opaque
    out = np.full(key.shape, default, dtype=dtype)
    out[hit] = vs[idx][hit]
    return out, hit


def build_landcover():
    print("MODIS IGBP land cover (GIBS) → class fractions")
    xml = (E / "gibs" / "MODIS_IGBP_Land_Cover_Type.xml").read_text()
    table = {}
    for r, g, b, sv in re.findall(r'<ColorMapEntry rgb="(\d+),(\d+),(\d+)"[^>]*?sourceValue="([^"]+)"', xml):
        cls = int(sv.split(",")[-1])
        if cls <= 17:
            table[(int(r) << 16) | (int(g) << 8) | int(b)] = cls
    key, opaque = packed_rgb(E / "gibs" / f"{IGBP_LAYER}_{IGBP_DATE}.png")
    cls, hit = lookup(key, opaque, table, default=0, dtype=np.uint8)
    unmatched = float((opaque & ~hit).mean())
    v = block_view(cls, 5)                                    # 0.05° → 0.25°
    n = float(v.shape[-1])
    frac = lambda classes: np.isin(v, classes).sum(axis=-1) / n   # noqa: E731
    classified = (v > 0).sum(axis=-1) / n
    water = frac([17])
    save_grid(GRID, "lc_classified", classified)
    save_grid(GRID, "water_frac", water)
    save_grid(GRID, "barren_frac", frac([16]))
    save_grid(GRID, "ice_frac", frac([15]))
    save_grid(GRID, "veg_frac", frac(list(range(1, 13)) + [14]))
    save_grid(GRID, "urban_crop_frac", frac([12, 13, 14]))
    # land = classified and not water
    land = np.clip(classified - water, 0, 1)
    save_grid(GRID, "land_frac", land)
    counts = np.stack([(v == c).sum(axis=-1) for c in range(1, 18)], axis=-1)
    dom = counts.argmax(axis=-1) + 1
    save_grid(GRID, "igbp_dom", np.where(classified > 0, dom, np.nan))
    return cls, {"unmatched_colour_fraction": unmatched,
                 "global_barren_cells": int((frac([16]) > 0.9).sum()),
                 "classified_fraction": float((cls > 0).mean())}


def build_terrain(cls):
    print("ETOPO 2022 60″ → terrain (water pixels excluded)")
    ds = netCDF4.Dataset(E / "ETOPO_2022_v1_60s_N90W180_surface.nc")
    zvar = ds.variables["z"]
    lat = ds.variables["lat"][:]
    lon = ds.variables["lon"][:]
    z = np.asarray(zvar[:], dtype=np.float32)
    if lat[0] < lat[-1]:
        z = z[::-1]
    assert z.shape == (10800, 21600) and lon[0] < -179
    # water mask: IGBP water (17) or unclassified ocean (0), 0.05° → 60″ (×3)
    water = np.repeat(np.repeat((cls == 17) | (cls == 0), 3, axis=0), 3, axis=1)
    t = terrain_cells(z, R_EARTH, factor=15, mask=water, band_cells=40)
    for k in ("elev_mean", "slope_med", "slope_p90", "rough_iqr"):
        save_grid(GRID, k, t[k])

    def at(la, lo):
        return float(t["elev_mean"][int((90 - la) / 0.25), int((lo + 180) / 0.25)])
    return {"etopo_min_m": float(z.min()), "etopo_max_m": float(z.max()),
            "tibet_plateau_cell_m": at(33.0, 88.0), "dead_sea_shore_cell_m": at(31.3, 35.4),
            "south_pole_plateau_cell_m": at(-89.0, 0.0)}


def build_ndvi(cls):
    print(f"MODIS Terra NDVI monthly {NDVI_YEAR} (GIBS) → annual statistics")
    xml = (E / "gibs" / "MODIS_L3_NDVI.xml").read_text()
    table = {}
    widths = []
    for r, g, b, lo, hi in re.findall(
            r'<ColorMapEntry rgb="(\d+),(\d+),(\d+)" transparent="false"[^>]*?value="\[([-\d.]+),([-\d.]+)\)"', xml):
        table[(int(r) << 16) | (int(g) << 8) | int(b)] = 0.5 * (float(lo) + float(hi))
        widths.append(float(hi) - float(lo))
    land = (cls > 0) & (cls != 17)
    monthly = []
    valid_frac = []
    for m in range(1, 13):
        key, opaque = packed_rgb(E / "gibs" / f"{NDVI_LAYER}_{NDVI_YEAR}-{m:02d}-01.png")
        val, hit = lookup(key, opaque, table)
        val[~land] = np.nan
        v = block_view(val, 5)
        nvalid = np.isfinite(v).sum(axis=-1)
        with np.errstate(invalid="ignore"):
            mean = np.nansum(v, axis=-1) / np.maximum(nvalid, 1)
        mean[nvalid < 5] = np.nan                       # need ≥ 20 % of the cell
        monthly.append(mean.astype(np.float32))
        valid_frac.append(nvalid / 25.0)
        print(f"  month {m:02d}: {np.isfinite(mean).mean():.1%} of cells with NDVI")
    mon = np.stack(monthly)
    n_months = np.isfinite(mon).sum(axis=0)
    with np.errstate(all="ignore"):
        ndvi_max = np.nanmax(mon, axis=0)
        ndvi_mean = np.nanmean(mon, axis=0)
    ndvi_max[n_months < 3] = np.nan
    ndvi_mean[n_months < 3] = np.nan
    save_grid(GRID, "ndvi_max", ndvi_max)
    save_grid(GRID, "ndvi_mean", ndvi_mean)
    save_grid(GRID, "ndvi_months", n_months.astype(np.float32))
    return {"ndvi_bin_width": float(np.median(widths)), "ndvi_bins": len(table)}


def build_power():
    print("NASA POWER climatology → 0.25° (bilinear)")
    m = np.load(E / "power" / "merra2_climatology.npz")
    s = np.load(E / "power" / "syn1deg_climatology.npz")
    val = {"merra2_time_axis": [int(x) for x in m["time"]], "syn1deg_time_axis": [int(x) for x in s["time"]]}

    def rg(src, a):
        return regrid_bilinear(a, src["lat"], src["lon"], N_LAT, N_LON)

    # the 13 time steps are January…December followed by the annual value
    ANN, MON = 12, slice(0, 12)
    save_grid(GRID, "tmean", rg(m, m["TS"][ANN]) + 273.15)
    save_grid(GRID, "tmax", rg(m, np.nanmax(m["TS_MAX"][MON], axis=0)) + 273.15)
    save_grid(GRID, "tmin", rg(m, np.nanmin(m["TS_MIN"][MON], axis=0)) + 273.15)
    save_grid(GRID, "t_seasonal", rg(m, np.nanmax(m["TS"][MON], axis=0) - np.nanmin(m["TS"][MON], axis=0)))
    save_grid(GRID, "t2m_mean", rg(m, m["T2M"][ANN]) + 273.15)
    save_grid(GRID, "ps_mean", rg(m, m["PS"][ANN]) * 100.0)                 # hPa → Pa
    save_grid(GRID, "precip_mm_yr", rg(m, m["PRECTOTCORR"][ANN]) * 365.25)
    save_grid(GRID, "soil_wet", rg(m, m["GWETTOP"][ANN]))
    save_grid(GRID, "snow_frac", rg(m, m["FRSNO"][ANN]))
    save_grid(GRID, "wind10m", rg(m, m["WS10M"][ANN]))
    save_grid(GRID, "rh2m", rg(m, m["RH2M"][ANN]))
    save_grid(GRID, "solar_flux", rg(s, s["ALLSKY_SFC_SW_DWN"][ANN]))
    save_grid(GRID, "solar_clear", rg(s, s["CLRSKY_SFC_SW_DWN"][ANN]))
    save_grid(GRID, "solar_toa", rg(s, s["TOA_SW_DWN"][ANN]))
    save_grid(GRID, "aod55", rg(s, s["AOD_55"][ANN]))
    save_grid(GRID, "aod55_max", rg(s, np.nanmax(s["AOD_55"][MON], axis=0)))
    save_grid(GRID, "albedo", rg(s, s["ALLSKY_SRF_ALB"][ANN]))
    ts = m["TS"][ANN]
    w = np.cos(np.radians(m["lat"]))[:, None] * np.ones_like(ts)
    val["global_mean_skin_temp_K"] = float(np.nansum(ts * w) / np.nansum(w * np.isfinite(ts)) + 273.15)
    val["annual_equals_mean_of_months_max_abs_diff_K"] = float(np.nanmax(np.abs(np.nanmean(m["TS"][MON], axis=0) - ts)))
    return val


def build_glim():
    print("GLiM lithology (0.5° → 0.25° block replication)")
    z = zipfile.ZipFile(E / "glim_pangaea_788537.zip")
    names = {}
    for line in z.read("Classnames.txt").decode("latin-1").splitlines()[1:]:
        p = line.split(";")
        if len(p) >= 4:
            names[int(p[1])] = p[3].strip('"')
    a = np.loadtxt(io.BytesIO(z.read("glim_wgs84_0point5deg.txt.asc")), skiprows=6, dtype=np.float32)
    assert a.shape == (360, 720)
    a[a < 0] = np.nan
    lith = np.repeat(np.repeat(a, 2, axis=0), 2, axis=1)
    save_grid(GRID, "lith", lith)
    save_json(OUT / GRID / "lith_classes.json", names)
    return {"classes": names, "cells_with_lithology": int(np.isfinite(a).sum())}


def main():
    v = {}
    cls, v["landcover"] = build_landcover()
    v["glim"] = build_glim()
    v["power"] = build_power()
    v["ndvi"] = build_ndvi(cls)
    v["terrain"] = build_terrain(cls)
    save_json(OUT / GRID / "grid.json", {
        "id": GRID, "body": "earth", "type": "latlon", "n_lat": N_LAT, "n_lon": N_LON,
        "cell_deg": 0.25, "cell_km": 27.8, "radius_m": R_EARTH, "validation": v, "igbp_names": IGBP_NAMES,
    })
    print("validation summary:", v)


if __name__ == "__main__":
    main()
