"""Resolve the external map-tile layers RADIUM offers on the Moon and Mars
globes (NASA Solar System Treks WMTS, equirectangular tiling) and on the Earth
map (NASA GIBS, EOX Sentinel-2 cloudless).

For every Trek layer the WMTS capabilities document is fetched so the tile URL
template, image format, zoom range and geographic bounds are taken from the
service itself rather than typed by hand.

Run:  python -m pipeline.build_layers
"""
from __future__ import annotations

import re

import requests

from .common import OUT, save_json

UA = {"User-Agent": "Mozilla/5.0 (research-client)"}

# id → (group, title shown in RADIUM, what it shows, legend note, evidence type)
TREK = {
    "moon": {
        "LRO_WAC_Mosaic_Global_303ppd_v02": ("imagery", "LROC WAC global mosaic", "Lunar Reconnaissance Orbiter Wide Angle Camera morphology mosaic, 100 m/px. The default satellite view.", None, "observed"),
        "Kaguya_TCortho_Mosaic_Global_4096ppd": ("imagery", "Kaguya Terrain Camera ortho mosaic", "JAXA SELENE/Kaguya Terrain Camera orthoimage mosaic, about 7 m/px. Sharpest global view when zoomed in.", None, "observed"),
        "LRO_LOLA_ClrShade_Global_128ppd_v04": ("elevation", "LOLA elevation, colour hillshade", "Lunar Orbiter Laser Altimeter digital elevation model rendered as colour-coded shaded relief, 128 px/deg.", "Colour = elevation relative to the 1737.4 km sphere (about −9 km blue to +10.8 km white).", "observed"),
        "LRO_LOLA_ClrSlope_Global_16ppd": ("slope", "LOLA slope (16 px/deg)", "LOLA bidirectional surface slope product, colourised.", "Colour = slope in degrees at the 1.9 km pixel scale.", "observed"),
        "LRO_LOLA_ClrRoughness_Global_16ppd": ("roughness", "LOLA roughness (16 px/deg)", "LOLA surface roughness product, colourised.", "Colour = RMS roughness within the laser footprint scale.", "observed"),
        "diviner_Clrtbol_max": ("temperature", "Diviner maximum bolometric temperature", "LRO Diviner maximum bolometric brightness temperature, 0.5°.", "Colour = kelvin; equatorial maxima near 390 K.", "observed"),
        "diviner_Clrtbol_min": ("temperature", "Diviner minimum bolometric temperature", "LRO Diviner minimum bolometric brightness temperature, 0.5°.", "Colour = kelvin; polar cold traps below 50 K.", "observed"),
        "LP_NS_H_Clr_Global_2ppd": ("water", "Lunar Prospector hydrogen abundance", "Neutron-spectrometer hydrogen abundance, 0.5° bins (footprint about 45 km).", "Colour = hydrogen in ppm by weight.", "inferred"),
        "Clem_UVVIS_FeO_Clr_Global_152ppd": ("geology", "Clementine FeO abundance", "Iron oxide weight percent derived from Clementine UVVIS multispectral imaging.", "Colour = FeO wt%; maria are iron-rich.", "inferred"),
        "Clem_UVVIS_TiO2_Clr_Global_152ppd": ("geology", "Clementine TiO₂ abundance", "Titanium dioxide weight percent derived from Clementine UVVIS.", "Colour = TiO₂ wt%.", "inferred"),
        "Unified_Global_Geologic_Map_of_the_Moon_Geologic_Units": ("geology", "USGS unified geologic map — units", "Unified Geologic Map of the Moon, 1:5,000,000 (USGS, 2020).", "Colours are mapped geologic units; see the USGS map legend.", "interpreted"),
    },
    "mars": {
        "Mars_Viking_MDIM21_ClrMosaic_global_232m": ("imagery", "Viking colour mosaic (MDIM 2.1)", "Viking Orbiter colourised global image mosaic, 232 m/px. The default satellite view.", None, "observed"),
        "Mars_MGS_MOLA_ClrShade_merge_global_463m": ("elevation", "MOLA elevation, colour hillshade", "Mars Orbiter Laser Altimeter elevation as colour-coded shaded relief, 463 m/px.", "Colour = elevation above the areoid (about −8 km blue to +21 km white).", "observed"),
        "TES_Thermal_Inertia": ("geology", "TES thermal inertia", "Mars Global Surveyor Thermal Emission Spectrometer thermal inertia. Low values indicate loose dust, high values rock or duricrust.", "Colour = thermal inertia (J m⁻² K⁻¹ s⁻½).", "inferred"),
        "Mars_MGS_TES_Albedo_mosaic_global_7410m": ("geology", "TES surface albedo", "MGS TES bolometric albedo, 7.4 km/px. Bright regions are dust-mantled.", "Grey level = albedo.", "observed"),
        "TES_Dust": ("dust", "TES dust cover", "MGS TES dust cover index: spectral measure of surface dust mantling.", "Colour = dust cover index.", "inferred"),
        "SIM3292_Global_Geology": ("geology", "USGS global geologic map (SIM 3292)", "Geologic Map of Mars, 1:20,000,000 (Tanaka et al., 2014).", "Colours are mapped geologic units; see the USGS map legend.", "interpreted"),
    },
}


