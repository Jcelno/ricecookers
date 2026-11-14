"""Build the lunar polar analysis grids (polar stereographic, 2.4 km cells).

A latitude/longitude grid degenerates near the poles (a 0.5° cell is 130 m wide
at 89.5°), yet the poles are where horizon-controlled illumination and cold
traps matter most. Each pole therefore gets its own square grid of 254 × 254
cells, 2.4 km each, covering ±304.8 km from the pole (all latitudes ≥ 80°,
corners reach 75.9°).

Inputs:
  LOLA LDEM_75{S,N}_240M     elevation, 240 m                               (observed)
  PGDA AVGVISIB / _EARTH     average Sun and Earth visibility, 240 m        (modelled from LOLA topography)
  PGDA LPSR                  permanently shadowed regions, 240 m            (modelled from LOLA topography)
  Diviner PRP                annual mean / max temperature, ice stability   (thermal model constrained by Diviner)
  Lunar Prospector           hydrogen (0.5°), oxides (2°) sampled at cell centre

Run:  python -m pipeline.build_moon_polar
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

from .build_moon import read_geotiff
from .common import (OUT, RAW, R_MOON, block_view, cell_centres, detrended_height_planar,
                     load_grid, masked_quantiles, polar_latlon, polar_xy, save_grid, save_json,
                     slope_raster_planar)

M = RAW / "moon"
PX = 240.0            # source pixel (m)
F = 10                # source pixels per cell side
CELL = PX * F         # 2400 m
N = 254               # cells per side
HALF = N * CELL / 2   # 304 800 m
COARSE_F = 8          # 240 m × 8 = 1.92 km, matching the global DEM pixel
WIN = 15              # 15 × 1.92 km = 28.8 km window, matching global cell statistics


def crop_centre(a: np.ndarray, centre_px: float, half_m: float) -> np.ndarray:
    h = int(round(half_m / PX))
    c = int(round(centre_px))
    return a[c - h:c + h, c - h:c + h]


def table_fields(path, n_bytes):
    """Split a fixed-width, comma-separated PDS ASCII table into byte columns."""
    raw = np.fromfile(path, dtype=np.uint8)
    rec = raw[n_bytes:].reshape(-1, n_bytes)       # drop the header record
    commas = np.where(rec[0] == ord(","))[0]
    edges = np.concatenate([[-1], commas, [n_bytes - 2]])

    def col(k):
        a, b = edges[k] + 1, edges[k + 1]
        return np.ascontiguousarray(rec[:, a:b]).view(f"S{b-a}").ravel().astype(np.float64)
    return col


def build(pole: str):
    south = pole == "S"
    grid = "moon_sp" if south else "moon_np"
    tag = pole.lower()
    print(f"== {grid} ==")
    val = {}

    # ---- cell geometry -------------------------------------------------------
    xc = -HALF + (np.arange(N) + 0.5) * CELL
    yc = HALF - (np.arange(N) + 0.5) * CELL
    X, Y = np.meshgrid(xc, yc)
    LAT, LON = polar_latlon(X, Y, south)
    save_grid(grid, "lat", LAT)
    save_grid(grid, "lon", LON)

    # ---- elevation & terrain ---------------------------------------------------
    dn = np.fromfile(M / f"ldem_75{tag}_240m.img", dtype="<i2").reshape(3812, 3812)
    dem_full = dn.astype(np.float32) * 0.5
    dem = crop_centre(dem_full, 1906, HALF)                      # 2540 × 2540
    save_grid(grid, "elev_mean", block_view(dem, F).mean(axis=-1))

    s480 = slope_raster_planar(dem_full, PX, step=1)
    s480 = crop_centre(s480, 1906, HALF)
    med, p90 = masked_quantiles(block_view(s480, F), (0.5, 0.9))
    save_grid(grid, "slope480_med", med)
    save_grid(grid, "slope480_p90", p90)

    # Regional terrain statistics with the same definition as the global grids:
    # ~1.9 km pixels, 2-pixel baseline, statistics over a ~29 km neighbourhood.
    big_half = HALF + (WIN // 2 + 2) * PX * COARSE_F
    h = int(round(big_half / (PX * COARSE_F))) * COARSE_F
    big = dem_full[1906 - h:1906 + h, 1906 - h:1906 + h]
    coarse = block_view(big, COARSE_F).mean(axis=-1)
    cpx = PX * COARSE_F
    cs = slope_raster_planar(coarse, cpx, step=1)
    ch = detrended_height_planar(coarse, step=1)
    s_med = ndimage.percentile_filter(cs, 50, size=WIN, mode="nearest")
    s_p90 = ndimage.percentile_filter(cs, 90, size=WIN, mode="nearest")
    h_iqr = (ndimage.percentile_filter(ch, 75, size=WIN, mode="nearest")
             - ndimage.percentile_filter(ch, 25, size=WIN, mode="nearest"))
    ci = np.clip(np.floor((h * PX - Y) / cpx).astype(int), 0, coarse.shape[0] - 1)
    cj = np.clip(np.floor((X + h * PX) / cpx).astype(int), 0, coarse.shape[1] - 1)
    save_grid(grid, "slope_med", s_med[ci, cj])
    save_grid(grid, "slope_p90", s_p90[ci, cj])
    save_grid(grid, "rough_iqr", h_iqr[ci, cj])

    # ---- illumination, Earth visibility, permanent shadow ------------------
    sun, x0, y0, px = read_geotiff(M / f"AVGVISIB_65{pole}_240M_201608.TIF")
    assert px == PX and abs(x0 + y0) < 1e-6
    c_px = -x0 / PX                                               # pixel index of the pole
    sun_c = crop_centre(sun, c_px, HALF)
    earth, *_ = read_geotiff(M / f"AVGVISIB_65{pole}_240M_201608_EARTH.TIF")
    earth_c = crop_centre(earth, c_px, HALF)
    psr_full, *_ = read_geotiff(M / f"LPSR_65{pole}_240M_201608.TIF")
    psr_bool = psr_full > 0.5
    psr_c = crop_centre(psr_bool, c_px, HALF)

    sv = block_view(sun_c, F)
    save_grid(grid, "illum_frac", np.nanmean(sv, axis=-1))
    save_grid(grid, "illum_max", np.nanmax(sv, axis=-1))
    save_grid(grid, "earth_vis", np.nanmean(block_view(earth_c, F), axis=-1))
    save_grid(grid, "psr_frac", block_view(psr_c.astype(np.float32), F).mean(axis=-1))

    # Buildable ground: 240 m pixels whose slope (480 m baseline) is 10° or less,
    # and the sunlight available on that ground. Asking "does this cell contain
    # gentle, well-lit ground?" suits ridge-top sites, where a cell-median slope
    # would reject a cell that holds a usable shelf beside a steep crater wall.
    flat = s480 <= 10.0
    fv = block_view(flat.astype(np.float32), F)
    save_grid(grid, "flat_frac", fv.mean(axis=-1))
    sun_flat = np.where(flat, sun_c, np.nan)
    with np.errstate(all="ignore"):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            save_grid(grid, "illum_flat_max", np.nanmax(block_view(sun_flat, F), axis=-1))

    # Permanently shadowed regions of at least 1 km² (18 pixels of 240 m):
    # isolated shadowed pixels are not treated as reachable cold traps.
    lab, n_lab = ndimage.label(psr_bool)
    sizes = np.bincount(lab.ravel())
    keep = sizes >= 18
    keep[0] = False
    psr_big = keep[lab]
    val["psr_regions_total"] = int(n_lab)
    val["psr_regions_ge_1km2"] = int(keep.sum())
    val["psr_pixel_share_in_regions_ge_1km2"] = float(psr_big.sum() / max(1, psr_bool.sum()))

    # distance to the nearest permanently shadowed region ≥ 1 km² (km), averaged per cell
    margin = 150_000.0
    psr_m = crop_centre(psr_big, c_px, HALF + margin)
    dist = ndimage.distance_transform_edt(~psr_m, sampling=PX).astype(np.float32) / 1000.0
    mpx = int(round(margin / PX))
    dist_c = dist[mpx:-mpx, mpx:-mpx]
    save_grid(grid, "dist_psr_km", block_view(dist_c, F).mean(axis=-1))

    # validation: brightest pixel and PSR area poleward of 80°
    iy, ix = np.unravel_index(np.nanargmax(sun_c), sun_c.shape)
    bx = -HALF + (ix + 0.5) * PX
    by = HALF - (iy + 0.5) * PX
    blat, blon = polar_latlon(bx, by, south)
    yy, xx = np.mgrid[0:sun_c.shape[0], 0:sun_c.shape[1]]
    r = np.hypot(-HALF + (xx + 0.5) * PX, HALF - (yy + 0.5) * PX)
    k = 1.0 / (1.0 + (r / (2 * R_MOON)) ** 2) ** 2               # true area per unit map area
    inside80 = r <= 2 * R_MOON * np.tan(np.radians(5.0))
    val["max_avg_illumination"] = float(np.nanmax(sun_c))
    val["max_avg_illumination_lat"] = float(blat)
    val["max_avg_illumination_lon_e"] = float(blon % 360)
    val["psr_area_km2_poleward_80"] = float(((psr_c & inside80) * k).sum() * (PX / 1000.0) ** 2)

    # ---- Diviner polar resource product --------------------------------------
    col = table_fields(M / f"dlre_prp_{'south' if south else 'north'}.tab", 210)
    lon_t, lat_t, alt_t = col(9), col(10), col(11)
    tavg, tmax, ice = col(12), col(13), col(14)
    if not south:
        # DATA QUIRK (verified, see docs/methodology.md §Diviner PRP north):
        # the north-polar PRP table lists longitudes mirrored about the
        # 90°E–270°E axis. Binned as given, PRP triangle altitudes correlate
        # with LOLA topography at r = 0.11; with lon = 180° − lon_listed the
        # correlation is r = 0.999. LOLA's own orientation was confirmed
        # independently with IAU crater coordinates (21 craters, median
        # rim-minus-floor relief 1.4 km in the standard orientation, 0.09 km
        # mirrored). The south-polar table needs no correction (r = 0.9997).
        lon_t = 180.0 - lon_t
        val["prp_north_longitude_correction"] = "lon = 180 - lon_listed"
    tx, ty = polar_xy(lat_t, lon_t, south)
    inb = (np.abs(tx) < HALF) & (np.abs(ty) < HALF)
    j = np.floor((tx[inb] + HALF) / CELL).astype(int)
    i = np.floor((HALF - ty[inb]) / CELL).astype(int)
    cnt = np.zeros((N, N))
    np.add.at(cnt, (i, j), 1)

    def mean_of(v, ok=None):
        acc = np.zeros((N, N))
        c = np.zeros((N, N))
        m = np.ones(v.shape, bool) if ok is None else ok
        np.add.at(acc, (i[m], j[m]), v[m])
        np.add.at(c, (i[m], j[m]), 1)
        with np.errstate(invalid="ignore", divide="ignore"):
            out = acc / c
        out[c == 0] = np.nan
        return out

    tavg_i, tmax_i, ice_i, alt_i = tavg[inb], tmax[inb], ice[inb], alt_t[inb]
    good_t = (tavg_i > 0) & (tmax_i > 0)
    save_grid(grid, "tmean", mean_of(tavg_i, good_t))
    save_grid(grid, "tmax", mean_of(tmax_i, good_t))
    tmin_of_max = np.full((N, N), np.inf)
    np.minimum.at(tmin_of_max, (i[good_t], j[good_t]), tmax_i[good_t])
    tmin_of_max[~np.isfinite(tmin_of_max)] = np.nan
    save_grid(grid, "tmax_coldest", tmin_of_max)
    with np.errstate(invalid="ignore", divide="ignore"):
        save_grid(grid, "coldtrap_frac", np.where(cnt > 0, mean_of((tmax_i < 110.0).astype(float), good_t), np.nan))
        save_grid(grid, "ice_surf_frac", np.where(cnt > 0, mean_of((ice_i == 0.0).astype(float)), np.nan))
        save_grid(grid, "ice_1m_frac", np.where(cnt > 0, mean_of(((ice_i >= 0.0) & (ice_i <= 1.0)).astype(float)), np.nan))
    val["prp_triangles_in_grid"] = int(inb.sum())
    val["prp_ice_depth_values"] = {"min": float(ice_i.min()), "max": float(ice_i.max()),
                                   "frac_surface_stable": float((ice_i == 0).mean()),
                                   "frac_not_stable_flag": float((ice_i < 0).mean())}
    # orientation check: PRP triangle altitude vs LOLA DEM on the same cells
    prp_alt = mean_of(alt_i * 1000.0)
    dem_cell = block_view(dem, F).mean(axis=-1)
    okc = np.isfinite(prp_alt)
    val["orientation_check_r_prp_alt_vs_lola"] = float(np.corrcoef(prp_alt[okc], dem_cell[okc])[0, 1])

    # ---- coarse global products sampled at cell centres ----------------------
    glat, glon = cell_centres(360, 720)
    gi = np.clip(np.floor((90.0 - LAT) / 0.5).astype(int), 0, 359)
    gj = np.clip(np.floor((LON + 180.0) / 0.5).astype(int), 0, 719)
    for name in ("h_ppm", "feo_wt", "tio2_wt", "th_ppm", "k_ppm", "mgo_wt", "al2o3_wt", "sio2_wt", "cao_wt",
                 "feo_wt_sigma", "tio2_wt_sigma", "th_ppm_sigma", "k_ppm_sigma"):
        save_grid(grid, name, load_grid("moon", name)[gi, gj])
    save_grid(grid, "insol_mean", (1361.0 / np.pi) * np.cos(np.radians(LAT)))

    save_json(OUT / grid / "grid.json", {
        "id": grid, "body": "moon", "type": "polar", "south": south, "n": N, "cell_m": CELL,
        "half_m": HALF, "radius_m": R_MOON, "cell_km": CELL / 1000.0, "validation": val,
    })
    print("  validation:", val)
    return psr_big, x0, y0


def global_dist_psr(psr_s, psr_n, x0, y0):
    """Great-circle distance (km) from every global cell centre to the nearest
    mapped permanently shadowed pixel (products cover latitudes ≥ 65°)."""
    pts = []
    for psr, south in ((psr_s, True), (psr_n, False)):
        sub = psr[::3, ::3]
        iy, ix = np.nonzero(sub)
        x = x0 + (ix * 3 + 0.5) * PX
        y = y0 - (iy * 3 + 0.5) * PX
        la, lo = polar_latlon(x, y, south)
        pts.append(np.column_stack([np.radians(la), np.radians(lo)]))
    p = np.vstack(pts)
    xyz = np.column_stack([np.cos(p[:, 0]) * np.cos(p[:, 1]), np.cos(p[:, 0]) * np.sin(p[:, 1]), np.sin(p[:, 0])])
    tree = cKDTree(xyz)
    lat, lon = cell_centres(360, 720)
    LA, LO = np.meshgrid(np.radians(lat), np.radians(lon), indexing="ij")
    q = np.column_stack([(np.cos(LA) * np.cos(LO)).ravel(), (np.cos(LA) * np.sin(LO)).ravel(), np.sin(LA).ravel()])
    chord, _ = tree.query(q, workers=-1)
    d = 2 * np.arcsin(np.clip(chord / 2, 0, 1)) * R_MOON / 1000.0
    save_grid("moon", "dist_psr_km", d.reshape(360, 720))


def main():
    psr_s, x0, y0 = build("S")
    psr_n, _, _ = build("N")
    global_dist_psr(psr_s, psr_n, x0, y0)


if __name__ == "__main__":
    main()
