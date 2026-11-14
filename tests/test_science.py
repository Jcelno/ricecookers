"""Scientific and logical checks for RADIUM.

Every expected value here is either a property the method must satisfy by
construction, or a published fact about the Moon, Mars or Earth with the
tolerance stated. Nothing is tuned to make a test pass.

Run:  npm test      (or  .venv/bin/python -m pytest tests -q)
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from backend import catalog, reference, registry
from backend.geo import gc_km, pick_distinct, polar_latlon, polar_xy
from backend.similarity import PURPOSES, Twin, gauss_sim, log_sim, purpose_applicable
from backend.store import Store
from backend.suitability import CRITERIA, GRADE_EDGES, LIMITS, MIN_COVERAGE, MISSIONS, Engine, band, grade_of, normalise, ramp
from pipeline.common import masked_quantiles, regrid_bilinear, regrid_nearest, terrain_cells


@pytest.fixture(scope="session")
def store():
    return Store()


@pytest.fixture(scope="session")
def engine(store):
    return Engine(store)


@pytest.fixture(scope="session")
def twin(store):
    return Twin(store)


# --------------------------------------------------------------------- geometry
def test_polar_projection_round_trip():
    lat = np.array([-89.9, -85.0, -80.0, 80.0, 88.3, 89.99])
    lon = np.array([-170.0, -45.0, 0.0, 90.0, 133.0, 179.0])
    for south in (True, False):
        m = lat < 0 if south else lat > 0
        x, y = polar_xy(lat[m], lon[m], south)
        la, lo = polar_latlon(x, y, south)
        assert np.allclose(la, lat[m], atol=1e-9)
        assert np.allclose(lo, lon[m], atol=1e-7)


def test_polar_projection_orientation_follows_lola_convention():
    # south pole: longitude 0 points up (+y), 90°E to the right (+x)
    x, y = polar_xy(-80.0, 0.0, True)
    assert abs(x) < 1e-6 and y > 0
    x, y = polar_xy(-80.0, 90.0, True)
    assert x > 0 and abs(y) < 1e-6
    # north pole: longitude 0 points down (−y), 90°E to the right (+x)
    x, y = polar_xy(80.0, 0.0, False)
    assert abs(x) < 1e-6 and y < 0
    x, y = polar_xy(80.0, 90.0, False)
    assert x > 0 and abs(y) < 1e-6


def test_polar_distance_from_pole_is_true_to_scale():
    # 10° from the pole on a sphere of radius R is an arc of R·10° ; the map
    # distance 2R·tan(5°) differs from it by under 0.3 %.
    x, y = polar_xy(-80.0, 37.0, True)
    r = math.hypot(x, y)
    arc = 1_737_400.0 * math.radians(10.0)
    assert abs(r / arc - 1) < 0.003


def test_great_circle_known_distance():
    # one degree of latitude on the Moon is 30.32 km
    assert gc_km(0, 0, 1, 0, 1737.4) == pytest.approx(30.32, abs=0.01)
    # antipodes are half a circumference apart; the haversine form loses a little
    # precision exactly there, so the check is to one metre in 10,669 km
    assert gc_km(10, 20, -10, -160, 3396.0) == pytest.approx(math.pi * 3396.0, abs=1e-3)


def test_grid_index_and_centre_agree(store):
    for gid, g in store.g.items():
        rng = np.random.default_rng(1)
        for _ in range(200):
            i = int(rng.integers(0, g.shape[0]))
            j = int(rng.integers(0, g.shape[1]))
            lat, lon = g.centre(i, j)
            assert g.index(lat, lon) == (i, j), gid


def test_moon_locate_uses_polar_grid_near_poles(store):
    assert store.locate("moon", -89.5, 10.0)[0].id == "moon_sp"
    assert store.locate("moon", 88.0, -120.0)[0].id == "moon_np"
    assert store.locate("moon", -60.0, 10.0)[0].id == "moon"
    assert store.locate("moon", 0.0, 0.0)[0].id == "moon"
    # every polar-square cell is withheld from the global grid, so no place is ranked twice
    moon = store.g["moon"]
    for pid in ("moon_sp", "moon_np"):
        p = store.g[pid]
        x, y = polar_xy(moon.lat2d, moon.lon2d, p.south)
        inside = (np.abs(x) < p.half_m) & (np.abs(y) < p.half_m)
        assert not moon.valid[inside].any()


def test_non_max_suppression_keeps_sites_apart():
    rng = np.random.default_rng(3)
    lat = rng.uniform(-60, 60, 4000)
    lon = rng.uniform(-180, 180, 4000)
    score = rng.random(4000)
    idx = pick_distinct(score, lat, lon, 3396.0, 500.0, 15)
    assert len(idx) == 15
    assert score[idx[0]] == score.max()
    for a in range(len(idx)):
        for b in range(a + 1, len(idx)):
            assert gc_km(lat[idx[a]], lon[idx[a]], lat[idx[b]], lon[idx[b]], 3396.0) >= 500.0
    assert all(score[idx[k]] >= score[idx[k + 1]] for k in range(len(idx) - 1))


# ---------------------------------------------------------------------- terrain
def test_slope_of_a_tilted_plane_is_exact():
    # A surface rising 100 m per km northward has a slope of atan(0.1) = 5.71°
    # everywhere, and zero detrended roughness.
    rows, cols, R = 180 * 4, 360 * 4, 1_737_400.0
    dphi = math.pi / rows
    lat = math.pi / 2 - dphi * (np.arange(rows) + 0.5)
    z = np.repeat((0.1 * R * lat)[:, None], cols, axis=1).astype(np.float32)
    t = terrain_cells(z, R, factor=4)
    band_ = slice(20, 160)                       # away from the replicated pole rows
    assert np.nanmax(np.abs(t["slope_med"][band_] - math.degrees(math.atan(0.1)))) < 0.02
    assert np.nanmax(t["rough_iqr"][band_]) < 0.5


def test_east_west_slope_baseline_is_latitude_corrected():
    # z = A·sin(longitude)·cos(latitude) is height along the body's y axis: on a
    # sphere its east–west gradient is A·cos(lon)/R at every latitude. Without
    # the latitude-dependent step the differencing baseline would shrink toward
    # the poles; with it the recovered slope stays accurate at 60°.
    rows, cols, R, A = 720, 1440, 3_396_000.0, 200_000.0
    dphi = math.pi / rows
    lat = math.pi / 2 - dphi * (np.arange(rows) + 0.5)
    lon = -math.pi + (2 * math.pi / cols) * (np.arange(cols) + 0.5)
    z = (A * np.cos(lat)[:, None] * np.sin(lon)[None, :]).astype(np.float32)
    t = terrain_cells(z, R, factor=4)
    # true gradient magnitude of y on the sphere: (A/R)·sqrt(cos²lon + sin²lat·sin²lon)
    cl, cn = np.meshgrid(-180 + (np.arange(cols // 4) + 0.5), 90 - 1.0 * (np.arange(rows // 4) + 0.5))
    truth = np.degrees(np.arctan((A / R) * np.sqrt(np.cos(np.radians(cl)) ** 2 + np.sin(np.radians(cn)) ** 2 * np.sin(np.radians(cl)) ** 2)))
    for la in (0.5, 30.5, 60.5):
        i = int(90 - la)
        assert np.max(np.abs(t["slope_med"][i] - truth[i])) < 0.05


def test_masked_quantiles_ignore_missing_values():
    v = np.array([[1.0, 2.0, 3.0, np.nan], [np.nan, np.nan, np.nan, 5.0], [np.nan] * 4])
    med, hi = masked_quantiles(v, (0.5, 1.0), min_valid=1)
    assert med[0] == pytest.approx(2.0) and hi[0] == pytest.approx(3.0)
    assert med[1] == pytest.approx(5.0)
    assert math.isnan(med[2])
    (strict,) = masked_quantiles(v, (0.5,), min_valid=2)
    assert math.isnan(strict[1])


def test_regridding_does_not_invent_values():
    lat = np.array([-45.0, 45.0])
    lon = np.array([-90.0, 90.0])
    src = np.array([[1.0, 2.0], [3.0, np.nan]], dtype=np.float32)
    near = regrid_nearest(src, lat, lon, 4, 8)
    assert set(np.unique(near[np.isfinite(near)])) <= {1.0, 2.0, 3.0}       # only source values appear
    assert np.isnan(near[0, -1])                                             # the missing bin stays missing
    smooth = regrid_bilinear(np.array([[10.0, 10.0], [20.0, 20.0]], dtype=np.float32), lat, np.array([-90.0, 90.0]), 4, 8)
    assert smooth.min() >= 10.0 - 1e-5 and smooth.max() <= 20.0 + 1e-5       # interpolation stays inside the data range


# ----------------------------------------------------------- data vs known facts
def test_lunar_elevation_extremes_match_lola(store):
    v = store.g["moon"].meta["validation"]["terrain"]
    assert -9300 < v["dem_min_m"] < -8800          # deepest point about −9.1 km
    assert 10500 < v["dem_max_m"] < 10900          # highest point about +10.8 km


def test_diviner_equatorial_temperatures(store):
    v = store.g["moon"].meta["validation"]["diviner"]
    assert 380 <= v["equator_tmax_K"] <= 400       # Williams et al. 2017: about 387–397 K
    assert 90 <= v["equator_tmin_K"] <= 100        # about 95 K
    assert 205 <= v["equator_tmean_K"] <= 225


def test_lunar_slopes_track_lola_slope_product(store):
    v = store.g["moon"].meta["validation"]["terrain"]
    assert v["slope_vs_ldsm16_r"] > 0.9
    assert 0.3 < v["slope_vs_ldsm16_median_ratio"] < 0.8     # longer baseline → gentler slopes


def test_best_lit_south_polar_point_is_the_ridge_by_shackleton(store):
    v = store.g["moon_sp"].meta["validation"]
    assert v["max_avg_illumination"] > 0.9
    assert v["max_avg_illumination_lat"] == pytest.approx(-89.45, abs=0.05)     # Mazarico et al. 2011
    assert v["max_avg_illumination_lon_e"] == pytest.approx(222.7, abs=0.5)


def test_polar_grids_are_consistently_oriented(store):
    for gid in ("moon_sp", "moon_np"):
        assert store.g[gid].meta["validation"]["orientation_check_r_prp_alt_vs_lola"] > 0.995, gid
    assert store.g["moon_np"].meta["validation"]["prp_north_longitude_correction"] == "lon = 180 - lon_listed"


def test_shackleton_floor_is_permanently_shadowed_and_cold(store):
    g, i, j = store.locate("moon", -89.67, 129.78)        # IAU centre of Shackleton
    assert g.id == "moon_sp"
    assert g.a["psr_frac"][i, j] > 0.9
    assert g.a["tmax"][i, j] < 110
    assert g.a["illum_frac"][i, j] < 0.02


def test_lunar_hydrogen_is_enriched_at_the_poles(store):
    h = store.g["moon"].a["h_ppm"]
    lat = store.g["moon"].lat2d
    assert np.nanmean(h[np.abs(lat) > 85]) > np.nanmean(h[np.abs(lat) < 30]) + 40     # Feldman et al. 2001


def test_maria_are_iron_rich_and_highlands_are_not(store):
    g = store.g["moon"]
    mare = g.value("feo_wt", *g.index(18.0, -58.0))        # Oceanus Procellarum
    highland = g.value("feo_wt", *g.index(-30.0, 100.0))   # far-side highlands
    assert mare > 14 and highland < 8


def test_mars_elevations_at_landing_sites(store):
    g = store.g["mars"]
    # published MOLA elevations of landing sites, km (cell means, so ±0.6 km)
    for name, lat, lon, km in [("Viking 1", 22.27, -47.95, -3.6), ("Viking 2", 47.64, 134.29, -4.5), ("Pathfinder", 19.13, -33.22, -3.7),
                               ("Spirit", -14.57, 175.47, -1.9), ("Opportunity", -1.95, -5.53, -1.4), ("Phoenix", 68.22, -125.75, -4.1),
                               ("InSight", 4.50, 135.62, -2.6), ("Zhurong", 25.07, 109.93, -4.1)]:
        v = g.value("elev_mean", *g.index(lat, lon))
        assert v / 1000 == pytest.approx(km, abs=0.6), name


def test_no_landing_has_been_made_above_the_datum(store):
    g = store.g["mars"]
    elev = [g.value("elev_mean", *g.index(la, lo)) for _, la, lo, *_ in reference.MARS_LANDINGS]
    assert max(elev) < -1300          # the statement shown with the "Above the datum" limit


def test_mars_pressure_is_physical(store):
    g = store.g["mars"]
    v = g.meta["validation"]["mcd"]
    assert v["pressure_vs_barometric_r"] > 0.99
    assert 0.8 < v["pressure_vs_barometric_median_ratio"] < 1.2
    hellas = g.value("ps_mean", *g.index(-42.4, 70.5))
    olympus = g.value("ps_mean", *g.index(18.65, -133.8))
    assert 1000 < hellas < 1300 and 50 < olympus < 150
    assert 195 < v["global_mean_tsurf_K"] < 215
    # Viking 1 measured roughly 690–900 Pa over a year
    assert 650 < g.value("ps_mean", *g.index(22.27, -47.95)) < 950


def test_earth_climate_at_known_places(store):
    g = store.g["earth"]
    at = lambda n, la, lo: g.value(n, *g.index(la, lo))      # noqa: E731
    assert at("precip_mm_yr", -24.08, -69.92) < 30            # Atacama core
    assert at("precip_mm_yr", -3.0, -60.0) > 1500             # Amazon
    assert at("ndvi_max", -3.0, -60.0) > 0.5 and at("ndvi_max", -24.08, -69.92) < 0.12
    assert at("tmean", -80.0, 90.0) < 225                     # East Antarctic plateau
    assert at("ice_frac", -80.0, 90.0) == pytest.approx(1.0)
    assert at("ps_mean", 33.0, 88.0) < 62000                  # Tibetan plateau, about 4.9 km up
    assert 285 < g.meta["validation"]["power"]["global_mean_skin_temp_K"] < 291


def test_salt_flats_are_not_counted_as_ice(store):
    g = store.g["earth"]
    i, j = g.index(40.12, -113.62)                            # Bonneville Salt Flats
    assert g.a["ice_reclassified"][i, j] == 1 and g.a["ice_frac"][i, j] == 0
    assert g.a["tmean"][i, j] > 283.15


def test_gibs_colour_decoding_was_exact(store):
    assert store.g["earth"].meta["validation"]["landcover"]["unmatched_colour_fraction"] < 1e-3


# --------------------------------------------------------------- catalogue rules
def test_every_variable_is_documented(store):
    ids = {s["id"] for s in registry.SOURCES}
    for gid, vars_ in catalog.VARS.items():
        for vid, m in vars_.items():
            assert vid in store.g[gid].a, f"{gid}.{vid} has no data array"
            assert m["evidence"] in catalog.EVIDENCE
            assert m["source"] is None or m["source"] in ids, f"{gid}.{vid} cites unknown source {m['source']}"
            assert m["evidence"] == "computed" or m["source"] is not None, f"{gid}.{vid} has no source but is not computed"
            assert m["res"] and m["desc"] and m["label"]
            if m.get("sigma"):
                assert m["sigma"] in store.g[gid].a


def test_sources_are_fully_described():
    need = {"id", "name", "purpose", "agency", "url", "access", "coverage", "variables", "units", "spatial_resolution",
            "temporal_coverage", "crs", "license", "limitations", "processing"}
    for s in registry.SOURCES:
        assert need <= set(s), s["id"]
        assert all(str(s[k]).strip() for k in need), s["id"]
        assert s["url"].startswith("https://")


def test_missing_data_is_reported_not_filled(store):
    # Mars water-equivalent hydrogen is not published poleward of about 57°
    d = store.describe(*store.locate("mars", 70.0, 0.0))
    item = next(i for g in d["groups"] for i in g["items"] if i["id"] == "weh_wt")
    assert item["value"] is None and "Water-equivalent hydrogen" in d["missing"]
    # permanent shadow is mapped only poleward of 65° on the Moon
    d = store.describe(*store.locate("moon", 10.0, 10.0))
    assert next(i for g in d["groups"] for i in g["items"] if i["id"] == "psr_frac")["value"] is None


def test_evidence_label_changes_where_the_method_changes(store):
    low = store.describe(*store.locate("moon", 20.0, 0.0))
    high = store.describe(*store.locate("moon", 72.0, 0.0))
    pick = lambda d: next(i for g in d["groups"] for i in g["items"] if i["id"] == "illum_frac")      # noqa: E731
    assert pick(low)["evidence"] == "computed" and pick(low)["value"] == pytest.approx(0.5)
    assert pick(high)["evidence"] == "modelled"


# ------------------------------------------------------------------ suitability
def test_transfer_functions():
    assert ramp(np.array([0.0, 5.0, 10.0, 20.0]), 0.0, 10.0).tolist() == [0.0, 0.5, 1.0, 1.0]
    assert ramp(np.array([20.0, 12.0, 4.0, 0.0]), 20.0, 4.0).tolist() == [0.0, 0.5, 1.0, 1.0]       # lower is better
    assert band(np.array([100.0, 170.0, 250.0, 365.0, 420.0]), 120.0, 220.0, 330.0, 400.0).tolist() == pytest.approx([0.0, 0.5, 1.0, 0.5, 0.0])
    assert math.isnan(ramp(np.array([np.nan]), 0, 1)[0])


def test_grade_edges():
    assert [g for g, _ in GRADE_EDGES] == ["A", "B", "C", "D", "F"]
    assert [grade_of(x) for x in (1.0, 0.80, 0.7999, 0.65, 0.50, 0.35, 0.3499, 0.0)] == ["A", "A", "B", "B", "C", "D", "F", "F"]
    assert grade_of(float("nan")) is None and grade_of(None) is None


def test_weights_normalise_to_one():
    for mid, m in MISSIONS.items():
        assert sum(m["weights"].values()) == pytest.approx(1.0), mid
        assert set(m["weights"]) <= set(CRITERIA) and set(m["limits"]) <= set(LIMITS)
        w = normalise({k: 37.0 for k in m["weights"]}, mid)
        assert sum(w.values()) == pytest.approx(1.0)
        assert len(set(round(x, 12) for x in w.values())) == 1
        w = normalise({next(iter(m["weights"])): 5.0, **{k: 0.0 for k in list(m["weights"])[1:]}}, mid)
        assert max(w.values()) == pytest.approx(1.0)
        assert sum(normalise({k: 0.0 for k in m["weights"]}, mid).values()) == pytest.approx(1.0)       # all-zero falls back to equal
        assert all(v >= 0 for v in normalise({k: -3.0 for k in m["weights"]}, mid).values())


def test_scores_stay_in_range_and_follow_the_formula(store, engine):
    for mid in MISSIONS:
        for gid in engine.grids_for(mid):
            score, cov, excluded = engine.evaluate(gid, mid, None, None)
            ok = np.isfinite(score)
            assert ok.any()
            assert score[ok].min() >= 0 and score[ok].max() <= 1
            assert (cov[ok] >= MIN_COVERAGE - 1e-9).all() and not np.isfinite(score[cov < MIN_COVERAGE - 1e-9]).any()
    # one cell recomputed by hand from its criteria
    g, i, j = store.locate("mars", -4.59, 137.44)
    c = engine.cell(g, i, j, "mars_robotic", None, None)
    have = [f for f in c["factors"] if f["value"] is not None]
    by_hand = sum(f["weight"] * f["value"] for f in have) / sum(f["weight"] for f in have)
    assert c["score"] == pytest.approx(by_hand, abs=1e-6)
    assert c["coverage"] == pytest.approx(sum(f["weight"] for f in have))


def test_missing_criterion_is_dropped_and_weights_rescaled(store, engine):
    g, i, j = store.locate("mars", 68.22, -125.75)          # Phoenix: no hydrogen product at this latitude
    c = engine.cell(g, i, j, "mars_robotic", None, None)
    water = next(f for f in c["factors"] if f["id"] == "mars_water")
    assert water["value"] is None and water["grade"] is None
    assert c["coverage"] == pytest.approx(1 - MISSIONS["mars_robotic"]["weights"]["mars_water"])
    assert c["grade"] is not None                             # still graded: 85 % of the weight has data
    # with nearly all weight on the missing criterion the cell cannot be graded
    c2 = engine.cell(g, i, j, "mars_robotic", {**{k: 0.0 for k in MISSIONS["mars_robotic"]["weights"]}, "mars_water": 90, "mars_terrain": 10}, None)
    assert c2["score"] is None and c2["grade"] is None


def test_weights_change_scores_and_ranking(engine):
    base, _ = engine.rank("lunar_base", None, None, 12)
    comms, _ = engine.rank("lunar_base", {"moon_ice": 5, "moon_solar": 5, "moon_terrain": 5, "moon_thermal": 5, "moon_comm": 75, "moon_regolith": 5}, None, 12)
    assert [t[1:] for t in base] != [t[1:] for t in comms]
    # after the change the top site keeps Earth in view far more of the time
    vis = lambda top: np.mean([engine.store.g[g].a["earth_vis"][i, j] for _, g, i, j in top[:5]])      # noqa: E731
    assert vis(comms) > vis(base) + 0.2


def test_hard_limits_exclude_and_can_be_switched_off(store, engine):
    g, i, j = store.locate("moon", -89.67, 129.78)           # floor of Shackleton: permanent shadow
    on = engine.cell(g, i, j, "lunar_base", None, None)
    assert on["excluded"] and "moon_shadow" in [l["id"] for l in on["failed_limits"]]
    off = engine.cell(g, i, j, "lunar_base", None, [])
    assert not off["excluded"] and off["score"] == pytest.approx(on["score"])
    for mid in MISSIONS:
        top, stats = engine.rank(mid, None, None, 10)
        for _, gid, i, j in top:
            assert not engine.evaluate(gid, mid, None, None)[2][i, j]       # no ranked site violates a limit
        assert stats["excluded"] > 0


def test_ranked_sites_are_distinct_places(engine, store):
    top, _ = engine.rank("mars_human", None, None, 12)
    pts = [store.g[g].centre(i, j) for _, g, i, j in top]
    for a in range(len(pts)):
        for b in range(a + 1, len(pts)):
            assert gc_km(*pts[a], *pts[b], 3396.0) >= 399.0
    assert all(top[k][0] >= top[k + 1][0] for k in range(len(top) - 1))


def test_mars_ranking_recovers_regions_real_missions_chose(engine, store):
    """An independent sanity check, not a tuning target: with default weights the
    best robotic sites should include country that landing-site teams selected."""
    top, _ = engine.rank("mars_robotic", None, None, 12)
    pts = [store.g[g].centre(i, j) for _, g, i, j in top]
    near = lambda lat, lon, km: any(gc_km(lat, lon, la, lo, 3396.0) < km for la, lo in pts)       # noqa: E731
    assert near(-5.37, 137.81, 300)       # Gale crater (Curiosity)
    assert near(-0.04, -3.14, 900)        # Meridiani Planum (Opportunity)
    assert near(17.28, -25.71, 600)       # Oxia Planum / Mawrth Vallis (Rosalind Franklin)


def test_artemis_region_namesakes_rank_high_among_south_polar_cells(engine, store):
    g = store.g["moon_sp"]
    score, _, excluded = engine.evaluate("moon_sp", "lunar_base", None, None)
    ok = np.isfinite(score) & ~excluded
    ranked = np.sort(score[ok])[::-1]
    def best_percentile(lat, lon):
        d = gc_km(lat, lon, g.lat2d, g.lon2d, g.radius_km)
        best = np.nanmax(np.where(ok & (d < 15), score, np.nan))
        return float((ranked > best).sum()) / ranked.size
    assert best_percentile(-89.45, -137.31) < 0.002     # ridge beside Shackleton
    assert best_percentile(-84.6, 31.0) < 0.002         # Mons Mouton
    assert best_percentile(-88.079, 111.288) < 0.01     # Slater
    assert best_percentile(-88.485, -88.345) < 0.02     # de Gerlache rim


# ------------------------------------------------------------------- similarity
def test_similarity_kernels():
    assert log_sim(2.0, np.array([2.0]), 0.0)[0] == pytest.approx(1.0)
    assert log_sim(2.0, np.array([4.0]), 0.0)[0] == pytest.approx(math.exp(-0.5), abs=1e-9)      # factor of two → 0.61
    assert log_sim(4.0, np.array([2.0]), 0.0)[0] == pytest.approx(math.exp(-0.5), abs=1e-9)      # symmetric
    assert log_sim(1.0, np.array([4.0]), 0.0)[0] == pytest.approx(math.exp(-2.0), abs=1e-9)      # factor of four → 0.14
    assert gauss_sim(220.0, np.array([220.0, 260.0]), 40.0).tolist() == pytest.approx([1.0, math.exp(-0.5)])


def test_purpose_weights_are_complete():
    for body, ps in PURPOSES.items():
        assert "general" in ps
        for pid, p in ps.items():
            assert sum(p["w"].values()) == pytest.approx(1.0), (body, pid)
            assert "thermal" not in p["w"] and "dust" not in p["w"] if body == "moon" else True      # never scored for the Moon


def test_similarity_is_bounded_and_ignores_the_reference_list(store, twin):
    g, i, j = store.locate("mars", 18.44, 77.45)
    p, dims, score, cov = twin.score_all(g, i, j, "general")
    ok = np.isfinite(score)
    assert 0 <= score[ok].min() and score[ok].max() <= 1
    assert not np.isfinite(score[~store.g["earth"].valid]).any()          # water cells are never candidates
    # the reference list of documented analog sites is not an input: emptying it changes nothing
    saved = list(reference.EARTH_ANALOGS)
    try:
        reference.EARTH_ANALOGS.clear()
        _, _, again, _ = twin.score_all(g, i, j, "general")
    finally:
        reference.EARTH_ANALOGS.extend(saved)
    assert np.array_equal(score, again, equal_nan=True)


def test_explanation_reproduces_the_ranked_score(store, twin):
    g, i, j = store.locate("moon", 0.67, 23.47)
    p, dims, score, cov = twin.score_all(g, i, j, "general")
    for ei, ej in twin.top(score, 5):
        ex = twin.explain(p, dims, ei, ej, "general")
        assert ex["score"] == pytest.approx(float(score[ei, ej]), abs=1e-6)
        scored = [d for d in ex["dimensions"] if d["score"] is not None and d["weight"] > 0]
        assert ex["score"] == pytest.approx(sum(d["weight"] * d["score"] for d in scored) / sum(d["weight"] for d in scored), abs=1e-9)
        labels = [b["label"] for b in ex["breaks_down"]]
        assert {"Gravity", "Air pressure", "Radiation", "Temperature"} <= set(labels)       # always disclosed for the Moon


def test_earth_cannot_score_what_it_cannot_reproduce(store, twin):
    g, i, j = store.locate("moon", 0.67, 23.47)
    _, dims, _, _ = twin.score_all(g, i, j, "general")
    assert "thermal" not in dims and "dust" not in dims
    g, i, j = store.locate("mars", -4.59, 137.44)
    p, dims, score, _ = twin.score_all(g, i, j, "general")
    assert not {"gravity", "pressure", "radiation"} & set(dims)
    ei, ej = twin.top(score, 1)[0]
    ex = twin.explain(p, dims, ei, ej, "general")
    pressure = next(b for b in ex["breaks_down"] if b["label"] == "Air pressure")
    assert "times denser" in pressure["text"]


def test_ice_purpose_is_only_offered_where_there_is_ice_evidence(store, twin):
    equatorial = twin.profile(*store.locate("mars", -4.59, 137.44))      # Gale: warm, no ground ice
    polar = twin.profile(*store.locate("mars", 68.22, -125.75))          # Phoenix: dug into ice
    assert equatorial["ice_index"] == pytest.approx(0.0)
    assert polar["ice_index"] == pytest.approx(1.0)
    assert purpose_applicable("ice", equatorial)[0] is False
    assert purpose_applicable("ice", polar)[0] is True
    assert purpose_applicable("mobility", equatorial)[0] is True


def test_cold_icy_sites_match_cold_frozen_ground(store, twin):
    g, i, j = store.locate("mars", 68.22, -125.75)
    p, dims, score, _ = twin.score_all(g, i, j, "ice")
    e = store.g["earth"]
    best = [e.centre(*ij) for ij in twin.top(score, 5)]
    assert all(e.value("tmean", *e.index(la, lo)) < 265 for la, lo in best)       # frozen ground, not hot desert
    sahara = float(score[e.index(23.0, 12.0)])
    dry_valleys = float(score[e.index(-77.6, 161.5)])
    assert dry_valleys > sahara + 0.2


def test_basaltic_deserts_match_a_warm_basaltic_mars_site(store, twin):
    g, i, j = store.locate("mars", 18.44, 77.45)            # Jezero
    p, dims, score, _ = twin.score_all(g, i, j, "geology")
    e = store.g["earth"]
    tibesti = float(score[e.index(20.4, 18.1)])             # basaltic massif, hyperarid
    amazon = float(score[e.index(-3.0, -60.0)])             # rainforest on sediment
    assert grade_of(tibesti) == "A"
    assert grade_of(amazon) in ("D", "F")
    assert tibesti - amazon > 0.5


def test_reference_sites_are_on_land_and_well_formed(store):
    e = store.g["earth"]
    assert len(reference.EARTH_ANALOGS) >= 30
    for name, lat, lon, country, bodies, theme, why, ref in reference.EARTH_ANALOGS:
        assert -90 <= lat <= 90 and -180 <= lon <= 180, name
        assert set(bodies) <= {"moon", "mars"} and bodies, name
        assert ref.strip() and why.strip() and theme.strip(), name
        i, j = e.index(lat, lon)
        assert e.a["land_frac"][i, j] > 0.2, f"{name} falls on water"
