"""Research Test Brief: a structured, printable experiment *proposal* for one Moon/Mars target and one Earth place.

Everything measured comes from the Earth Twin comparison (similarity.Twin.explain). Everything else is a
reviewed, purpose-specific template below: it states what kind of test fits the purpose, never facts about the
site (roads, permits, facilities, budgets). Unknowns are written as "Not assessed".
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from .registry import BY_ID

RADIUM_VERSION = "1.1.0"
NOT_ASSESSED = "Not assessed. Requires field verification."

# Which registered datasets feed each comparison dimension, per world.
DIM_SOURCES = {
    "terrain": {"moon": ["lola_gdr"], "mars": ["mola_megdr"], "earth": ["etopo2022"]},
    "geology": {"moon": ["lp_grs"], "mars": ["ody_grs"], "earth": ["glim"]},
    "ice": {"moon": ["lp_ns", "diviner_prp", "pgda_illum"], "mars": ["ody_grs", "mcd"], "earth": ["gibs_modis", "power_merra2"]},
    "environment": {"moon": [], "mars": [], "earth": ["gibs_modis", "power_merra2"]},
    "thermal": {"moon": [], "mars": ["mcd"], "earth": ["power_merra2"]},
    "dust": {"moon": [], "mars": ["mcd"], "earth": ["power_ceres"]},
}

# Purpose templates. Wording is deliberately generic to the *class* of test; nothing here describes a site.
TEMPLATES = {
    "general": {
        "goal": "Use {earth} to rehearse field procedures planned for {planet}, on ground that matches it in the ways RADIUM can measure.",
        "question": "Do procedures planned for {planet} work as expected on terrain that matches it in {strong}?",
        "instrument": "Field operations kit appropriate to the planned mission: navigation, imaging and sampling tools.",
        "controlled": ["Procedure and timeline used", "Team or rover configuration", "Time of day and season of the test"],
        "measured": ["Task completion time and success", "Traverse distance and stops", "Issues logged per procedure step"],
        "data": ["Georeferenced photographs of each work site", "GNSS track", "Procedure log with timestamps"],
        "comparison": "Compare task outcomes against the planned {planet} timeline, and note where differences trace to a known mismatch below.",
        "informative": "A procedure that fails or slows here on a matching dimension is a credible risk for {planet}; one that fails only because of a mismatch is not.",
        "lab": "Vacuum, gravity and radiation cannot be reproduced in the field; test those effects separately in chambers or with offloading rigs.",
    },
    "mobility": {
        "goal": "Test rover or vehicle mobility on {earth}, whose slopes and roughness are compared with {planet}.",
        "question": "Does the vehicle's traction, slope limit and navigation performance on this terrain predict behaviour on {planet}?",
        "instrument": "Rover or mobility test article with wheel odometry, inertial sensors and stereo or depth cameras.",
        "controlled": ["Vehicle mass and wheel configuration", "Commanded speed and path", "Slope of each test segment"],
        "measured": ["Wheel slip (odometry against ground truth)", "Achieved slope and stall events", "Navigation error and replans"],
        "data": ["Terrain photographs and local slope measurements per segment", "Vehicle telemetry", "Ground-truth positions"],
        "comparison": "Plot slip and stall rate against measured slope, then compare those slopes with the {planet} target's typical and steep-ground slope values.",
        "informative": "Slip-versus-slope curves measured here can bound expected performance on {planet} slopes within the compared range; behaviour outside that range is untested.",
        "lab": "Lower gravity changes wheel loading and slip; scale results with reduced-gravity models or offloading tests before applying them.",
    },
    "ice": {
        "goal": "Test ground-ice detection or drilling methods at {earth}, chosen for its frozen-ground conditions relative to {planet}.",
        "question": "Can the method detect and sample frozen ground under conditions like those inferred for {planet}?",
        "instrument": "Ground-ice detection or drilling equipment class (for example ground-penetrating radar, neutron or thermal probes, shallow drill).",
        "controlled": ["Drill or probe configuration", "Depth targets", "Measurement interval"],
        "measured": ["Depth to ice-cemented ground", "Penetration rate and power draw", "Ice content of recovered samples"],
        "data": ["Depth profiles", "Sample photographs and logs", "Ground temperature at depth"],
        "comparison": "Compare detection depth and ice content with the {planet} target's ice evidence, remembering that orbital ice evidence there is indirect.",
        "informative": "Successful detection in matching frozen ground supports the method; it does not confirm that recoverable ice exists at the {planet} site.",
        "lab": "Planetary ice at very low pressure and temperature sublimates differently; validate sample handling in a thermal-vacuum chamber.",
    },
    "geology": {
        "goal": "Use {earth} to practise geological sampling and instrument calibration on rock types compared with {planet}.",
        "question": "Do sampling strategy and instrument readings on these rocks match what is expected at {planet}?",
        "instrument": "Field geology kit and portable instruments (for example imaging, spectroscopy or elemental analysis).",
        "controlled": ["Sampling grid and spacing", "Instrument settings", "Sample preparation"],
        "measured": ["Rock type and composition per sample", "Instrument agreement with laboratory analysis", "Time per sample"],
        "data": ["Sample locations and photographs", "Instrument spectra or readings", "Laboratory reference analyses"],
        "comparison": "Compare field and laboratory results, then relate rock types to the {planet} target's compositional data at its coarse orbital resolution.",
        "informative": "Instrument agreement on matching rock types supports calibration; compositional differences listed below limit how far results transfer.",
        "lab": "Space weathering and vacuum alter surfaces; laboratory analogues or returned-sample references are needed for those effects.",
    },
    "dust": {
        "goal": "Study dust exposure on equipment at {earth}, compared with the airborne dust conditions modelled at {planet}.",
        "question": "How quickly does dust degrade the test hardware under conditions comparable to {planet}?",
        "instrument": "Exposed test panels or optics with dust collection and power or transmission sensors.",
        "controlled": ["Panel orientation and tilt", "Exposure duration", "Cleaning interval"],
        "measured": ["Power or light transmission loss over time", "Dust mass per area", "Particle size distribution"],
        "data": ["Time series of sensor readings", "Collected dust samples", "Local wind and aerosol measurements"],
        "comparison": "Compare degradation rates with the dust opacity range modelled for {planet}.",
        "informative": "Degradation rates measured at similar dust loading are a useful bound; Martian dust grain size and electrostatics differ.",
        "lab": "Electrostatic charging and low-pressure settling need chamber tests with simulant dust.",
    },
    "astrobiology": {
        "goal": "Test life-detection or habitability methods at {earth}, chosen for environmental limits compared with {planet}.",
        "question": "Can the method detect biosignatures near the limits of habitability represented here?",
        "instrument": "Life-detection or biosignature instrument class with contamination controls.",
        "controlled": ["Sampling protocol and blanks", "Sample depth", "Contamination controls"],
        "measured": ["Detection result per sample", "Detection limits", "Environmental parameters at each sample"],
        "data": ["Sample metadata and photographs", "Instrument outputs", "Laboratory confirmation"],
        "comparison": "Compare detections with independent laboratory analyses, and relate environmental parameters to the {planet} target.",
        "informative": "Detection at Earth's dry or cold limits tests sensitivity; it says nothing about whether life exists on {planet}.",
        "lab": "Radiation, oxidants and pressure at {planet} need laboratory simulation.",
    },
}

PREPARATION = [
    "Site access and permits: not assessed. Many analog sites are protected areas, private land or research reserves and need permission.",
    "Conservation rules: not assessed. Check protected-area and heritage restrictions before any sampling or vehicle use.",
    "Transport and logistics: not assessed. Distances in RADIUM are straight-line and say nothing about roads or travel time.",
    "Field safety: plan for local hazards such as heat, cold, altitude, isolation and terrain; RADIUM does not assess them.",
    "Some planetary conditions (vacuum, low gravity, radiation, extreme cold) can only be simulated in laboratory facilities.",
]


def _sources(ids):
    out = []
    for sid in ids:
        s = BY_ID.get(sid)
        if s:
            out.append({"id": sid, "name": s["name"], "url": s["url"], "agency": s["agency"], "resolution": s.get("spatial_resolution"),
                        "evidence": s.get("evidence")})
    return out


def build(*, body: str, purpose: str, purpose_label: str, planet_label: str, planet_coords: str, planet_cell_km,
          earth_label: str, earth_coords: str, earth_cell_km, match: dict, documented: dict | None, setting: str,
          share: dict) -> dict:
    t = TEMPLATES.get(purpose, TEMPLATES["general"])
    world = "the Moon" if body == "moon" else "Mars"
    planet = f"{planet_label} on {world}"
    dims = [d for d in match["dimensions"] if d["weight"] > 0]
    scored = [d for d in dims if d["score"] is not None]
    strong = sorted([d for d in scored if d["score"] >= 0.65], key=lambda d: -(d["weight"] * d["score"]))[:3]
    weak = sorted([d for d in scored if d["score"] < 0.5], key=lambda d: d["score"])
    missing = [d for d in dims if d["score"] is None]
    strong_txt = ", ".join(d["label"].lower() for d in strong) or "none of the measured dimensions"
    fmt = lambda s: s.format(planet=planet, earth=earth_label, strong=strong_txt)  # noqa: E731

    def dim_entry(d):
        return {
            "id": d["id"], "label": d["label"], "grade": d["grade"], "score": d["score"], "weight": d["weight"],
            "pairs": d.get("pairs", []), "note": d.get("note"),
            "sources": _sources(DIM_SOURCES.get(d["id"], {}).get(body, []) + DIM_SOURCES.get(d["id"], {}).get("earth", [])),
        }

    usable = match["score"] is not None and bool(strong)
    return {
        "kind": "proposal",
        "disclaimer": ("An experiment proposal generated from RADIUM's comparison. It is not a result, not a site "
                       "assessment and not an authorisation; grades are RADIUM's own scale, not NASA ratings."),
        "title": f"{purpose_label}: {earth_label} as a test ground for {planet}",
        "goal": fmt(t["goal"]),
        "question": fmt(t["question"]),
        "usable": usable,
        "usable_note": None if usable else (
            "No compared dimension matches well enough (grade B or better) to justify this test for this purpose. "
            "Try a different purpose or Earth location."),
        "target": {"body": body, "label": planet_label, "coords": planet_coords, "cell_km": planet_cell_km},
        "earth": {"label": earth_label, "coords": earth_coords, "cell_km": earth_cell_km, "documented": documented},
        "purpose": {"id": purpose, "label": purpose_label},
        "match": {"score": match["score"], "grade": match["grade"], "meaning": match.get("meaning"), "coverage": match["coverage"]},
        "why_useful": [dim_entry(d) for d in strong],
        "mismatches": [dim_entry(d) for d in weak],
        "not_assessed": [{"id": d["id"], "label": d["label"], "text": NOT_ASSESSED} for d in missing],
        "cannot_reproduce": match.get("breaks_down", []),
        "protocol": {
            "setting": setting,
            "instrument_class": t["instrument"],
            "controlled": t["controlled"],
            "measured": t["measured"],
            "data_to_collect": t["data"],
            "comparison": fmt(t["comparison"]),
            "informative_outcome": fmt(t["informative"]),
            "laboratory_needs": fmt(t["lab"]),
        },
        "preparation": PREPARATION,
        "unknowns": {"site_access": NOT_ASSESSED, "logistics": NOT_ASSESSED, "equipment": NOT_ASSESSED, "budget": NOT_ASSESSED},
        "meta": {
            "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "radium_version": RADIUM_VERSION,
            "build": (os.environ.get("VERCEL_GIT_COMMIT_SHA") or "local")[:7],
            "settings": share,
        },
    }