def trek_layer(body: str, layer_id: str):
    cap_url = f"https://trek.nasa.gov/tiles/{body.capitalize()}/EQ/{layer_id}/1.0.0/WMTSCapabilities.xml"
    r = requests.get(cap_url, headers=UA, timeout=60)
    r.raise_for_status()
    t = r.text
    tmpl = re.search(r'<ResourceURL[^>]*template="([^"]+)"', t)
    fmt = re.search(r"<Format>([^<]+)</Format>", t)
    levels = [int(x) for x in re.findall(r"<TileMatrix>\s*<ows:Identifier>(\d+)</ows:Identifier>", t)]
    lower = re.search(r"<ows:LowerCorner>([-\d.eE]+) ([-\d.eE]+)</ows:LowerCorner>", t)
    upper = re.search(r"<ows:UpperCorner>([-\d.eE]+) ([-\d.eE]+)</ows:UpperCorner>", t)
    style = re.search(r"<Style[^>]*>\s*<ows:Identifier>([^<]+)</ows:Identifier>", t)
    tms = re.search(r"<TileMatrixSet>([^<]+)</TileMatrixSet>", t)
    ext = "png" if fmt and "png" in fmt.group(1) else "jpg"
    if tmpl:
        url = (tmpl.group(1).replace("{Style}", style.group(1) if style else "default")
               .replace("{TileMatrixSet}", tms.group(1) if tms else "default028mm")
               .replace("{TileMatrix}", "{z}").replace("{TileRow}", "{y}").replace("{TileCol}", "{x}"))
    else:
        url = f"https://trek.nasa.gov/tiles/{body.capitalize()}/EQ/{layer_id}/1.0.0/default/default028mm/{{z}}/{{y}}/{{x}}.{ext}"
    url = url.replace("http://", "https://")
    # confirm that a level-0 tile is really served with CORS enabled
    probe = requests.get(url.format(z=0, y=0, x=0), headers={**UA, "Origin": "http://localhost:3000"}, timeout=60)
    return {
        "url": url, "format": ext, "max_level": max(levels) if levels else 0,
        "bbox": [float(lower.group(1)), float(lower.group(2)), float(upper.group(1)), float(upper.group(2))] if lower and upper else [-180, -90, 180, 90],
        "capabilities": cap_url, "probe_status": probe.status_code,
        "cors": probe.headers.get("access-control-allow-origin"),
    }


def main():
    out = {"moon": [], "mars": []}
    for body, layers in TREK.items():
        for lid, (group, title, desc, legend, evidence) in layers.items():
            try:
                info = trek_layer(body, lid)
            except Exception as e:  # noqa: BLE001
                print(f"[FAIL] {body}/{lid}: {e}")
                continue
            ok = info["probe_status"] == 200 and info["cors"] in ("*", "http://localhost:3000")
            print(f"[{'ok' if ok else 'WARN'}] {body}/{lid}: levels 0–{info['max_level']} {info['format']} bbox={info['bbox']} cors={info['cors']} http={info['probe_status']}")
            if not ok:
                continue
            out[body].append({
                "id": lid, "kind": "tiles", "group": group, "title": title, "description": desc,
                "legend_note": legend, "evidence": evidence, "provider": "NASA Solar System Treks (JPL)",
                "attribution": "NASA/JPL Solar System Treks", "tiling": "geographic-2x1", **info,
            })
    save_json(OUT / "layers_trek.json", out)


if __name__ == "__main__":
    main()
