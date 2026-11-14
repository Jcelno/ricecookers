"""Build the global Mars analysis grid (0.5° × 0.5°, 720 × 360 cells ≈ 29.6 km).

Inputs:
  MOLA MEGDR 32 px/deg       topography + shot counts                  (observed)
  Mars Odyssey GRS           H2O, Fe, Si, K, Cl, Th — 5° smoothed maps  (inferred from gamma-ray spectra)
  Mars Climate Database 6.2  surface temperature, pressure, solar flux,
                             dust optical depth, thermal inertia, albedo (modelled climatology)

Run:  python -m pipeline.build_mars
"""
from __future__ import annotations

import numpy as np

from .common import (OUT, RAW, R_MARS, block_view, cell_centres, regrid_bilinear, regrid_nearest,
                     roll_0_360_to_180, save_grid, save_json, terrain_cells)

GRID = "mars"
N_LAT, N_LON = 360, 720
M = RAW / "mars"

# Duration of the twelve 30°-Ls "months" in sols (Mars year = 668.6 sols).
MONTH_SOLS = np.array([61.2, 65.4, 66.7, 64.5, 59.7, 54.4, 49.7, 46.9, 46.1, 47.4, 50.9, 55.7])
R_GAS = 191.8     # J kg⁻¹ K⁻¹, CO2-dominated Mars air
G_MARS = 3.72     # m s⁻²


def build_terrain():
    print("MOLA MEGDR 32 ppd → terrain")
    dn = np.fromfile(M / "megt90n000fb.img", dtype=">i2").reshape(5760, 11520)
    dem = roll_0_360_to_180(dn.astype(np.float32))
    t = terrain_cells(dem, R_MARS, factor=16)
    for k in ("elev_mean", "slope_med", "slope_p90", "rough_iqr"):
        save_grid(GRID, k, t[k])
    cnt = np.fromfile(M / "megc90n000fb.img", dtype=">i2").reshape(5760, 11520)
    cov = block_view(roll_0_360_to_180((cnt > 0).astype(np.float32)), 16).mean(axis=-1)
    save_grid(GRID, "mola_cov", cov)
    lat, lon = cell_centres(N_LAT, N_LON)

    def at(la, lo):
        return float(t["elev_mean"][int((90 - la) / 0.5), int((lo + 180) / 0.5)])
    return {
        "dem_min_m": float(dem.min()), "dem_max_m": float(dem.max()),
        "olympus_mons_summit_cell_m": at(18.65, -133.8),
        "hellas_floor_cell_m": at(-42.4, 70.5),
        "median_mola_shot_coverage": float(np.median(cov)),
    }, t["elev_mean"]


def build_grs():
    print("Mars Odyssey GRS element maps (5°, block-replicated)")
    out = {}
    for el, name in (("h2o", "weh_wt"), ("fe", "fe_wt"), ("si", "si_wt"), ("k", "k_wt"), ("cl", "cl_wt"), ("th", "th_ppm")):
        d = np.loadtxt(M / f"grs_{el}_sr_5x5.tab")
        lats = np.unique(d[:, 0])
        lons = np.unique(d[:, 1])
        conc = np.full((len(lats), len(lons)), np.nan, np.float32)
        sig = np.full_like(conc, np.nan)
        i = np.searchsorted(lats, d[:, 0])
        j = np.searchsorted(lons, d[:, 1])
        c = d[:, 2].astype(np.float32)
        s = d[:, 3].astype(np.float32)
        c[c > 9000] = np.nan
        s[s > 9000] = np.nan
        conc[i, j] = c
        sig[i, j] = s
        save_grid(GRID, name, regrid_nearest(conc, lats, lons, N_LAT, N_LON))
        save_grid(GRID, name + "_sigma", regrid_nearest(sig, lats, lons, N_LAT, N_LON))
        out[name + "_range"] = [float(np.nanmin(conc)), float(np.nanmax(conc))]
        out[name + "_lat_coverage"] = [float(lats[np.isfinite(conc).any(axis=1)].min()),
                                       float(lats[np.isfinite(conc).any(axis=1)].max())]
    return out


def parse_mcd(path):
    """Parse one MCD web-interface ASCII file → {variable title: (lat, lon, field[lat, lon])}."""
    out, name, lats, rows, lons = {}, None, None, [], []

    def flush():
        if name is not None and rows:
            a = np.array(rows, dtype=np.float32).T          # [lat, lon]
            lo = np.array(lons)
            if abs((lo[-1] - lo[0]) - 360.0) < 1e-6:          # −180 and +180 are the same meridian
                a, lo = a[:, :-1], lo[:-1]
            out[name] = (lats, lo, a)

    for line in path.read_text().splitlines():
        if line.startswith("###") and "Columns 2+ are" in line:
            flush()
            name, rows, lons = line.split("Columns 2+ are", 1)[1].strip(), [], []
        elif line.startswith("---- ||"):
            lats = np.array(line.split("||", 1)[1].split(), dtype=np.float64)
        elif "||" in line and not line.startswith("#"):
            a, b = line.split("||", 1)
            lons.append(float(a))
            rows.append([float(x) for x in b.split()])
    flush()
    return out


