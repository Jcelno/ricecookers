"""Names for places: IAU nomenclature on the Moon and Mars, Natural Earth on Earth."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from .geo import RADIUS_KM, bearing_name, gc_km, unit_xyz

NAMES = Path(__file__).resolve().parents[1] / "data" / "processed" / "names"

# Feature types that make useful "you are here" labels, most specific first.
PREFER = ("Crater", "Mons", "Vallis", "Mare", "Planitia", "Planum", "Chasma", "Patera", "Tholus", "Rupes",
          "Dorsum", "Rima", "Lacus", "Sinus", "Palus", "Oceanus", "Terra", "Fossa", "Mensa", "Labyrinthus", "Vastitas")


class Planetary:
    def __init__(self, body: str):
        self.body = body
        self.items = json.loads((NAMES / f"{body}.json").read_text())
        self.lat = np.array([x["lat"] for x in self.items])
        self.lon = np.array([x["lon"] for x in self.items])
        self.diam = np.array([x["diam_km"] for x in self.items])
        self.tree = cKDTree(unit_xyz(self.lat, self.lon))
        self.r = RADIUS_KM[body]
        self.lower = [x["name"].lower() for x in self.items]

    def context(self, lat: float, lon: float):
        """Smallest named feature containing the point, plus the nearest feature centre."""
        d = gc_km(lat, lon, self.lat, self.lon, self.r)
        inside = np.where((d < self.diam / 2) & (self.diam > 0))[0]
        within = None
        if len(inside):
            k = int(inside[np.argmin(self.diam[inside])])
            within = {**self.items[k], "distance_km": float(d[k])}
        cand = np.argsort(d)[:25]
        k = int(cand[0])
        for c in cand:                      # prefer a feature of meaningful size nearby
            if self.diam[c] >= 5 and d[c] < 3 * max(d[k], 20):
                k = int(c)
                break
        near = {**self.items[k], "distance_km": float(d[k]),
                "direction": bearing_name(self.items[k]["lat"], self.items[k]["lon"], lat, lon)}
        if within and within["name"] != near["name"] and near["distance_km"] > 2:
            label = f"{near['distance_km']:.0f} km {near['direction']} of {near['name']}, in {within['name']}"
        elif within:
            label = f"In {within['name']}"
        elif near["distance_km"] < max(2.0, near["diam_km"] / 2):
            label = f"At {near['name']}"
        else:
            label = f"{near['distance_km']:.0f} km {near['direction']} of {near['name']}"
        return {"label": label, "within": within, "nearest": near}

    def search(self, q: str, limit: int = 12):
        q = q.strip().lower()
        if not q:
            return []
        starts = [i for i, n in enumerate(self.lower) if n.startswith(q)]
        contains = [i for i, n in enumerate(self.lower) if q in n and not n.startswith(q)]
        order = sorted(starts, key=lambda i: -self.diam[i])[:limit] + sorted(contains, key=lambda i: -self.diam[i])[:limit]
        return [self.items[i] for i in order[:limit]]

    def find(self, name: str):
        try:
            return self.items[self.lower.index(name.lower())]
        except ValueError:
            return None


class Earth:
    REGION_CLASSES = {"Desert", "Plateau", "Range/mtn", "Basin", "Plain", "Island", "Island group", "Peninsula",
                      "Valley", "Tundra", "Lowland", "Geoarea", "Foothills", "Gorge", "Wetlands", "Pen/cape"}

    def __init__(self):
        def load(name):
            d = json.loads((NAMES / name).read_text())
            geoms, props = [], []
            for f in d["features"]:
                try:
                    g = shape(f["geometry"])
                except Exception:  # noqa: BLE001 - skip malformed geometry
                    continue
                if g.is_empty:
                    continue
                geoms.append(g)
                props.append(f["properties"])
            return geoms, props, STRtree(geoms)

        self.c_geom, self.c_prop, self.c_tree = load("earth_countries.geojson")
        pp = NAMES / "earth_places.json"
        self.places = json.loads(pp.read_text()) if pp.exists() else []
        self.a_geom, self.a_prop, self.a_tree = load("earth_admin1.geojson")
        rg, rp, _ = load("earth_regions.geojson")
        keep = [k for k, p in enumerate(rp) if p.get("featurecla") in self.REGION_CLASSES and p.get("name")]
        self.r_geom = [rg[k] for k in keep]
        self.r_prop = [rp[k] for k in keep]
        self.r_tree = STRtree(self.r_geom)
        self.r_area = np.array([g.area for g in self.r_geom])

    @staticmethod
    def _hit(tree, geoms, pt):
        idx = tree.query(pt, predicate="intersects")
        return [int(i) for i in idx]

    def place(self, lat: float, lon: float):
        pt = Point(lon, lat)
        country = admin1 = region = None
        h = self._hit(self.c_tree, self.c_geom, pt)
        if h:
            country = self.c_prop[h[0]].get("name")
        elif lat < -60:
            country = "Antarctica"
        h = self._hit(self.a_tree, self.a_geom, pt)
        if h:
            admin1 = self.a_prop[h[0]].get("name")
        h = self._hit(self.r_tree, self.r_geom, pt)
        if h:
            k = min(h, key=lambda i: self.r_area[i])          # most specific region
            region = self.r_prop[k].get("name").title() if self.r_prop[k].get("name").isupper() else self.r_prop[k].get("name")
        parts = [p for p in (region, admin1 if admin1 and admin1 != region else None, country) if p]
        # avoid "X, X"
        seen, uniq = set(), []
        for p in parts:
            if p.lower() not in seen:
                uniq.append(p)
                seen.add(p.lower())
        label = ", ".join(uniq[:3]) if uniq else "Open water"
        return {"label": label, "region": region, "admin1": admin1, "country": country}

    def search(self, q: str, limit: int = 10):
        q = q.strip().lower()
        out = []
        if not q:
            return out
        for geoms, props, kind in ((self.r_geom, self.r_prop, "region"), (self.c_geom, self.c_prop, "country"), (self.a_geom, self.a_prop, "state")):
            for g, p in zip(geoms, props):
                n = p.get("name") or ""
                if q in n.lower():
                    c = g.representative_point()
                    out.append({"name": n.title() if n.isupper() else n, "type": kind if kind != "region" else p.get("featurecla", "region"),
                                "lat": round(c.y, 3), "lon": round(c.x, 3), "diam_km": 0.0, "link": "",
                                "_rank": (0 if n.lower().startswith(q) else 1, len(n))})
        # Cities and towns (Natural Earth populated places): exact or prefix matches first, then larger places.
        for p in self.places:
            n, a = p["name"].lower(), p["ascii"].lower()
            if q in n or q in a:
                where = ", ".join(x for x in (p["admin1"], p["country"]) if x and x != p["name"])
                out.append({"name": p["name"] + (f", {where}" if where else ""), "type": "place", "lat": p["lat"], "lon": p["lon"],
                            "diam_km": 0.0, "link": "",
                            "_rank": (0 if q in (n, a) else 0.5 if n.startswith(q) or a.startswith(q) else 1.5, -p["pop"] / 1e9)})
        out.sort(key=lambda x: x["_rank"])
        for o in out:
            o.pop("_rank")
        return out[:limit]
