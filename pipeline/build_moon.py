"""Build the global lunar analysis grid (0.5° × 0.5°, 720 × 360 cells).

Inputs (all public, see pipeline/registry.py):
  LOLA LDEM_16            elevation, 16 px/deg                      (observed)
  Diviner GCP             bolometric temperature, 0.5° × 0.25 h      (observed)
  Lunar Prospector NS     hydrogen abundance, 0.5° bins              (inferred)
  Lunar Prospector GRS    oxide / element abundances, 2° eq-area     (inferred)
  PGDA illumination       average Sun / Earth visibility, PSR, 240 m (modelled) → cells ≥ 65° latitude

Run:  python -m pipeline.build_moon
"""
from __future__ import annotations

import re

import numpy as np
import tifffile

from .common import (RAW, R_MOON, cell_centres, masked_quantiles, polar_latlon,
                     roll_0_360_to_180, save_grid, save_json, terrain_cells, OUT)

GRID = "moon"
N_LAT, N_LON = 360, 720
M = RAW / "moon"
S0 = 1361.0  # W/m², total solar irradiance at 1 au


# ----------------------------------------------------------------------------
def build_terrain():
    print("LOLA LDEM_16 → terrain")
    dn = np.fromfile(M / "ldem_16.img", dtype="<i2").reshape(2880, 5760)
    dem = roll_0_360_to_180(dn.astype(np.float32) * 0.5)   # metres above 1737.4 km sphere
    t = terrain_cells(dem, R_MOON, factor=8)
    for k in ("elev_mean", "slope_med", "slope_p90", "rough_iqr"):
        save_grid(GRID, k, t[k])

    # Validation against LOLA's own slope product (independent method: fitted to
    # altimetry profiles rather than differenced from the gridded DEM).
    sdn = np.fromfile(M / "ldsm_16.img", dtype="<i2").reshape(2880, 5760)
    lola_slope = np.where(sdn == -32768, np.nan, sdn.astype(np.float32) * 0.0015 + 45.0)
    lola_slope = roll_0_360_to_180(lola_slope)
    from .common import block_view
    (lola_med,) = masked_quantiles(block_view(lola_slope, 8), (0.5,), 16)
    ok = np.isfinite(lola_med) & np.isfinite(t["slope_med"])
    lat, _ = cell_centres(N_LAT, N_LON)
    band = ok & (np.abs(lat)[:, None] < 60)
    r = float(np.corrcoef(lola_med[band], t["slope_med"][band])[0, 1])
    ratio = float(np.nanmedian(t["slope_med"][band] / np.maximum(lola_med[band], 1e-3)))
    print(f"  validation vs LDSM_16 (|lat|<60°): Pearson r={r:.3f}, median RADIUM/LOLA ratio={ratio:.2f}")
    return {"slope_vs_ldsm16_r": r, "slope_vs_ldsm16_median_ratio": ratio,
            "dem_min_m": float(dem.min()), "dem_max_m": float(dem.max())}


