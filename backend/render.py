"""Turn data arrays into map overlays. Every pixel drawn comes from a grid
value; cells without data are transparent, never interpolated or filled."""
from __future__ import annotations

import io
import math

import numpy as np
from PIL import Image

from .geo import polar_xy
from .suitability import GRADE_EDGES

CMAPS = {
    "heat": ["#0b0724", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
    "ice": ["#081d3a", "#0f4c81", "#2a8fbd", "#7fd0e0", "#e6f7fb"],
    "lume": ["#14180f", "#3d4a1c", "#7c8f2a", "#c9d65a", "#f6f3c2"],
    "topo": ["#12283a", "#2f5d62", "#6a8f6b", "#b9b487", "#e8dcc0", "#ffffff"],
    "slope": ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    "ember": ["#1a0f0a", "#5a2410", "#a8431a", "#e08a3c", "#f7dc9b"],
    "dust": ["#1c1a17", "#5b4630", "#a67c4a", "#d9b77e", "#f5e9cf"],
    "air": ["#0d0b2b", "#3a3a8c", "#6f7fd0", "#b3c2ee", "#f1f4fd"],
    "grey": ["#0a0a0a", "#f5f5f5"],
    "veg": ["#efe6c8", "#b7c46a", "#5e9e3e", "#1f6b2f", "#0b3d1e"],
    "sand": ["#1b1a18", "#6b5a43", "#bfa36f", "#f1e2b8"],
}
CMAPS["ice_r"] = CMAPS["ice"][::-1]

GRADE_COLORS = {"A": "#56c8f5", "B": "#86d6b9", "C": "#ecdf9a", "D": "#f0a55a", "F": "#de5d57"}
EXCLUDED_RGBA = (18, 20, 24, 150)


def _rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[k:k + 2], 16) for k in (0, 2, 4))


def lut(name: str, n: int = 256) -> np.ndarray:
    stops = np.array([_rgb(h) for h in CMAPS[name]], dtype=np.float32)
    x = np.linspace(0, len(stops) - 1, n)
    i = np.clip(np.floor(x).astype(int), 0, len(stops) - 2)
    f = (x - i)[:, None]
    return np.rint(stops[i] * (1 - f) + stops[i + 1] * f).astype(np.uint8)


_LUTS = {k: lut(k) for k in CMAPS}


def legend_stops(name: str, n: int = 9):
    l = _LUTS[name]
    idx = np.linspace(0, 255, n).astype(int)
    return ["#%02x%02x%02x" % tuple(int(c) for c in l[i]) for i in idx]


def colorize(a: np.ndarray, cmap: str, vmin: float, vmax: float, log: bool = False, alpha: int = 235) -> np.ndarray:
    v = a.astype(np.float64)
    ok = np.isfinite(v)
    if log:
        with np.errstate(invalid="ignore", divide="ignore"):
            t = (np.log(np.maximum(v, 1e-12)) - math.log(vmin)) / (math.log(vmax) - math.log(vmin))
    else:
        t = (v - vmin) / (vmax - vmin)
    idx = np.clip(np.rint(np.nan_to_num(t, nan=0.0) * 255), 0, 255).astype(np.uint8)
    out = np.zeros(a.shape + (4,), np.uint8)
    out[..., :3] = _LUTS[cmap][idx]
    out[..., 3] = np.where(ok, alpha, 0)
    return out


# Poorer grades are drawn more transparently so the eye goes to the good cells;
# the colour of every grade is unchanged.
GRADE_ALPHA = {"A": 240, "B": 228, "C": 200, "D": 150, "F": 105}


def grade_rgba(score: np.ndarray, excluded: np.ndarray | None = None) -> np.ndarray:
    out = np.zeros(score.shape + (4,), np.uint8)
    prev = np.inf
    for g, edge in GRADE_EDGES:
        m = np.isfinite(score) & (score >= edge) & (score < prev)
        out[m, :3] = _rgb(GRADE_COLORS[g])
        out[m, 3] = GRADE_ALPHA[g]
        prev = edge
    if excluded is not None:
        m = excluded & np.isfinite(score)
        out[m] = EXCLUDED_RGBA
    return out


