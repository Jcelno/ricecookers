"""Refresh the context-only, field-trimmed Smithsonian GVP Holocene snapshot.

Uses the official WFS, preserves its point coordinates, and records provenance.
Run from any directory: python scripts/update_volcanoes.py
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

URL = ("https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0"
       "&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application/json")


def main():
    with urlopen(URL, timeout=30) as response:
        raw = response.read()
    source = json.loads(raw)
    rows = []
    for feature in source["features"]:
        p = feature["properties"]
        if p["Geologic_Epoch"] != "Holocene":
            continue
        rows.append({"id": str(p["Volcano_Number"]), "name": p["Volcano_Name"],
                     "country": p["Country"], "lat": p["Latitude"], "lon": p["Longitude"],
                     "last_eruption_year": p["Last_Eruption_Year"],
                     "url": f"https://volcano.si.edu/volcano.cfm?vn={p['Volcano_Number']}"})
    rows.sort(key=lambda row: row["id"])
    if not rows or len(rows) != source["numberMatched"]:
        raise ValueError("WFS did not return the complete Holocene list; keep the existing snapshot")
    result = {"source": "Smithsonian Global Volcanism Program, Volcanoes of the World",
              "url": "https://volcano.si.edu/volcanolist_holocene.cfm", "download_url": URL,
              "citation": "Global Volcanism Program, 2026. Volcanoes of the World (v. 5.4.0; 7 Aug 2026). Venzke, E. (ed.). Smithsonian Institution.",
              "doi": "https://doi.org/10.5479/si.GVP.VOTW5-2026.5.4",
              "retrieved_at": datetime.now(timezone.utc).isoformat(),
              "source_sha256": hashlib.sha256(raw).hexdigest(),
              "source_timestamp": source.get("timeStamp"),
              "license": "Smithsonian Terms of Use; cite GVP. Database compilation by US government employees.",
              "terms_url": "https://volcano.si.edu/gvp_termsofuse.cfm",
              "resolution": "Catalogued volcanic-center points; coordinate precision varies by record. Not a hazard map.",
              "evidence": "observed", "count": len(rows), "volcanoes": rows}
    path = Path(__file__).resolve().parents[1] / "public" / "data" / "gvp-volcanoes.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Saved {len(rows)} source records to {path}")


if __name__ == "__main__":
    main()