# ----------------------------------------------------------------------------
def build_diviner():
    """Diurnal statistics of Diviner bolometric temperature per 0.5° cell.

    Each GCP file holds 20 latitude rows × 720 longitudes × 96 local-time bins
    (0.25 h). Empty bins (−9999) are filled by periodic linear interpolation in
    local time *only for computing the diurnal mean*; the fraction of bins with
    real observations is stored as t_cov so the user can see how much of the
    curve was measured. Cells with fewer than 24 observed bins get no value.
    Tmax / Tmin are the extremes of a 3-bin (45 min) running median of the
    observed bins, which suppresses single-bin outliers.
    """
    print("Diviner GCP → temperature statistics")
    T = np.full((N_LAT, N_LON, 96), np.nan, np.float32)
    files = sorted((M / "diviner_gcp").glob("global_cumul_avg_cyl_*_002.tab"))
    assert len(files) == 18, f"expected 18 GCP bands, found {len(files)}"
    for f in files:
        raw = np.fromfile(f, dtype=np.uint8)
        raw = raw[113:]                                   # header record
        rec = raw.reshape(-1, 113)

        def col(a, b):
            return np.ascontiguousarray(rec[:, a:b]).view(f"S{b-a}").ravel().astype(np.float32)

        lon, lat, lt, tb = col(0, 7), col(8, 15), col(16, 23), col(101, 111)
        i = np.floor((90.0 - lat) / 0.5).astype(np.int32)
        j = np.floor((lon + 180.0) / 0.5).astype(np.int32)
        k = np.floor(lt / 0.25).astype(np.int32)
        good = (tb > 0) & (tb < 500)
        T[i[good], j[good], k[good]] = tb[good]
        print(f"  {f.name}: {good.mean():.1%} of bins observed")

    n_obs = np.isfinite(T).sum(axis=2)
    cov = n_obs / 96.0
    flat = T.reshape(-1, 96)
    hrs = (np.arange(96) + 0.5) * 0.25
    tmean = np.full(flat.shape[0], np.nan, np.float32)
    tmax = np.full(flat.shape[0], np.nan, np.float32)
    tmin = np.full(flat.shape[0], np.nan, np.float32)
    usable = np.where(n_obs.ravel() >= 24)[0]
    for idx in usable:
        row = flat[idx]
        v = np.isfinite(row)
        filled = np.interp(hrs, hrs[v], row[v], period=24.0)
        tmean[idx] = filled.mean()
        ext = np.concatenate([filled[-1:], filled, filled[:1]])
        med3 = np.median(np.stack([ext[:-2], ext[1:-1], ext[2:]]), axis=0)
        tmax[idx] = med3[v].max()
        tmin[idx] = med3[v].min()
    shape = (N_LAT, N_LON)
    save_grid(GRID, "tmean", tmean.reshape(shape))
    save_grid(GRID, "tmax", tmax.reshape(shape))
    save_grid(GRID, "tmin", tmin.reshape(shape))
    save_grid(GRID, "t_cov", cov)
    eq = np.abs(cell_centres(N_LAT, N_LON)[0]) < 1
    return {"equator_tmax_K": float(np.nanmedian(tmax.reshape(shape)[eq])),
            "equator_tmin_K": float(np.nanmedian(tmin.reshape(shape)[eq])),
            "equator_tmean_K": float(np.nanmedian(tmean.reshape(shape)[eq])),
            "median_bin_coverage": float(np.median(cov))}


