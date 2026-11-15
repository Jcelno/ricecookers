"""API checks for Near Me, the Research Test Brief and scenario probes.

Run with: npm test   (or .venv/bin/python -m pytest tests -q)
"""
import math

import pytest
from fastapi.testclient import TestClient

from backend.app import PINS, app
from backend.geo import RADIUS_KM, gc_km

client = TestClient(app)
GALE = {"body": "mars", "target_lat": -4.59, "target_lon": 137.44}


def nearby(**kw):
    return client.post("/api/analogs/nearby", json=kw)


# ------------------------------------------------------------------ geometry
@pytest.mark.parametrize("lat,lon", [(0, 0), (90, 0), (-90, 0), (12.5, 179.99), (-33, -179.99), (51.5, -0.12)])
def test_nearest_is_sorted_by_great_circle_distance(lat, lon):
    r = nearby(lat=lat, lon=lon, radius_km=20015)
    assert r.status_code == 200
    docs = r.json()["documented"]
    assert len(docs) == min(20, len(PINS["earth"]))
    d = [x["distance_km"] for x in docs]
    assert d == sorted(d)
    for x in docs:  # independent recomputation
        assert x["distance_km"] == pytest.approx(float(gc_km(lat, lon, x["lat"], x["lon"], RADIUS_KM["earth"])), abs=1e-6)


def test_longitude_is_normalised_and_antimeridian_wraps():
    a = nearby(lat=10, lon=-190, radius_km=5000).json()
    b = nearby(lat=10, lon=170, radius_km=5000).json()
    assert a["query"]["lon"] == pytest.approx(170)
    assert [x["name"] for x in a["documented"]] == [x["name"] for x in b["documented"]]


def test_empty_radius_is_a_real_empty_result():
    r = nearby(lat=-50, lon=-140, radius_km=10).json()  # open South Pacific
    assert r["documented"] == [] and r["documented_in_radius"] == 0


@pytest.mark.parametrize("body", [
    {"lat": 91, "lon": 0}, {"lat": -90.5, "lon": 0}, {"lat": 0, "lon": 0, "radius_km": 5},
    {"lat": 0, "lon": 0, "radius_km": 1e9}, {"lat": 0, "lon": 0, "mode": "fastest"},
    {"lat": 0, "lon": 0, "body": "mars", "target_lat": 0, "target_lon": 0, "purpose": "swimming"},
    {"lat": 0, "lon": 0, "body": "mars"},
])
def test_invalid_requests_fail_safely(body):
    assert nearby(**body).status_code in (400, 422)


def test_non_finite_numbers_are_rejected():
    r = client.post("/api/analogs/nearby", content=b'{"lat": NaN, "lon": 0}', headers={"content-type": "application/json"})
    assert r.status_code == 422


def test_result_count_is_capped():
    r = nearby(lat=0, lon=0, radius_km=20015, limit=100000).json()
    assert len(r["documented"]) <= 50


# ------------------------------------------------------------ science rules
def test_similarity_is_never_invented_without_a_target():
    r = nearby(lat=40.7, lon=-74.0, radius_km=20015).json()
    assert r["target"] is None
    assert all(x["similarity"] is None for x in r["documented"])
    assert nearby(lat=40.7, lon=-74.0, mode="best").status_code == 422


def test_best_nearby_reconciles_with_earth_twin_compare():
    r = nearby(lat=35, lon=-115, radius_km=1500, mode="best", purpose="mobility", **GALE).json()
    assert r["regions"], "expected modelled regions in the US Southwest"
    for reg in r["regions"][:3]:
        assert reg["distance_km"] <= 1500
        cmp_ = client.post("/api/twin/compare", json={"body": "mars", "lat": -4.59, "lon": 137.44, "purpose": "mobility",
                                                      "earth_lat": reg["lat"], "earth_lon": reg["lon"]}).json()
        assert reg["similarity"]["score"] == pytest.approx(cmp_["match"]["score"], abs=1e-12)
        assert reg["similarity"]["grade"] == cmp_["match"]["grade"]
    scores = [x["similarity"]["score"] for x in r["regions"]]
    assert scores == sorted(scores, reverse=True)


