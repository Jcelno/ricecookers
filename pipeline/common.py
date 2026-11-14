"""Shared helpers for the RADIUM data pipeline.

Everything here is deliberately small and explicit: each function documents the
method it implements so the same text can be quoted in the methodology page.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"

# Reference radii (m) used by the source products themselves.
R_MOON = 1_737_400.0   # LOLA reference sphere
R_MARS = 3_396_000.0   # MOLA MEGDR reference sphere
R_EARTH = 6_371_008.8  # mean Earth radius (IUGG)


# ----------------------------------------------------------------------------
# Output helpers
# ----------------------------------------------------------------------------
def save_grid(grid: str, name: str, arr: np.ndarray) -> None:
    """Store one variable of one grid as float32 with NaN = no data."""
    d = OUT / grid
    d.mkdir(parents=True, exist_ok=True)
    a = np.asarray(arr, dtype=np.float32)
    np.save(d / f"{name}.npy", a)
    finite = np.isfinite(a)
    cov = float(finite.mean()) if a.size else 0.0
    lo = float(np.nanmin(a)) if finite.any() else float("nan")
    hi = float(np.nanmax(a)) if finite.any() else float("nan")
    print(f"  saved {grid}/{name:<18s} shape={a.shape} coverage={cov:6.1%} range=[{lo:.4g}, {hi:.4g}]")


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False))


def load_grid(grid: str, name: str) -> np.ndarray:
    return np.load(OUT / grid / f"{name}.npy")


# ----------------------------------------------------------------------------
# Grid geometry (global equirectangular grids; row 0 = north, col 0 = 180°W)
# ----------------------------------------------------------------------------
def cell_centres(n_lat: int, n_lon: int):
    """Cell-centre latitudes (north→south) and longitudes (-180→180 east)."""
    dlat = 180.0 / n_lat
    dlon = 360.0 / n_lon
    lat = 90.0 - dlat * (np.arange(n_lat) + 0.5)
    lon = -180.0 + dlon * (np.arange(n_lon) + 0.5)
    return lat, lon


def roll_0_360_to_180(a: np.ndarray) -> np.ndarray:
    """Re-centre a raster stored 0→360°E so that column 0 is 180°W."""
    return np.roll(a, a.shape[1] // 2, axis=1)


# ----------------------------------------------------------------------------
# Robust statistics on blocks
# ----------------------------------------------------------------------------
def block_view(a: np.ndarray, f: int) -> np.ndarray:
    """(rows, cols) → (rows/f, cols/f, f*f) view-like copy for per-cell stats."""
    r, c = a.shape
    return a.reshape(r // f, f, c // f, f).transpose(0, 2, 1, 3).reshape(r // f, c // f, f * f)


def masked_quantiles(v: np.ndarray, qs, min_valid: int = 1):
    """Quantiles along the last axis ignoring NaN, fully vectorised.

    np.sort places NaN last, so the q-quantile of the valid part of each row is
    read at index q*(n_valid-1) with linear interpolation. Cells with fewer than
    `min_valid` valid samples return NaN.
    """
    s = np.sort(v, axis=-1)
    n = np.isfinite(s).sum(axis=-1)
    out = []
    for q in qs:
        pos = q * np.maximum(n - 1, 0)
        lo = np.floor(pos).astype(np.int64)
        hi = np.minimum(lo + 1, np.maximum(n - 1, 0))
        w = (pos - lo).astype(np.float32)
        a = np.take_along_axis(s, lo[..., None], axis=-1)[..., 0]
        b = np.take_along_axis(s, hi[..., None], axis=-1)[..., 0]
        r = a * (1 - w) + b * w
        r = np.where(n >= min_valid, r, np.nan)
        out.append(r.astype(np.float32))
    return out


# ----------------------------------------------------------------------------
# Terrain metrics — one method for all three bodies
# ----------------------------------------------------------------------------
def terrain_cells(dem: np.ndarray, radius_m: float, factor: int, mask: np.ndarray | None = None,
                  band_cells: int = 30, min_valid_frac: float = 0.5):
    """Per-cell terrain statistics from a global equirectangular DEM.

    Method (identical for Moon, Mars and Earth so results are comparable):

    * Slope: central differences on the sphere. North–south baseline is 2 pixels.
      The east–west step is k pixels with k = round(1 / cos(lat)) so the metric
      east–west baseline stays close to the north–south one at every latitude
      (a plain 1-pixel step would shorten the baseline toward the poles and
      bias slopes upward). slope = atan(hypot(dz/dx, dz/dy)).
    * Detrended roughness: h = z − mean(4 neighbours at the same baselines).
      A planar tilt gives h = 0, so this isolates relief at the baseline scale
      (the curvature-based idea of Kreslavsky & Head 2000). The cell value is
      the inter-quartile range of h, which is robust to isolated spikes.
    * Cell aggregation: median and 90th percentile of pixel slopes, IQR of h,
      mean elevation, over the factor × factor pixels of each cell.

    dem   : (rows, cols) float32, row 0 = north, periodic in longitude.
    mask  : optional bool array, True = pixel excluded from statistics.
    Returns dict of (rows/factor, cols/factor) float32 arrays.
    """
    rows, cols = dem.shape
    dphi = np.pi / rows
    dy = radius_m * dphi                                   # N–S pixel size (m)
    lat = np.pi / 2 - dphi * (np.arange(rows) + 0.5)       # pixel-centre latitude
    coslat = np.maximum(np.cos(lat), 1e-6)
    k = np.clip(np.rint(1.0 / coslat), 1, cols // 8).astype(np.int64)
    dx = radius_m * (2 * np.pi / cols) * coslat            # E–W pixel size (m)

    n_cl, n_cc = rows // factor, cols // factor
    res = {n: np.full((n_cl, n_cc), np.nan, np.float32)
           for n in ("elev_mean", "slope_med", "slope_p90", "rough_iqr", "valid_frac")}

    for c0 in range(0, n_cl, band_cells):
        c1 = min(n_cl, c0 + band_cells)
        r0, r1 = c0 * factor, c1 * factor
        a0, a1 = max(0, r0 - 1), min(rows, r1 + 1)
        z = dem[a0:a1].astype(np.float32)
        # replicate the edge row at the poles so every pixel has N and S neighbours
        if a0 == r0:
            z = np.vstack([z[:1], z])
        if a1 == r1:
            z = np.vstack([z, z[-1:]])
        zc = z[1:-1]
        zn, zs = z[:-2], z[2:]
        ze = np.empty_like(zc)
        zw = np.empty_like(zc)
        kb = k[r0:r1]
        for kk in np.unique(kb):
            sel = kb == kk
            ze[sel] = np.roll(zc[sel], -int(kk), axis=1)
            zw[sel] = np.roll(zc[sel], int(kk), axis=1)
        dzdx = (ze - zw) / (2.0 * kb * dx[r0:r1])[:, None].astype(np.float32)
        dzdy = (zn - zs) / np.float32(2.0 * dy)
        slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy))).astype(np.float32)
        h = zc - 0.25 * (zn + zs + ze + zw)
        elev = zc.copy()
        if mask is not None:
            m = mask[r0:r1]
            slope[m] = np.nan
            h[m] = np.nan
            elev[m] = np.nan
        sv = block_view(slope, factor)
        hv = block_view(h, factor)
        ev = block_view(elev, factor)
        need = max(1, int(min_valid_frac * factor * factor))
        med, p90 = masked_quantiles(sv, (0.5, 0.9), need)
        q25, q75 = masked_quantiles(hv, (0.25, 0.75), need)
        nvalid = np.isfinite(sv).sum(axis=-1)
        with np.errstate(invalid="ignore"):
            em = np.nansum(ev, axis=-1) / np.maximum(np.isfinite(ev).sum(axis=-1), 1)
        em = np.where(nvalid >= need, em, np.nan)
        res["elev_mean"][c0:c1] = em
        res["slope_med"][c0:c1] = med
        res["slope_p90"][c0:c1] = p90
        res["rough_iqr"][c0:c1] = q75 - q25
        res["valid_frac"][c0:c1] = nvalid / float(factor * factor)
    return res


def slope_raster_planar(dem: np.ndarray, px_m: float, step: int = 1) -> np.ndarray:
    """Slope (deg) on a projected (planar) DEM using central differences with a
    baseline of 2*step pixels. Used for the polar stereographic lunar grids,
    where scale distortion poleward of 80° is below 1%."""
    z = np.pad(dem.astype(np.float32), step, mode="edge")
    dzdx = (z[step:-step, 2 * step:] - z[step:-step, :-2 * step]) / (2 * step * px_m)
    dzdy = (z[:-2 * step, step:-step] - z[2 * step:, step:-step]) / (2 * step * px_m)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy))).astype(np.float32)


def detrended_height_planar(dem: np.ndarray, step: int = 1) -> np.ndarray:
    z = np.pad(dem.astype(np.float32), step, mode="edge")
    c = z[step:-step, step:-step]
    return c - 0.25 * (z[:-2 * step, step:-step] + z[2 * step:, step:-step]
                       + z[step:-step, 2 * step:] + z[step:-step, :-2 * step])


# ----------------------------------------------------------------------------
# Resampling of coarse products onto an analysis grid
# ----------------------------------------------------------------------------
def regrid_nearest(src: np.ndarray, src_lat: np.ndarray, src_lon: np.ndarray,
                   n_lat: int, n_lon: int) -> np.ndarray:
    """Nearest-neighbour sample of a regular lat/lon product (cell-centre
    coordinates, any orientation, lon in −180..180 or 0..360) at the centres of
    an n_lat × n_lon analysis grid. No interpolation is applied: a coarse value
    is repeated in every analysis cell it covers and keeps its native-resolution
    label in the metadata."""
    lat, lon = cell_centres(n_lat, n_lon)
    slon = np.where(src_lon > 180, src_lon - 360, src_lon)
    order_lon = np.argsort(slon)
    slon_s = slon[order_lon]
    order_lat = np.argsort(src_lat)
    slat_s = src_lat[order_lat]

    def nearest(sorted_vals, q, periodic=False):
        i = np.searchsorted(sorted_vals, q)
        i = np.clip(i, 1, len(sorted_vals) - 1)
        left = sorted_vals[i - 1]
        right = sorted_vals[i]
        pick = np.where(np.abs(q - left) <= np.abs(right - q), i - 1, i)
        if periodic:
            # wrap: compare with distance across the date line
            d_pick = np.abs(q - sorted_vals[pick])
            d_first = np.abs(q - (sorted_vals[0] + 360))
            d_last = np.abs(q - (sorted_vals[-1] - 360))
            pick = np.where(d_first < d_pick, 0, pick)
            pick = np.where(d_last < np.minimum(d_pick, d_first), len(sorted_vals) - 1, pick)
        return pick

    ii = order_lat[nearest(slat_s, lat)]
    jj = order_lon[nearest(slon_s, lon, periodic=True)]
    return src[np.ix_(ii, jj)].astype(np.float32)


def regrid_bilinear(src: np.ndarray, src_lat: np.ndarray, src_lon: np.ndarray,
                    n_lat: int, n_lon: int) -> np.ndarray:
    """Bilinear interpolation of a regular lat/lon field (ascending lat, lon
    spanning the globe) to analysis-cell centres. NaNs propagate. Used only
    for smooth reanalysis / model fields that are coarser than the grid."""
    lat, lon = cell_centres(n_lat, n_lon)
    slon = np.where(src_lon >= 180, src_lon - 360, src_lon)
    o = np.argsort(slon)
    slon = slon[o]
    s = src[:, o]
    if src_lat[0] > src_lat[-1]:
        src_lat = src_lat[::-1]
        s = s[::-1]
    # periodic padding in longitude
    slon_p = np.concatenate([[slon[-1] - 360], slon, [slon[0] + 360]])
    s_p = np.concatenate([s[:, -1:], s, s[:, :1]], axis=1)
    fi = np.interp(lat, src_lat, np.arange(len(src_lat)))
    fj = np.interp(lon, slon_p, np.arange(len(slon_p)))
    i0 = np.floor(fi).astype(int)
    i1 = np.minimum(i0 + 1, len(src_lat) - 1)
    j0 = np.floor(fj).astype(int)
    j1 = np.minimum(j0 + 1, len(slon_p) - 1)
    wi = (fi - i0)[:, None].astype(np.float32)
    wj = (fj - j0)[None, :].astype(np.float32)
    a = s_p[np.ix_(i0, j0)]
    b = s_p[np.ix_(i0, j1)]
    c = s_p[np.ix_(i1, j0)]
    d = s_p[np.ix_(i1, j1)]
    return ((a * (1 - wj) + b * wj) * (1 - wi) + (c * (1 - wj) + d * wj) * wi).astype(np.float32)


# ----------------------------------------------------------------------------
# Lunar polar stereographic helpers (LOLA / PGDA convention)
# ----------------------------------------------------------------------------
def polar_xy(lat_deg, lon_deg, south: bool, radius_m: float = R_MOON):
    """Spherical polar stereographic, true scale at the pole, lon 0 toward +y
    for the south pole and toward −y for the north pole (LOLA GDR convention)."""
    lat = np.radians(np.asarray(lat_deg, dtype=np.float64))
    lon = np.radians(np.asarray(lon_deg, dtype=np.float64))
    if south:
        r = 2 * radius_m * np.tan(np.pi / 4 + lat / 2)
        return r * np.sin(lon), r * np.cos(lon)
    r = 2 * radius_m * np.tan(np.pi / 4 - lat / 2)
    return r * np.sin(lon), -r * np.cos(lon)


def polar_latlon(x, y, south: bool, radius_m: float = R_MOON):
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    r = np.hypot(x, y)
    c = 2 * np.arctan(r / (2 * radius_m))
    if south:
        lat = -(np.pi / 2 - c)
        lon = np.arctan2(x, y)
    else:
        lat = np.pi / 2 - c
        lon = np.arctan2(x, -y)
    return np.degrees(lat), np.degrees(lon)
