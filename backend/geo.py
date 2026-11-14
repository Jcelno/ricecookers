"""Small geometry helpers shared by the backend (pure NumPy)."""
from __future__ import annotations

import numpy as np

R_MOON = 1_737_400.0
R_MARS = 3_396_000.0
R_EARTH = 6_371_008.8
RADIUS_KM = {"moon": R_MOON / 1000, "mars": R_MARS / 1000, "earth": R_EARTH / 1000}


def polar_xy(lat_deg, lon_deg, south: bool, radius_m: float = R_MOON):
    """Spherical polar stereographic (LOLA convention): longitude 0 points to
    +y at the south pole and to −y at the north pole."""
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
    c = 2 * np.arctan(np.hypot(x, y) / (2 * radius_m))
    if south:
        return np.degrees(-(np.pi / 2 - c)), np.degrees(np.arctan2(x, y))
    return np.degrees(np.pi / 2 - c), np.degrees(np.arctan2(x, -y))


def gc_km(lat1, lon1, lat2, lon2, radius_km: float):
    """Great-circle distance (haversine), vectorised."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dlmb = np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlmb / 2) ** 2
    return 2 * radius_km * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def bearing_name(lat1, lon1, lat2, lon2) -> str:
    """Compass direction from point 1 to point 2 (8-point)."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dl = np.radians(lon2 - lon1)
    y = np.sin(dl) * np.cos(p2)
    x = np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl)
    b = (np.degrees(np.arctan2(y, x)) + 360) % 360
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][int((b + 22.5) // 45) % 8]


def unit_xyz(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def pick_distinct(score, lat, lon, radius_km: float, min_sep_km: float, n: int):
    """Greedy non-maximum suppression on a sphere.

    Repeatedly take the best remaining candidate and discard every candidate
    closer than `min_sep_km` to it, so the returned sites are distinct places
    rather than neighbouring cells of one high-scoring patch.
    score/lat/lon are 1-D arrays; NaN scores are ignored. Returns indices.
    """
    s = np.where(np.isfinite(score), score, -np.inf).astype(np.float64).copy()
    out = []
    for _ in range(n):
        k = int(np.argmax(s))
        if not np.isfinite(s[k]):
            break
        out.append(k)
        d = gc_km(lat[k], lon[k], lat, lon, radius_km)
        s[d < min_sep_km] = -np.inf
    return out


def fmt_latlon(lat: float, lon: float) -> str:
    return f"{abs(lat):.2f}°{'N' if lat >= 0 else 'S'}, {abs(lon):.2f}°{'E' if lon >= 0 else 'W'}"