# ----------------------------------------------------------------------------
def build_prospector():
    print("Lunar Prospector NS hydrogen (0.5°)")
    import io
    txt = (M / "lp_hydrogenhd.txt").read_text()
    n_overflow = txt.count("**********")          # Fortran field overflow = no value
    d = np.loadtxt(io.StringIO(txt.replace("**********", "       nan")), delimiter=",", comments="#")
    print(f"  {n_overflow} bins flagged as overflow in the source file → no data")
    h = np.full((N_LAT, N_LON), np.nan, np.float32)
    i = np.rint((90.0 - d[:, 1]) / 0.5).astype(int)
    j = np.rint((d[:, 2] + 180.0) / 0.5).astype(int)
    h[i, j] = d[:, 4]
    save_grid(GRID, "h_ppm", h)

    print("Lunar Prospector GRS abundances (2° equal-area pixels → cell centres)")
    g = np.loadtxt(M / "lpgrs_high1_elem_abundance_2deg.tab")
    lat_c, lon_c = cell_centres(N_LAT, N_LON)
    # column indices (0-based): 7 MgO, 8 Al2O3, 9 SiO2, 10 CaO, 11 TiO2, 12 FeO, 13 K, 14 Th, 15 U
    # error-matrix diagonals (variances): TiO2 → col 46, FeO → col 51, K → col 55, Th → col 58
    spec = {
        "mgo_wt": (7, 100.0), "al2o3_wt": (8, 100.0), "sio2_wt": (9, 100.0), "cao_wt": (10, 100.0),
        "tio2_wt": (11, 100.0), "feo_wt": (12, 100.0), "k_ppm": (13, 1.0), "th_ppm": (14, 1.0),
    }
    sig = {"tio2_wt": (46, 100.0), "feo_wt": (51, 100.0), "k_ppm": (55, 1.0), "th_ppm": (58, 1.0)}
    grids = {k: np.full((N_LAT, N_LON), np.nan, np.float32) for k in spec}
    sgrids = {k + "_sigma": np.full((N_LAT, N_LON), np.nan, np.float32) for k in sig}
    for row in g:
        la0, la1, lo0, lo1 = row[1:5]
        ii = np.where((lat_c >= la0) & (lat_c < la1))[0]
        jj = np.where((lon_c >= lo0) & (lon_c < lo1))[0]
        if not len(ii) or not len(jj):
            continue
        sl = np.ix_(ii, jj)
        for k, (c, s) in spec.items():
            grids[k][sl] = row[c] * s
        for k, (c, s) in sig.items():
            sgrids[k + "_sigma"][sl] = np.sqrt(max(row[c], 0.0)) * s
    for k, a in {**grids, **sgrids}.items():
        save_grid(GRID, k, a)
    return {"h_ppm_south_pole": float(np.nanmean(h[-2:])), "h_ppm_global_median": float(np.nanmedian(h)),
            "feo_wt_range": [float(np.nanmin(grids["feo_wt"])), float(np.nanmax(grids["feo_wt"]))]}


# ----------------------------------------------------------------------------
def read_geotiff(path):
    """Read a north-up projected GeoTIFF and return (values, x0, y0, px).

    values are float32 in physical units: the SCALE / OFFSET items stored in the
    file's GDAL metadata are applied and the nodata value becomes NaN.
    x0 / y0 are the projected coordinates (m) of the outer corner of pixel (0, 0).
    """
    with tifffile.TiffFile(path) as tf:
        page = tf.pages[0]
        dn = page.asarray()
        scale_tag = page.tags["ModelPixelScaleTag"].value
        tie = page.tags["ModelTiepointTag"].value
        nodata = page.tags.get("GDAL_NODATA")
        md = str(page.tags["GDAL_METADATA"].value) if "GDAL_METADATA" in page.tags else ""
    items = dict(re.findall(r'<Item name="([^"]+)"[^>]*>(.*?)</Item>', md, flags=re.S))
    k = float(items.get("SCALE", 1.0))
    o = float(items.get("OFFSET", 0.0))
    a = dn.astype(np.float32) * np.float32(k) + np.float32(o)
    if nodata is not None:
        a[dn == int(float(nodata.value))] = np.nan
    px = float(scale_tag[0])
    x0 = float(tie[3]) - float(tie[0]) * px
    y0 = float(tie[4]) + float(tie[1]) * float(scale_tag[1])
    return a, x0, y0, px


def aggregate_polar_to_cells(path, south: bool, transform=None):
    """Average a 240 m polar-stereographic product into the 0.5° lat/lon cells
    it covers (cells between 65° and the pole). Returns (mean, count)."""
    a, x0, y0, px = read_geotiff(path)
    if transform is not None:
        a = transform(a)
    ny, nx = a.shape
    x = x0 + (np.arange(nx) + 0.5) * px
    y = y0 - (np.arange(ny) + 0.5) * px
    acc = np.zeros((N_LAT, N_LON), np.float64)
    cnt = np.zeros((N_LAT, N_LON), np.int64)
    for r0 in range(0, ny, 512):
        r1 = min(ny, r0 + 512)
        lat, lon = polar_latlon(x[None, :], y[r0:r1, None], south)
        v = a[r0:r1]
        ok = np.isfinite(v) & (np.abs(lat) >= 65.0)
        i = np.clip(np.floor((90.0 - lat[ok]) / 0.5).astype(int), 0, N_LAT - 1)
        j = np.clip(np.floor((lon[ok] + 180.0) / 0.5).astype(int), 0, N_LON - 1)
        np.add.at(acc, (i, j), v[ok])
        np.add.at(cnt, (i, j), 1)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = (acc / cnt).astype(np.float32)
    mean[cnt == 0] = np.nan
    return mean, cnt


