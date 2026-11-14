"""Build place-name indexes.

* Moon / Mars: IAU Gazetteer of Planetary Nomenclature centre points (USGS
  Astrogeology) → compact JSON used for search, "nearest named feature" and
  to position reference pins from authoritative coordinates.
* Earth: Natural Earth (public domain) country, state/province and physical
  region polygons, simplified to the attributes RADIUM needs.

Run:  python -m pipeline.build_names
"""
from __future__ import annotations

import glob
import json

import shapefile

from .common import OUT, RAW, save_json

KEEP_TYPES_MIN_DIAM = 0.0


def iau(body: str):
    shp = glob.glob(str(RAW / "nomenclature" / body / "*.shp"))[0]
    sf = shapefile.Reader(shp, encoding="utf-8")
    fields = [f[0] for f in sf.fields[1:]]
    out = []
    for rec in sf.iterRecords():
        r = dict(zip(fields, rec))
        if not str(r.get("approval", "")).startswith("Adopted"):
            continue
        lon = float(r["center_lon"])
        lon = lon - 360.0 if lon > 180.0 else lon
        out.append({
            "name": r["name"], "type": str(r["type"]).split(",")[0],
            "lat": round(float(r["center_lat"]), 4), "lon": round(lon, 4),
            "diam_km": round(float(r["diameter"] or 0.0), 2),
            "link": str(r.get("link", "")).replace("http://", "https://"),
        })
    out.sort(key=lambda x: -x["diam_km"])
    save_json(OUT / "names" / f"{body}.json", out)
    print(f"{body}: {len(out)} IAU-approved features")
    return out


def natural_earth():
    src = RAW / "earth" / "naturalearth"
    dst = OUT / "names"
    dst.mkdir(parents=True, exist_ok=True)

    def slim(name, keep, out_name):
        d = json.load(open(src / f"{name}.geojson"))
        feats = []
        for f in d["features"]:
            p = {k.lower(): v for k, v in f["properties"].items()}
            props = {k: p.get(k) for k in keep}
            if f.get("geometry"):
                feats.append({"type": "Feature", "properties": props, "geometry": f["geometry"]})
        (dst / out_name).write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
        print(f"{out_name}: {len(feats)} features")

    slim("ne_50m_admin_0_countries", ["name", "name_long", "continent", "subregion", "iso_a2"], "earth_countries.geojson")
    slim("ne_50m_admin_1_states_provinces", ["name", "admin", "iso_a2"], "earth_admin1.geojson")
    slim("ne_10m_geography_regions_polys", ["name", "featurecla", "region", "scalerank"], "earth_regions.geojson")


def main():
    iau("moon")
    iau("mars")
    natural_earth()


if __name__ == "__main__":
    main()