def test_distance_and_similarity_rankings_are_separate():
    near = nearby(lat=35, lon=-115, radius_km=3000, purpose="mobility", **GALE).json()["documented"]
    best = nearby(lat=35, lon=-115, radius_km=3000, mode="best", documented_only=True, purpose="mobility", **GALE).json()["documented"]
    assert {x["name"] for x in near} == {x["name"] for x in best}
    assert [x["distance_km"] for x in near] == sorted(x["distance_km"] for x in near)
    assert [x["similarity"]["score"] for x in best] == sorted((x["similarity"]["score"] for x in best), reverse=True)
    # Distance never enters the similarity value: same site, same score in both modes.
    by_name = {x["name"]: x["similarity"]["score"] for x in near}
    assert all(by_name[x["name"]] == x["similarity"]["score"] for x in best)


def test_modelled_regions_are_land_cells_never_ocean():
    r = nearby(lat=0, lon=-30, radius_km=4000, mode="best", **GALE).json()  # mid-Atlantic
    from backend.app import store
    e = store.g["earth"]
    for reg in r["regions"]:
        i, j = e.index(reg["lat"], reg["lon"])
        assert bool(e.valid[i, j])
        assert reg["kind"] == "modelled_region"


# ------------------------------------------------------------------- brief
def test_brief_is_a_proposal_built_from_the_real_comparison():
    req = {"body": "mars", "lat": -4.59, "lon": 137.44, "purpose": "mobility", "earth_lat": 36.0, "earth_lon": -116.0}
    b = client.post("/api/brief", json=req).json()
    cmp_ = client.post("/api/twin/compare", json={k: v for k, v in req.items()}).json()
    assert b["kind"] == "proposal" and "not a result" in b["disclaimer"]
    assert b["match"]["score"] == pytest.approx(cmp_["match"]["score"])
    labels = {d["id"]: d for d in cmp_["match"]["dimensions"]}
    for d in b["why_useful"]:
        assert labels[d["id"]]["score"] >= 0.65 and d["sources"], d["id"]
    for d in b["mismatches"]:
        assert labels[d["id"]]["score"] < 0.5
    for d in b["not_assessed"]:
        assert labels[d["id"]]["score"] is None
    assert all(v.startswith("Not assessed") for v in b["unknowns"].values())
    assert b["purpose"]["id"] == "mobility" and b["meta"]["settings"]["purpose"] == "mobility"


def test_brief_rejects_bad_input():
    base = {"body": "mars", "lat": -4.59, "lon": 137.44, "purpose": "mobility", "earth_lat": 36.0, "earth_lon": -116.0}
    assert client.post("/api/brief", json={**base, "setting": "space"}).status_code == 422
    assert client.post("/api/brief", json={**base, "earth_lat": 120}).status_code == 422
    assert client.post("/api/brief", json={**base, "purpose": "x"}).status_code == 400


# -------------------------------------------------------------- scenarios
def test_identical_scenarios_give_identical_results():
    body = {"mission": "mars_robotic", "weights": {"terrain": 0.4, "edl": 0.2}, "n": 10}
    a = client.post("/api/rank", json=body).json()
    b = client.post("/api/rank", json=body).json()
    assert a["sites"] == b["sites"]


def test_probe_reports_limit_exclusion_instead_of_a_zero():
    sites = client.post("/api/rank", json={"mission": "mars_human", "n": 5}).json()["sites"]
    probe = [{"lat": s["lat"], "lon": s["lon"]} for s in sites] + [{"lat": 70.0, "lon": 0.0}]
    r = client.post("/api/rank", json={"mission": "mars_human", "n": 5, "probe": probe}).json()
    assert [p["rank"] for p in r["probes"][:5]] == [1, 2, 3, 4, 5]
    far_north = r["probes"][-1]
    assert far_north["excluded"] and "mars_lat50" in far_north["failed_limits"]
    assert all(math.isfinite(p["score"]) for p in r["probes"] if p["score"] is not None)
