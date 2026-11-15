"""Evidence, coordinates and integration rules for the curated site catalogue."""
import copy
import math

import pytest
from fastapi.testclient import TestClient

from backend import registry, sites
from backend.app import DOCUMENTED_EARTH, PINS, app, pnames

client = TestClient(app)


def test_original_sites_are_retained_and_additions_respect_revised_limit():
    all_sites = sites.SITES
    assert sum(p["added_in"] == "original" for p in all_sites) == 93
    assert 93 < len(all_sites) <= 193  # user correction: up to 100 ADDITIONAL sites
    assert len({p["id"] for p in all_sites}) == len(all_sites)
    assert len({(p["body"], p["name"]) for p in all_sites}) == len(all_sites)
    sites.validate_registry(all_sites)


def test_every_record_has_traceable_evidence_and_honest_grade_status():
    for p in sites.SITES:
        assert p["sources"] and all(s["title"] and s["url"].startswith("https://") and s["role"] for s in p["sources"])
        assert p["coordinate_reference"] and p["coordinate_note"]
        assert p["grade_status"] == "not_scored" and "score" not in p and "grade" not in p
        assert set(p["dataset_availability"]) <= set(registry.BY_ID)
        assert p["verification_status"] in {"verified", "review_needed"}
        if p["verification_status"] == "verified":
            assert p["verified_on"] == "2026-11-14"
        else:
            assert p["verified_on"] is None


def test_documented_earth_results_require_both_location_and_research_evidence():
    assert DOCUMENTED_EARTH
    for p in DOCUMENTED_EARTH:
        assert p["verification_status"] == "verified"
        assert p["research_evidence_status"] == "verified"
        assert p["analog_purpose"] and p["comparison_limitations"]
        assert any("coordinates" in s["role"] for s in p["sources"])
        assert any("research" in s["role"] for s in p["sources"])
    result = client.post("/api/analogs/nearby", json={"lat": 0, "lon": 0, "radius_km": 20015, "limit": 50}).json()
    assert {p["site_id"] for p in result["documented"]} == {p["id"] for p in DOCUMENTED_EARTH}
    assert result["review_pending"] > 0


def test_every_site_is_exposed_and_searchable_by_established_name():
    for body in PINS:
        result = client.get("/api/pins", params={"body": body}).json()["pins"]
        assert {p["id"] for p in result} == {p["id"] for p in sites.SITES if p["body"] == body}
        for p in result:
            found = client.get("/api/search", params={"body": body, "q": p["name"]}).json()["results"]
            assert any(x.get("id") == p["id"] for x in found), p["name"]


def test_search_uses_programme_purpose_and_diacritic_insensitive_metadata():
    for body, query, expected in [("earth", "Puʻu Haiwahine", "Mauna Kea"),
                                  ("earth", "rover emulator", "Hverir, Námafjall"),
                                  ("earth", "salda", "Lake Salda"),
                                  ("mars", "MSL landing", "Eberswalde")]:
        found = client.get("/api/search", params={"body": body, "q": query}).json()["results"]
        assert any(x["name"] == expected for x in found)


def test_catalogue_filters_and_sources_have_consistent_counts():
    all_records = client.get("/api/sites").json()
    assert len(all_records["sites"]) == all_records["catalogue"]["total"]
    assert all_records["catalogue"]["added"] == len(sites.SITES) - 93
    verified = client.get("/api/sites", params={"body": "earth", "verified": True}).json()["sites"]
    assert len(verified) == len(DOCUMENTED_EARTH)
    candidates = client.get("/api/sites", params={"classification": "candidate_region"}).json()["sites"]
    assert candidates and all(p["kind"] == "feature" for p in candidates)
    refs = client.get("/api/sources").json()["site_sources"]
    assert {p["site_id"] for p in refs} == {p["id"] for p in sites.SITES}


def test_published_location_corrections_and_coordinate_conventions():
    p = {x["name"]: x for x in sites.SITES}
    assert (p["Mauna Kea"]["lat"], p["Mauna Kea"]["lon"]) == (19.7612, -155.468)
    assert p["Axel Heiberg Island cold springs"]["lat"] == pytest.approx(79 + 24 / 60 + 30 / 3600, abs=1e-6)
    assert p["Nördlinger Ries"]["lon"] == pytest.approx(10.6167)
    assert p["Apollo 11"]["lat"] == pytest.approx(.67416)
    assert p["Chang'e 6"]["lon"] == pytest.approx(206.0148 - 360)
    assert p["Hverir, Námafjall"]["lat"] == pytest.approx(65 + 38 / 60 + 26.5 / 3600, abs=1e-6)
    assert all(math.isfinite(x["lat"]) and math.isfinite(x["lon"]) for x in p.values())


def test_contextual_gazetteer_uses_reviewed_feature_coordinates():
    for site in sites.SITES:
        if site["kind"] == "feature":
            named = pnames[site["body"]].find(site["name"])
            assert named and (named["lat"], named["lon"]) == (site["lat"], site["lon"])


@pytest.mark.parametrize("change", [{"lat": float("nan")}, {"lon": 180}, {"grade": "A"}, {"sources": []}])
def test_invalid_or_fabricated_registry_values_fail_early(change):
    records = copy.deepcopy(sites.SITES)
    records[0].update(change)
    with pytest.raises(ValueError):
        sites.validate_registry(records)


@pytest.mark.parametrize("lat,lon", [(91, 0), (0, "NaN"), (0, "Infinity")])
def test_cell_rejects_invalid_coordinates_before_grid_indexing(lat, lon):
    assert client.get("/api/cell", params={"body": "moon", "lat": lat, "lon": lon}).status_code == 422


def test_comparison_rejects_invalid_earth_coordinates():
    r = client.post("/api/twin/compare", json={"body": "mars", "lat": -4.59, "lon": 137.44,
                                               "purpose": "general", "earth_lat": 91, "earth_lon": 0})
    assert r.status_code == 422
