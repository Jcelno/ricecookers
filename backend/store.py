"""Loads the processed grids and answers "what is known about this place?"."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy import ndimage

from . import catalog
from .geo import RADIUS_KM, polar_latlon, polar_xy

DATA = Path(__file__).resolve().parents[1] / "data" / "processed"


class Grid:
    def __init__(self, gid: str):
        d = DATA / gid
        self.id = gid
        self.meta = json.loads((d / "grid.json").read_text())
        self.body = self.meta["body"]
        self.kind = self.meta["type"]
        self.a = {p.stem: np.load(p) for p in sorted(d.glob("*.npy"))}
        self.vars = catalog.VARS[gid]
        self.radius_km = RADIUS_KM[self.body]
        if self.kind == "latlon":
            self.n_lat, self.n_lon = self.meta["n_lat"], self.meta["n_lon"]
            self.dlat, self.dlon = 180.0 / self.n_lat, 360.0 / self.n_lon
            lat = 90.0 - self.dlat * (np.arange(self.n_lat) + 0.5)
            lon = -180.0 + self.dlon * (np.arange(self.n_lon) + 0.5)
            self.lat2d, self.lon2d = np.meshgrid(lat, lon, indexing="ij")
            self.shape = (self.n_lat, self.n_lon)
        else:
            self.n = self.meta["n"]
            self.cell_m = self.meta["cell_m"]
            self.half_m = self.meta["half_m"]
            self.south = self.meta["south"]
            self.lat2d = self.a.pop("lat").astype(np.float64)
            self.lon2d = self.a.pop("lon").astype(np.float64)
            self.shape = (self.n, self.n)
        self.valid = np.ones(self.shape, bool)       # cells this grid is responsible for

    # ------------------------------------------------------------------ geometry
    def index(self, lat: float, lon: float):
        if self.kind == "latlon":
            i = min(self.n_lat - 1, max(0, int((90.0 - lat) / self.dlat)))
            j = int(((lon + 180.0) % 360.0) / self.dlon) % self.n_lon
            return i, j
        x, y = polar_xy(lat, lon, self.south)
        if not (abs(x) < self.half_m and abs(y) < self.half_m):
            return None
        return int((self.half_m - y) / self.cell_m), int((x + self.half_m) / self.cell_m)

    def centre(self, i: int, j: int):
        return float(self.lat2d[i, j]), float(self.lon2d[i, j])

    def outline(self, i: int, j: int):
        """Cell boundary as a ring of [lon, lat] pairs."""
        if self.kind == "latlon":
            n = 90.0 - i * self.dlat
            s = n - self.dlat
            w = -180.0 + j * self.dlon
            e = w + self.dlon
            return [[w, n], [e, n], [e, s], [w, s], [w, n]]
        x0 = -self.half_m + j * self.cell_m
        y0 = self.half_m - i * self.cell_m
        xs = [x0, x0 + self.cell_m, x0 + self.cell_m, x0, x0]
        ys = [y0, y0, y0 - self.cell_m, y0 - self.cell_m, y0]
        la, lo = polar_latlon(np.array(xs), np.array(ys), self.south)
        return [[float(b), float(a)] for a, b in zip(la, lo)]

    def size_km(self, i: int):
        if self.kind == "latlon":
            ns = self.radius_km * math.radians(self.dlat)
            ew = self.radius_km * math.radians(self.dlon) * math.cos(math.radians(float(self.lat2d[i, 0])))
            return [round(ns, 1), round(ew, 1)]
        return [self.cell_m / 1000.0, self.cell_m / 1000.0]

    def get(self, name: str):
        return self.a.get(name)

    def value(self, name: str, i: int, j: int):
        a = self.a.get(name)
        if a is None:
            return None
        v = float(a[i, j])
        return v if math.isfinite(v) else None


class Store:
    def __init__(self):
        self.g = {gid: Grid(gid) for gid in ("moon", "moon_sp", "moon_np", "mars", "earth")}
        self._prepare()

    def _prepare(self):
        moon = self.g["moon"]
        in_polar = np.zeros(moon.shape, bool)
        for pid in ("moon_sp", "moon_np"):
            p = self.g[pid]
            x, y = polar_xy(moon.lat2d, moon.lon2d, p.south)
            in_polar |= (np.abs(x) < p.half_m) & (np.abs(y) < p.half_m)
            # ice-stable ground within about 10 km of each polar cell (9 × 9 cells = 21.6 km)
            p.a["ice_nearby"] = ndimage.uniform_filter(np.nan_to_num(p.a["ice_1m_frac"], nan=0.0), size=9, mode="nearest").astype(np.float32)
        moon.valid = ~in_polar                       # polar squares are served by the polar grids

        earth = self.g["earth"]
        # Data-quality rule: MODIS land cover labels some bright salt flats
        # (Aral seabed, Bonneville, Lop Nur …) as "permanent snow and ice".
        # Permanent ice cannot exist where the mean ground temperature is above
        # 10 °C, so there the class is reassigned to barren ground.
        ice = earth.a["ice_frac"].copy()
        barren = earth.a["barren_frac"].copy()
        suspect = (ice > 0) & (earth.a["tmean"] > 283.15)
        barren[suspect] = np.clip(barren[suspect] + ice[suspect], 0, 1)
        ice[suspect] = 0.0
        earth.a["ice_frac"], earth.a["barren_frac"] = ice, barren
        earth.a["ice_reclassified"] = suspect.astype(np.float32)
        # Reanalysis soil wetness is meaningless over permanent ice.
        sw = earth.a["soil_wet"].copy()
        sw[earth.a["ice_frac"] > 0.5] = np.nan
        earth.a["soil_wet"] = sw
        earth.valid = (earth.a["land_frac"] >= 0.5) & np.isfinite(earth.a["slope_med"])

    def locate(self, body: str, lat: float, lon: float):
        for gid in catalog.BODIES[body]["grids"]:
            g = self.g[gid]
            ij = g.index(lat, lon)
            if ij is not None:
                return g, ij[0], ij[1]
        raise ValueError("location outside all grids")

    # ---------------------------------------------------------------- description
    def describe(self, g: Grid, i: int, j: int):
        lat, lon = g.centre(i, j)
        groups = {cid: [] for cid, _ in catalog.CATEGORIES}
        missing = []
        for vid, m in g.vars.items():
            raw = g.value(vid, i, j)
            item = {"id": vid, "label": m["label"], "unit": m["unit"], "dec": m["dec"], "fmt": m.get("fmt"),
                    "evidence": m["evidence"], "source": m["source"], "res": m["res"], "desc": m["desc"],
                    "caveat": m.get("caveat"), "value": raw, "sigma": None, "text": None, "has_layer": "layer" in m}
            if m.get("src_var") and raw is not None:
                code = g.value(m["src_var"], i, j)
                alt = m.get("src_map", {}).get(int(code)) if code is not None else None
                if alt:
                    item.update(evidence=alt["evidence"], source=alt["source"], res=alt["res"], caveat=alt["note"])
            if m.get("sigma") and raw is not None:
                item["sigma"] = g.value(m["sigma"], i, j)
            if m.get("fmt") == "class" and raw is not None:
                k = int(round(raw))
                if m.get("classes") == "lith":
                    code, name = catalog.LITH_CLASSES.get(k, ("?", "Unknown"))
                    item["text"] = name
                    item["class_code"] = code
                else:
                    item["text"] = catalog.IGBP_CLASSES.get(k, "Unknown")
            if raw is None:
                missing.append(m["label"])
            groups[m["cat"]].append(item)
        return {
            "grid": g.id, "body": g.body,
            "cell": {"i": i, "j": j, "lat": lat, "lon": lon, "size_km": g.size_km(i), "outline": g.outline(i, j),
                     "kind": g.kind},
            "groups": [{"id": cid, "label": label, "items": groups[cid]} for cid, label in catalog.CATEGORIES if groups[cid]],
            "missing": missing,
        }
