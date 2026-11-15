"""Download every plain data file RADIUM's pipeline reads (about 5.6 GB).

Resumable: a file that is already complete is skipped, a partial file is
continued with an HTTP Range request. Sources and licences are documented in
backend/registry.py.

Run:  python -m pipeline.fetch
The two sources that are not plain files have their own fetchers:
  python -m pipeline.fetch_earth   (NASA POWER Zarr stores, NASA GIBS maps)
  python -m pipeline.fetch_mcd     (Mars Climate Database web interface)
"""
from __future__ import annotations

import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor

import requests

from .common import RAW

UA = {"User-Agent": "Mozilla/5.0 (research-client)"}
PDS = "https://pds-geosciences.wustl.edu"
LOLA = f"{PDS}/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr"
DIVINER = f"{PDS}/lro/urn-nasa-pds-lro_diviner_derived1"
LP = f"{PDS}/lunar/lp-l-grs-5-elem-abundance-v1/lp_9001/data"
MOLA = f"{PDS}/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg032"
GRS = f"{PDS}/ody/ody-m-grs-5-elements-v1/odgm_xxxx/data/smoothed"
PGDA = "https://pgda.gsfc.nasa.gov/data/MoonIllumination"
NAMES = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
GCP_BANDS = ["90s80s", "80s70s", "70s60s", "60s50s", "50s40s", "40s30s", "30s20s", "20s10s", "10s00s",
             "00n10n", "10n20n", "20n30n", "30n40n", "40n50n", "50n60n", "60n70n", "70n80n", "80n90n"]

FILES: list[tuple[str, str]] = [
    # ---- Moon: LOLA elevation (global 16 px/deg, polar 240 m) and LOLA's own slope product (validation only)
    *[(f"{LOLA}/cylindrical/img/{n}", f"moon/{n}") for n in ("ldem_16.img", "ldem_16.lbl", "ldsm_16.img", "ldsm_16.lbl")],
    *[(f"{LOLA}/polar/img/{n}", f"moon/{n}") for n in ("ldem_75s_240m.img", "ldem_75s_240m.lbl", "ldem_75n_240m.img", "ldem_75n_240m.lbl")],
    # ---- Moon: polar illumination, Earth visibility, permanent shadow (Mazarico et al. 2011)
    *[(f"{PGDA}/{n}", f"moon/{n}") for p in ("S", "N")
      for n in (f"AVGVISIB_65{p}_240M_201608.TIF", f"AVGVISIB_65{p}_240M_201608_EARTH.TIF", f"LPSR_65{p}_240M_201608.TIF")],
    # ---- Moon: Diviner temperatures (global by local time; polar resource products)
    *[(f"{DIVINER}/data_derived_gcp/global_cumul_avg_cyl_{b}_002.tab", f"moon/diviner_gcp/global_cumul_avg_cyl_{b}_002.tab") for b in GCP_BANDS],
    (f"{DIVINER}/data_derived_prp/dlre_prp_south.tab", "moon/dlre_prp_south.tab"),
    (f"{DIVINER}/data_derived_prp/dlre_prp_north.tab", "moon/dlre_prp_north.tab"),
    # ---- Moon: Lunar Prospector hydrogen and elemental abundances
    (f"{PDS}/missions/lunarp/reduced/hydrogenhd.txt", "moon/lp_hydrogenhd.txt"),
    *[(f"{LP}/{n}", f"moon/{n}") for n in ("lpgrs_high1_elem_abundance_2deg.tab", "lpgrs_high1_elem_abundance_2deg.lbl", "lpgrs_elem_abundance.fmt")],
    # ---- Mars: MOLA topography and shot counts, Odyssey GRS element maps
    *[(f"{MOLA}/{n}", f"mars/{n}") for n in ("megt90n000fb.img", "megt90n000fb.lbl", "megc90n000fb.img", "megc90n000fb.lbl")],
    *[(f"{GRS}/{e}_sr_5x5.{x}", f"mars/grs_{e}_sr_5x5.{x}") for e in ("h2o", "fe", "si", "k", "th", "cl") for x in ("tab", "lbl")],
    # ---- Earth: ETOPO 2022 relief, GLiM lithology, Natural Earth names
    ("https://www.ngdc.noaa.gov/thredds/fileServer/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc",
     "earth/ETOPO_2022_v1_60s_N90W180_surface.nc"),
    ("https://doi.pangaea.de/10.1594/PANGAEA.788537?format=textfile", "earth/glim_pangaea_788537.zip"),
    *[(f"{NE}/{n}.geojson", f"earth/naturalearth/{n}.geojson")
      for n in ("ne_50m_admin_0_countries", "ne_50m_admin_1_states_provinces", "ne_10m_geography_regions_polys",
                "ne_10m_populated_places_simple")],
    # ---- IAU nomenclature
    (f"{NAMES}/MOON_nomenclature_center_pts.zip", "nomenclature/MOON_nomenclature_center_pts.zip"),
    (f"{NAMES}/MARS_nomenclature_center_pts.zip", "nomenclature/MARS_nomenclature_center_pts.zip"),
]


def fetch(item: tuple[str, str]) -> bool:
    url, rel = item
    dst = RAW / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, 7):
        try:
            have = dst.stat().st_size if dst.exists() else 0
            head = requests.head(url, headers=UA, timeout=60, allow_redirects=True)
            total = int(head.headers.get("content-length", 0))
            if have and total and have >= total:
                return True
            headers = {**UA, **({"Range": f"bytes={have}-"} if have and total else {})}
            with requests.get(url, headers=headers, timeout=120, stream=True) as r:
                if r.status_code == 416:
                    return True
                r.raise_for_status()
                mode = "ab" if r.status_code == 206 else "wb"
                with open(dst, mode) as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            size = dst.stat().st_size
            if total and size < total:        # the server closed early; go round again and resume
                raise IOError(f"incomplete: {size} of {total} bytes")
            print(f"[ok]   {rel}  {size / 1e6:.1f} MB", flush=True)
            return True
        except Exception as e:  # noqa: BLE001
            print(f"[retry {attempt}] {rel}: {str(e)[:120]}", flush=True)
            time.sleep(4 * attempt)
    print(f"[FAIL] {rel}", flush=True)
    return False


def main() -> int:
    with ThreadPoolExecutor(max_workers=5) as pool:
        ok = all(pool.map(fetch, FILES))
    for body in ("moon", "mars"):
        z = RAW / "nomenclature" / f"{body.upper()}_nomenclature_center_pts.zip"
        if z.exists():
            zipfile.ZipFile(z).extractall(RAW / "nomenclature" / body)
    print("all files present" if ok else "some downloads failed; run again to resume")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