def build_mcd(elev):
    d = M / "mcd"
    need = [f"mean_ls{ls:03d}" for ls in range(15, 360, 30)]
    ext = [f"lt{lt}_ls{ls:03d}" for ls in range(15, 360, 60) for lt in ("14", "05")]
    missing = [n for n in need + ext + ["static"] if not (d / f"{n}.txt").exists()]
    if missing:
        print(f"MCD: {len(missing)} query results not downloaded yet ({missing[:3]}…) — climate variables skipped")
        return {"status": "incomplete", "missing": missing}
    print("Mars Climate Database → climatology (bilinear to 0.5°)")
    w = MONTH_SOLS / MONTH_SOLS.sum()

    def grid(f):
        lats, lons, a = f
        return regrid_bilinear(a, lats, lons, N_LAT, N_LON)

    def find(block, key):
        for k, v in block.items():
            if key.lower() in k.lower():
                return v
        raise KeyError(f"{key} not in {list(block)}")

    months = [parse_mcd(d / f"{n}.txt") for n in need]
    ts = np.stack([grid(find(m, "Surface temperature")) for m in months])
    ps = np.stack([grid(find(m, "Surface pressure")) for m in months])
    fl = np.stack([grid(find(m, "solar flux")) for m in months])
    tau = np.stack([grid(find(m, "dust column")) for m in months])
    ts_mean = np.tensordot(w, ts, axes=1)
    ps_gcm = np.tensordot(w, ps, axes=1)

    st = parse_mcd(d / "static.txt")
    oro = grid(find(st, "orography"))
    ti = grid(find(st, "thermal inertia"))
    alb = grid(find(st, "albedo"))

    # Topographic correction of surface pressure: the model grid (5.6° × 3.8°)
    # carries a smoothed topography. Hydrostatic adjustment to each cell's MOLA
    # elevation with the local scale height H = R·T/g.
    H = R_GAS * ts_mean / G_MARS
    corr = np.exp(-(elev - oro) / H)
    ps_cell = ps_gcm * corr
    ps_months = ps * corr[None]
    ps_season = (ps_months.max(axis=0) - ps_months.min(axis=0)) / ps_cell

    tmax = np.stack([grid(find(parse_mcd(d / f"lt14_ls{ls:03d}.txt"), "Surface temperature")) for ls in range(15, 360, 60)]).max(axis=0)
    tmin = np.stack([grid(find(parse_mcd(d / f"lt05_ls{ls:03d}.txt"), "Surface temperature")) for ls in range(15, 360, 60)]).min(axis=0)

    save_grid(GRID, "tmean", ts_mean)
    save_grid(GRID, "tmax", tmax)
    save_grid(GRID, "tmin", tmin)
    save_grid(GRID, "ps_mean", ps_cell)
    save_grid(GRID, "ps_seasonal_frac", ps_season)
    save_grid(GRID, "solar_flux", np.tensordot(w, fl, axes=1))
    save_grid(GRID, "dust_tau", np.tensordot(w, tau, axes=1))
    save_grid(GRID, "dust_tau_max", tau.max(axis=0))
    save_grid(GRID, "thermal_inertia", ti)
    save_grid(GRID, "albedo", alb)
    save_grid(GRID, "mcd_oro", oro)

    # Independent check: isothermal barometric estimate from MOLA elevation alone.
    ps_hydro = 610.0 * np.exp(-elev / 10_800.0)
    save_grid(GRID, "ps_hydro", ps_hydro)
    lat, _ = cell_centres(N_LAT, N_LON)
    band = (np.abs(lat)[:, None] < 60) & np.isfinite(ps_cell)
    band = np.broadcast_to(band, ps_cell.shape) & np.isfinite(ps_cell)
    return {
        "status": "complete",
        "pressure_vs_barometric_r": float(np.corrcoef(np.log(ps_cell[band]), np.log(ps_hydro[band]))[0, 1]),
        "pressure_vs_barometric_median_ratio": float(np.median(ps_cell[band] / ps_hydro[band])),
        "global_mean_tsurf_K": float(np.average(ts_mean, weights=np.cos(np.radians(lat))[:, None] * np.ones_like(ts_mean))),
        "tmax_K": float(tmax.max()), "tmin_K": float(tmin.min()),
        "dust_tau_mean_range": [float(np.tensordot(w, tau, axes=1).min()), float(np.tensordot(w, tau, axes=1).max())],
    }


def main():
    v = {}
    v["terrain"], elev = build_terrain()
    v["grs"] = build_grs()
    v["mcd"] = build_mcd(elev)
    save_json(OUT / GRID / "grid.json", {
        "id": GRID, "body": "mars", "type": "latlon", "n_lat": N_LAT, "n_lon": N_LON,
        "cell_deg": 0.5, "cell_km": 29.64, "radius_m": R_MARS, "validation": v,
    })
    print("validation summary:", v)


if __name__ == "__main__":
    main()
