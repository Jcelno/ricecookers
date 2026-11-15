"""Time-resolved series for the Sunlight & Temperature timeline (data/processed/timeline/).

Moon:  Diviner bolometric temperature by local hour (24 bins), the mean of the observed quarter-hour bins in each
       hour. No interpolation: an hour with no observation stays NaN and is shown as missing.
Mars:  Mars Climate Database v6.2 seasonal means (12 seasons of 30° solar longitude) of surface temperature and
       incident solar flux, bilinear to 0.5° exactly as in build_mars.
Earth: NASA POWER (MERRA-2) monthly climatology of skin temperature (12 months), bilinear to 0.25° as in build_earth.

Stored as float16 (about 0.1 K resolution at these magnitudes) in compressed .npz files.

    .venv/bin/python -m pipeline.build_timeline
"""
from __future__ import annotations

import numpy as np

from .build_mars import parse_mcd
from .common import OUT, RAW, regrid_bilinear

DST = OUT / "timeline"


def _save(name: str, a: np.ndarray):
    DST.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(DST / f"{name}.npz", a=a.astype(np.float16))
    finite = np.isfinite(a)
    print(f"  saved timeline/{name} shape={a.shape} observed={finite.mean():.1%} range=[{np.nanmin(a):.1f}, {np.nanmax(a):.1f}]")


def moon_hourly():
    print("Moon: Diviner temperature by local hour")
    n_lat, n_lon = 360, 720
    T = np.full((n_lat, n_lon, 96), np.nan, np.float32)
    files = sorted((RAW / "moon" / "diviner_gcp").glob("global_cumul_avg_cyl_*_002.tab"))
    assert len(files) == 18, f"expected 18 GCP bands, found {len(files)}"
    for f in files:
        raw = np.fromfile(f, dtype=np.uint8)[113:]
        rec = raw.reshape(-1, 113)

        def col(a, b):
            return np.ascontiguousarray(rec[:, a:b]).view(f"S{b-a}").ravel().astype(np.float32)

        lon, lat, lt, tb = col(0, 7), col(8, 15), col(16, 23), col(101, 111)
        i = np.floor((90.0 - lat) / 0.5).astype(np.int32)
        j = np.floor((lon + 180.0) / 0.5).astype(np.int32)
        k = np.floor(lt / 0.25).astype(np.int32)
        good = (tb > 0) & (tb < 500) & (i >= 0) & (i < n_lat) & (j >= 0) & (j < n_lon) & (k >= 0) & (k < 96)
        T[i[good], j[good], k[good]] = tb[good]
    with np.errstate(invalid="ignore"), np.testing.suppress_warnings() as sup:
        sup.filter(RuntimeWarning)
        hourly = np.nanmean(T.reshape(n_lat, n_lon, 24, 4), axis=3)        # NaN where none of the 4 bins was observed
    _save("moon_t_hour", np.moveaxis(hourly, 2, 0))


def mars_seasonal():
    print("Mars: MCD seasonal means")
    d = RAW / "mars" / "mcd"

    def find(block, key):
        for k, v in block.items():
            if key.lower() in k.lower():
                return v
        raise KeyError(key)

    months = [parse_mcd(d / f"mean_ls{ls:03d}.txt") for ls in range(15, 360, 30)]
    grid = lambda f: regrid_bilinear(f[2], f[0], f[1], 360, 720)  # noqa: E731
    _save("mars_t_season", np.stack([grid(find(m, "Surface temperature")) for m in months]))
    _save("mars_flux_season", np.stack([grid(find(m, "solar flux")) for m in months]))


def earth_monthly():
    print("Earth: POWER monthly skin temperature")
    src = np.load(RAW / "earth" / "power" / "merra2_climatology.npz")
    ts = src["TS"][:12]                                                   # 12 months; the 13th is the annual mean
    k = ts + 273.15 if np.nanmax(ts) < 150 else ts                        # POWER reports °C
    _save("earth_t_month", np.stack([regrid_bilinear(k[m], src["lat"], src["lon"], 720, 1440) for m in range(12)]))


def main():
    moon_hourly()
    mars_seasonal()
    earth_monthly()


if __name__ == "__main__":
    main()
