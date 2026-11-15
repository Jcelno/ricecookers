"""Compatibility adapters over the single curated registry in site_registry.json.

No score is stored in the catalogue. Earth records awaiting source/coordinate
review remain discoverable but are not called documented analogues by the API.
"""
from __future__ import annotations
from .sites import for_body


def _landings(body):
    return [(p["name"], p["lat"], p["lon"], p["year"], p["note"]) for p in for_body(body) if p["kind"] == "landing"]

MOON_LANDINGS = _landings("moon")
MARS_LANDINGS = _landings("mars")
MOON_FEATURES = [(p["name"], p["note"]) for p in for_body("moon") if p["kind"] == "feature"]
MARS_FEATURES = [(p["name"], p["note"]) for p in for_body("mars") if p["kind"] == "feature"]
EARTH_ANALOGS = [(p["name"], p["lat"], p["lon"], p["country"], p["bodies"], p["theme"], p["note"], p["source"])
                for p in for_body("earth")]


def moon_pins(names=None):
    return for_body("moon")


def mars_pins(names=None):
    return for_body("mars")


def earth_pins():
    pins = for_body("earth")
    for p in pins:
        p["tags"] = site_tags(p["theme"], p["note"])
    return pins


# -----------------------------------------------------------------------------
# Tags for Earth research sites, for colouring and filtering the atlas.
# Derived only from each registry record's theme and note by the explicit keyword rules below.
# A site can carry several tags; a site no rule matches is "Other or mixed", never a guess.
# These describe reported context; verification_status governs evidence claims.
# They are not measurements and never enter a score.
# -----------------------------------------------------------------------------
ENVIRONMENT_RULES = [
    ("desert", "Arid desert", r"desert|hyperarid|arid|dry valleys|dry limit"),
    ("volcanic", "Volcanic or basaltic", r"basalt|volcan|lava|tephra|maar"),
    ("polar", "Polar, ice or permafrost", r"ice|polar|arctic|permafrost|cold desert"),
    ("impact", "Impact structure", r"impact"),
    ("salt", "Salt flat or brine", r"\bsalts?\b|brine|saline|salar|gypsum|\bpans\b"),
    ("subsurface", "Cave or lava tube", r"lava tube|cave"),
    ("hydrothermal", "Hydrothermal or spring", r"hydrothermal|spring|acidic"),
]
APPLICATION_RULES = [
    ("mobility", "Operations and mobility", r"operations|crew|test sites|isolation"),
    ("geology", "Geology and sampling", r"impact|basalt|volcan|anorthosite|carbonates|sediment|layered"),
    ("ice", "Ice and drilling", r"ice|permafrost"),
    ("dust", "Dust and aeolian", r"sand|yardang|dust"),
    ("astrobiology", "Habitability and biosignatures", r"biosignature|microb|life|brine|spring|acidic|hydrothermal|habitab"),
    ("isru", "Resource use (ISRU)", r"isru|feedstock"),
]


def _tags(text: str, rules):
    import re
    hits = [(tid, label) for tid, label, pat in rules if re.search(pat, text, re.I)]
    return [{"id": t, "label": l} for t, l in hits] or [{"id": "other", "label": "Other or mixed"}]


def site_tags(theme: str, note: str):
    text = f"{theme}. {note}"
    return {"environment": _tags(text, ENVIRONMENT_RULES), "applications": _tags(text, APPLICATION_RULES)}
