import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app import app, store, twin
from backend.reverse import explain_pair, screen_grid
from backend.similarity import MIN_COVERAGE, PURPOSES, purpose_applicable

client = TestClient(app)


@pytest.mark.parametrize("earth_lat,earth_lon", [(-24.5, -69.25), (-77.6, 161.5), (20.4, 18.1)])
def test_reverse_screen_matches_existing_forward_model_on_all_grids_and_purposes(earth_lat, earth_lon):
    ei, ej = twin.e.index(earth_lat, earth_lon)
    for gid in ("moon", "moon_sp", "moon_np", "mars"):
        g = store.g[gid]
        # Include both data-rich and missing-data cells; deterministic spatial sample.
        flat = np.flatnonzero(g.valid)
        points = [np.unravel_index(int(flat[k]), g.shape) for k in np.linspace(0, len(flat) - 1, 12).astype(int)]
        for purpose in PURPOSES[g.body]:
            reverse_score, reverse_cov = screen_grid(twin, g, ei, ej, purpose)
            for i, j in points:
                p, dims, score, coverage = twin.score_all(g, i, j, purpose)
                value = float(score[ei, ej])
                if not purpose_applicable(purpose, p)[0] or not math.isfinite(value):
                    assert not math.isfinite(float(reverse_score[i, j]))
                else:
                    assert reverse_score[i, j] == pytest.approx(value, abs=2e-7), (gid, purpose, i, j)
                assert reverse_cov[i, j] == pytest.approx(coverage[ei, ej], abs=1e-7)
                _, exact = explain_pair(twin, g, i, j, ei, ej, purpose)
                reference = twin.explain(p, dims, ei, ej, purpose)
                assert exact["score"] == reference["score"]
                assert exact["coverage"] == reference["coverage"]


def test_reverse_api_returns_real_distinct_cells_and_forward_equivalent_scores():
    request = {"lat": -24.5, "lon": -69.25, "purpose": "mobility", "n": 3}
    response = client.post("/api/twin/reverse", json=request)
    assert response.status_code == 200
    result = response.json()
    assert result["evidence"] == "computed" and result["min_coverage"] == MIN_COVERAGE
    assert "suitability" not in result and "overall" not in result
    for group in result["results"]:
        assert len(group["cells"]) == 3 and len(group["catalog"]) == 3
        assert group["searched_cells"] == sum(int(g.valid.sum()) for g in store.g.values() if g.body == group["body"])
        scores = [m["score"] for m in group["cells"]]
        assert scores == sorted(scores, reverse=True)
        assert len({m["id"] for m in group["cells"]}) == len(group["cells"])
        for match in group["cells"] + group["catalog"]:
            comparison = client.post("/api/twin/compare", json={"body": match["body"], "lat": match["lat"], "lon": match["lon"],
                "earth_lat": request["lat"], "earth_lon": request["lon"], "purpose": request["purpose"]}).json()
            assert match["score"] == comparison["match"]["score"]
            assert match["grade"] == comparison["match"]["grade"]
            assert match["coverage"] >= MIN_COVERAGE
            assert match["cell_km"] and match["dimensions"][0]["sources"]
            assert {row["label"] for row in match["breaks_down"]} >= {"Gravity", "Air pressure", "Radiation"}
        count = group["cells"][0]["curated_comparison"]
        assert 0 <= count["outscored"] <= count["scored"]
        assert count["target_id"] == group["cells"][0]["id"]


def test_reverse_ocean_is_not_assessed_and_never_zero():
    result = client.post("/api/twin/reverse", json={"lat": 0, "lon": -30}).json()
    assert result["status"] == "not_assessed"
    assert result["results"] == [] and not result["earth"]["analysed"]


def test_reverse_longitude_wraps_and_returns_analysis_cell_not_interpolation():
    a = client.post("/api/twin/reverse", json={"lat": -24.5, "lon": -69.25, "n": 1}).json()
    b = client.post("/api/twin/reverse", json={"lat": -24.5, "lon": 290.75, "n": 1}).json()
    assert a == b
    earth = a["earth"]
    assert (earth["lat"], earth["lon"]) == twin.e.centre(*twin.e.index(-24.5, -69.25))


@pytest.mark.parametrize("payload", [
    {"lat": 91, "lon": 0}, {"lat": 0, "lon": 0, "body": "earth"}, {"lat": 0, "lon": 0, "n": 50},
    {"lat": 0, "lon": 0, "purpose": "landing"}, {"lat": 0, "lon": 0, "body": "moon", "purpose": "dust"},
])
def test_reverse_bad_inputs_rejected(payload):
    assert client.post("/api/twin/reverse", json=payload).status_code == 422


def test_reverse_nonfinite_values_rejected():
    assert client.post("/api/twin/reverse", content='{"lat":NaN,"lon":0}', headers={"content-type": "application/json"}).status_code == 422


def test_reverse_ice_targets_are_applicable():
    result = client.post("/api/twin/reverse", json={"lat": -77.6, "lon": 161.5, "purpose": "ice", "n": 3}).json()
    for group in result["results"]:
        for match in group["cells"] + group["catalog"]:
            assert purpose_applicable("ice", twin.profile(*store.locate(match["body"], match["lat"], match["lon"])))[0]