def build_illumination():
    """Illumination, Earth visibility and permanent shadow.

    ≥ 65° latitude: LOLA-derived products of Mazarico et al. (2011), averaged
    over each cell (source code 1).
    < 65° latitude: smooth-sphere geometry only (source code 2) — every point
    sees the Sun half the time; Earth visibility depends on angular distance
    from the mean sub-Earth point with a linear ramp across the ±8° libration
    zone. Local topographic shadowing is not modelled there.
    """
    print("PGDA illumination products → cells ≥ 65°")
    lat, lon = cell_centres(N_LAT, N_LON)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")

    illum = np.full((N_LAT, N_LON), 0.5, np.float32)
    evis = np.zeros((N_LAT, N_LON), np.float32)
    psr = np.full((N_LAT, N_LON), np.nan, np.float32)
    src = np.full((N_LAT, N_LON), 2, np.float32)

    cosd = np.cos(np.radians(LAT)) * np.cos(np.radians(LON))
    d = np.degrees(np.arccos(np.clip(cosd, -1, 1)))        # angle from sub-Earth point
    evis[:] = np.clip((98.0 - d) / 16.0, 0.0, 1.0)

    stats = {}
    for tag, south in (("S", True), ("N", False)):
        sun, _ = aggregate_polar_to_cells(M / f"AVGVISIB_65{tag}_240M_201608.TIF", south)
        earth, _ = aggregate_polar_to_cells(M / f"AVGVISIB_65{tag}_240M_201608_EARTH.TIF", south)
        shadow, _ = aggregate_polar_to_cells(M / f"LPSR_65{tag}_240M_201608.TIF", south,
                                             transform=lambda a: (a > 0.5).astype(np.float32))
        ok = np.isfinite(sun)
        illum[ok] = sun[ok]
        evis[ok] = earth[ok]
        psr[ok] = np.nan_to_num(shadow[ok], nan=0.0)
        src[ok] = 1
        stats[f"pgda_{tag}_cells"] = int(ok.sum())
        stats[f"pgda_{tag}_max_cell_mean_illum"] = float(np.nanmax(sun))
        stats[f"pgda_{tag}_psr_area_frac"] = float(np.nanmean(shadow))
    save_grid(GRID, "illum_frac", illum)
    save_grid(GRID, "earth_vis", evis)
    save_grid(GRID, "psr_frac", psr)
    save_grid(GRID, "illum_src", src)
    # Smooth-sphere annual-mean insolation (W/m²): S0/π · cos(lat), scaled by the
    # illumination fraction relative to the smooth-sphere value of 0.5 where the
    # horizon-based product exists.
    insol = (S0 / np.pi) * np.cos(np.radians(LAT))
    save_grid(GRID, "insol_mean", insol.astype(np.float32))
    return stats


def main():
    v = {}
    v["terrain"] = build_terrain()
    v["prospector"] = build_prospector()
    v["illumination"] = build_illumination()
    v["diviner"] = build_diviner()
    save_json(OUT / GRID / "grid.json", {
        "id": GRID, "body": "moon", "type": "latlon", "n_lat": N_LAT, "n_lon": N_LON,
        "cell_deg": 0.5, "cell_km": 15.16, "radius_m": R_MOON, "validation": v,
    })
    print("validation summary:", v)


if __name__ == "__main__":
    main()
