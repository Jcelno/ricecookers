"""Shared curated site registry, independent of numerical scoring inputs.

The catalogue records evidence and locations. It must never assign a grade.
Dataset identifiers describe regional products available to the app, not a
promise that any particular analysis cell or small outcrop has measurements.
"""
from __future__ import annotations

import json
import math
from copy import deepcopy
from pathlib import Path
import unicodedata

REGISTRY = json.loads(Path(__file__).with_name("site_registry.json").read_text())
SITES = REGISTRY["sites"]
BASELINE_COUNT = REGISTRY["baseline_count"]
MAX_ADDITIONS = REGISTRY["max_additions"]


def validate_registry(sites):
    if not BASELINE_COUNT <= len(sites) <= BASELINE_COUNT + MAX_ADDITIONS:
        raise ValueError("The registry must retain the original catalogue and add at most 100 sites.")
    identifiers, names, coordinates = set(), set(), set()
    for site in sites:
        body, sid = site["body"], site["id"]
        if body not in ("earth", "moon", "mars") or sid in identifiers:
            raise ValueError(f"Invalid or duplicate site: {sid}")
        key = (body, site["name"].casefold())
        coord = (body, round(site["lat"], 5), round(site["lon"], 5))
        if key in names or coord in coordinates:
            raise ValueError(f"Duplicate name or coordinates: {sid}")
        identifiers.add(sid)
        names.add(key)
        coordinates.add(coord)
        if not (math.isfinite(site["lat"]) and -90 <= site["lat"] <= 90
                and math.isfinite(site["lon"]) and -180 <= site["lon"] < 180):
            raise ValueError(f"Invalid coordinates: {sid}")
        if "grade" in site or "score" in site:
            raise ValueError(f"Curated evidence cannot supply a model grade: {sid}")
        if site["classification"] not in {"historical_mission", "candidate_region", "geological_research_region",
                                           "terrestrial_analog", "research_candidate"}:
            raise ValueError(f"Unknown site classification: {sid}")
        if not site["sources"] or not site["coordinate_reference"]:
            raise ValueError(f"Missing evidence: {sid}")
        if site["verification_status"] == "verified" and not site["verified_on"]:
            raise ValueError(f"Missing verification date: {sid}")
        if body == "earth" and not site["analog_purpose"]:
            raise ValueError(f"Missing research purpose: {sid}")


validate_registry(SITES)


def for_body(body):
    """Copies keep callers from accidentally changing the canonical evidence."""
    return [deepcopy(p) for p in SITES if p["body"] == body]


def documented(site):
    return site["body"] == "earth" and site["verification_status"] == "verified"


def searchable_text(site):
    values = [site["name"], site["body"], site["classification"], site.get("country", ""),
              site.get("theme", ""), site.get("analog_purpose", ""), site.get("description", ""),
              *site.get("programs", []), *site.get("aliases", []), *site.get("supported_dimensions", []),
              *(s["title"] for s in site.get("sources", []))]
    return normalise_text(" ".join(values))


def normalise_text(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(c))


def matches(site, query):
    terms = normalise_text(query).split()
    text = searchable_text(site)
    return bool(terms) and all(t in text for t in terms)


def summary():
    return {
        "total": len(SITES), "baseline": BASELINE_COUNT, "added": len(SITES) - BASELINE_COUNT,
        "max_additions": MAX_ADDITIONS, "reviewed_on": REGISTRY["review_date"],
        "by_body": {b: {"total": sum(s["body"] == b for s in SITES),
                          "verified": sum(s["body"] == b and s["verification_status"] == "verified" for s in SITES)}
                    for b in ("earth", "moon", "mars")},
    }
