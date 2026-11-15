from fastapi.testclient import TestClient

from backend.app import app
from backend.similarity import MIN_COVERAGE as SIM_MIN_COVERAGE
from backend.suitability import MIN_COVERAGE


def test_rank_carries_the_same_factor_provenance_as_the_cell():
    client = TestClient(app)
    site = client.post("/api/rank", json={"mission": "lunar_base", "n": 1}).json()["sites"][0]
    cell = client.get("/api/cell", params={"body": "moon", "lat": site["lat"], "lon": site["lon"],
                                            "mission": "lunar_base"}).json()["suitability"]
    assert site["min_coverage"] == cell["min_coverage"] == MIN_COVERAGE
    for ranked, selected in zip(site["factors"], cell["factors"]):
        assert ranked["inputs"] == selected["inputs"]
        assert ranked["contribution"] == selected["contribution"]
        for measurement in ranked["inputs"]:
            assert measurement["source"] and measurement["res"] and measurement["evidence"]


def test_api_advertises_the_existing_distinct_coverage_thresholds():
    thresholds = TestClient(app).get("/api/meta").json()["coverage_thresholds"]
    assert thresholds == {"suitability": MIN_COVERAGE, "similarity": SIM_MIN_COVERAGE}
