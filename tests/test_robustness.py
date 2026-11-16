"""Sensitivity of the Earth Twin ranking to its weights, and the check against documented analog sites.

Run with: npm test
"""
import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app import DOCUMENTED_EARTH, app, store, twin
from backend.geo import RADIUS_KM, gc_km
from backend.similarity import PURPOSES, SEPARATION_KM

client = TestClient(app)
GALE = {"body": "mars", "lat": -4.59, "lon": 137.44, "purpose": "mobility"}
RIDGE = {"body": "moon", "lat": -89.45, "lon": -137.31, "purpose": "ice"}


def robustness(**kw):
    return client.post("/api/twin/robustness", json=kw)


# ------------------------------------------------------------------ robustness
def test_every_weighted_dimension_is_varied_up_and_down_once():
    r = robustness(**GALE, n=10).json()
    weights = PURPOSES["mars"]["mobility"]["w"]
    assert [(v["dimension"], v["change"]) for v in r["variations"]] == [(d, s * 0.2) for d in weights for s in (1.0, -1.0)]
    assert len(r["candidates"]) == 10 and r["delta"] == 0.2
    for c in r["candidates"]:
        assert c["of"] == 2 * len(weights) and 0 <= c["stays"] <= c["of"]
        assert c["robust"] == (c["stays"] == c["of"]) == (not c["lost_when"])
        assert c["stays"] + len(c["lost_when"]) == c["of"]


def test_the_baseline_is_the_same_ranking_the_search_returns():
    top = client.post("/api/twin", json={**GALE, "n": 10}).json()["candidates"]
    r = robustness(**GALE, n=10).json()
    assert [c["id"] for c in r["candidates"]] == [c["id"] for c in top]


def test_a_vanishing_change_keeps_every_match():
    """With weights changed by one part in ten thousand nothing can move: a sanity check on the method."""
    for target in (GALE, RIDGE):
        r = robustness(**target, n=10, delta=1e-4).json()
        assert all(c["robust"] for c in r["candidates"]), [c for c in r["candidates"] if not c["robust"]]


def test_stays_matches_an_independent_recomputation():
    """Recompute one variation directly with the scoring model and compare with the endpoint's verdict."""
    g, i, j = store.locate("mars", GALE["lat"], GALE["lon"])
    p, dims, score, _ = twin.score_all(g, i, j, "mobility")
    e = store.g["earth"]
    base = twin.top(score, 10)
    r = robustness(**GALE, n=10).json()
    weights = PURPOSES["mars"]["mobility"]["w"]
    for d in weights:
        for sign in (1.0, -1.0):
            w = dict(weights)
            w[d] = weights[d] * (1 + sign * 0.2)
            varied, _ = twin.combine(dims, w)
            varied = np.where(twin.valid, varied, np.nan)
            picks = twin.top(varied, 10)
            for c, (ei, ej) in zip(r["candidates"], base):
                lat, lon = e.centre(ei, ej)
                stays = (ei, ej) in picks or any(
                    float(varied[a, b]) >= float(varied[ei, ej]) and float(gc_km(lat, lon, *e.centre(a, b), RADIUS_KM["earth"])) <= SEPARATION_KM
                    for a, b in picks)
                lost = any(x["dimension"] == d and x["change"] == pytest.approx(sign * 0.2) for x in c["lost_when"])
                assert stays != lost, (c["rank"], d, sign)


def test_robustness_does_not_change_any_score():
    before = client.post("/api/twin", json={**GALE, "n": 5}).json()
    robustness(**GALE, n=10)
    after = client.post("/api/twin", json={**GALE, "n": 5}).json()
    assert [(c["id"], c["score"]) for c in before["candidates"]] == [(c["id"], c["score"]) for c in after["candidates"]]


@pytest.mark.parametrize("delta", [0, -0.1, 0.6, float("nan")])
def test_delta_must_be_a_sensible_fraction(delta):
    payload = {**GALE, "delta": delta}
    r = client.post("/api/twin/robustness", content=__import__("json").dumps(payload, allow_nan=True), headers={"content-type": "application/json"})
    assert r.status_code in (400, 422)


# ------------------------------------------------------------------ validation
def test_validation_reports_every_documented_site_with_an_honest_percentile():
    r = client.post("/api/twin/validation", json=GALE)
    assert r.status_code == 200
    v = r.json()
    assert len(v["sites"]) == len(DOCUMENTED_EARTH)
    g, i, j = store.locate("mars", GALE["lat"], GALE["lon"])
    _, _, score, _ = twin.score_all(g, i, j, "mobility")
    finite = score[np.isfinite(score)]
    assert v["cells"] == int(finite.size)
    e = store.g["earth"]
    for site in v["sites"]:
        ei, ej = e.index(site["lat"], site["lon"])
        x = float(score[ei, ej])
        if not math.isfinite(x):
            assert site["percentile"] is None and site["score"] is None and not site["analysed"]      # never a zero
            continue
        assert site["score"] == pytest.approx(x, abs=1e-6)
        assert site["percentile"] == pytest.approx(float((finite < x).sum() / finite.size))
        assert site["better_cells"] == int((finite > x).sum())
    scored = [s for s in v["sites"] if s["percentile"] is not None]
    assert [s["percentile"] for s in scored] == sorted((s["percentile"] for s in scored), reverse=True)


def test_validation_summary_counts_hits_and_misses_for_this_world_only():
    v = client.post("/api/twin/validation", json=GALE).json()
    own = [s for s in v["sites"] if s["for_this_body"] and s["percentile"] is not None]
    s = v["summary"]
    assert s["scored"] == len(own) and s["documented_for_this_body"] >= s["scored"]
    assert s["top_10_percent"] == sum(1 for x in own if x["percentile"] >= 0.90)
    assert s["top_25_percent"] == sum(1 for x in own if x["percentile"] >= 0.75)
    assert s["below_median"] == sum(1 for x in own if x["percentile"] < 0.50)
    assert s["top_10_percent"] <= s["top_25_percent"] <= s["scored"]


def test_the_reference_list_still_never_changes_a_score():
    """Validation reads the ranking; it must leave it untouched."""
    before = client.post("/api/twin", json={**RIDGE, "n": 5}).json()["candidates"]
    client.post("/api/twin/validation", json=RIDGE)
    after = client.post("/api/twin", json={**RIDGE, "n": 5}).json()["candidates"]
    assert [(c["id"], c["score"]) for c in before] == [(c["id"], c["score"]) for c in after]