def bleed(rgba: np.ndarray) -> np.ndarray:
    """Copy the nearest visible colour into fully transparent pixels (alpha stays 0).

    GPUs blend neighbouring texels when a map overlay is drawn smaller than its native size. If transparent
    pixels are black, that blend darkens every data edge, which is what drew dark jagged borders around the
    lunar polar grids. Values and coverage are unchanged: only the colour of invisible pixels changes."""
    if rgba.ndim != 3 or rgba.shape[2] != 4:
        return rgba
    clear = rgba[..., 3] == 0
    if not clear.any() or clear.all():
        return rgba
    from scipy import ndimage
    idx = ndimage.distance_transform_edt(clear, return_distances=False, return_indices=True)
    out = rgba.copy()
    out[..., :3] = rgba[idx[0], idx[1], :3]
    out[..., 3] = rgba[..., 3]
    return out


def png(rgba: np.ndarray) -> bytes:
    rgba = bleed(rgba)
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG", optimize=False, compress_level=3)
    return buf.getvalue()


MERCATOR_MAX_LAT = 85.0511287798


def to_mercator(rgba: np.ndarray, out_h: int | None = None) -> np.ndarray:
    """Resample an equirectangular image (rows north→south, −90…90) onto Web
    Mercator rows between ±85.05°, nearest neighbour, so it can be pinned to a
    Mercator map by its four corners."""
    n_lat = rgba.shape[0]
    h = out_h or rgba.shape[1]
    y = math.pi * (1.0 - 2.0 * (np.arange(h) + 0.5) / h)
    lat = np.degrees(np.arctan(np.sinh(y)))
    rows = np.clip(np.floor((90.0 - lat) / (180.0 / n_lat)).astype(int), 0, n_lat - 1)
    return rgba[rows]


CAP_EDGE_LAT = 75.5
CAP_DLAT, CAP_DLON = 0.05, 0.1


def polar_cap(values: np.ndarray, half_m: float, cell_m: float, south: bool, outside: np.ndarray | None = None) -> np.ndarray:
    """Sample a polar-stereographic grid (n × n, any trailing channel shape) onto
    a latitude/longitude cap image (pole → 75.5°), nearest neighbour.

    Pixels outside the polar square are transparent, or, when `outside` is given (a global equirectangular
    image with rows north→south), take the global value there. The cap then meets the global image along the
    75.5° parallel, a cell edge of the 0.5° grid, with no gap and no double-drawn band."""
    n_rows = int(round((90.0 - CAP_EDGE_LAT) / CAP_DLAT))
    n_cols = int(round(360.0 / CAP_DLON))
    if south:
        lat = -CAP_EDGE_LAT - CAP_DLAT * (np.arange(n_rows) + 0.5)      # rows north → south
    else:
        lat = 90.0 - CAP_DLAT * (np.arange(n_rows) + 0.5)
    lon = -180.0 + CAP_DLON * (np.arange(n_cols) + 0.5)
    x, y = polar_xy(lat[:, None], lon[None, :], south)
    inside = (np.abs(x) < half_m) & (np.abs(y) < half_m)
    j = np.clip(np.floor((x + half_m) / cell_m).astype(int), 0, values.shape[1] - 1)
    i = np.clip(np.floor((half_m - y) / cell_m).astype(int), 0, values.shape[0] - 1)
    out = values[i, j]
    if outside is None:
        out[~inside] = 0
    else:
        n_lat, n_lon = outside.shape[:2]
        gi = np.clip(np.floor((90.0 - lat[:, None]) / (180.0 / n_lat)).astype(int), 0, n_lat - 1)
        gj = np.clip(np.floor((lon[None, :] + 180.0) / (360.0 / n_lon)).astype(int), 0, n_lon - 1)
        gi, gj = np.broadcast_arrays(gi, gj)
        out[~inside] = outside[gi[~inside], gj[~inside]]
    return out


def blank_caps(img: np.ndarray) -> np.ndarray:
    """Clear the rows of a global equirectangular image that the polar cap images draw (|lat| > 75.5°)."""
    n = img.shape[0]
    lat = 90.0 - (180.0 / n) * (np.arange(n) + 0.5)
    out = img.copy()
    out[np.abs(lat) > CAP_EDGE_LAT] = 0
    return out


def cap_rectangle(south: bool):
    """[west, south, east, north] of the cap image in degrees."""
    return [-180.0, -90.0, 180.0, -CAP_EDGE_LAT] if south else [-180.0, CAP_EDGE_LAT, 180.0, 90.0]
