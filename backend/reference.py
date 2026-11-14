"""Reference locations shown as pins.

Three kinds, kept strictly apart:

* Landing sites — coordinates as published by the missions / NASA NSSDCA,
  rounded to 0.01°. Facts about where hardware is, not RADIUM assessments.
* Named features — positions come from the IAU gazetteer at run time (see
  `feature` entries); only the reason for listing them is written here.
* Documented Earth analog sites — places used as planetary analogs in the
  published literature or by named agency programmes. Coordinates locate the
  study area to roughly 0.1°. This list is used ONLY for labelling and for
  showing how well-known sites score; it never influences a similarity grade.

No grade or score is stored here. Every grade is computed from data.
"""
from __future__ import annotations

NSSDCA = "https://nssdc.gsfc.nasa.gov/planetary/"

MOON_LANDINGS = [
    ("Apollo 11", 0.67, 23.47, 1969, "First crewed landing, Mare Tranquillitatis."),
    ("Apollo 12", -3.01, -23.42, 1969, "Oceanus Procellarum, beside Surveyor 3."),
    ("Apollo 14", -3.65, -17.47, 1971, "Fra Mauro formation."),
    ("Apollo 15", 26.13, 3.63, 1971, "Hadley Rille and the Apennine front."),
    ("Apollo 16", -8.97, 15.50, 1972, "Descartes highlands, the only Apollo highland site."),
    ("Apollo 17", 20.19, 30.77, 1972, "Taurus–Littrow valley."),
    ("Chang'e 3", 44.12, -19.51, 2013, "Northern Mare Imbrium."),
    ("Chang'e 4", -45.44, 177.60, 2019, "Von Kármán crater, first far-side landing."),
    ("Chang'e 5", 43.06, -51.92, 2020, "Northern Oceanus Procellarum, sample return."),
    ("Chang'e 6", -41.64, -153.99, 2024, "Apollo basin, first far-side sample return."),
    ("Chandrayaan-3", -69.37, 32.32, 2023, "Highest-latitude soft landing to date."),
    ("SLIM", -13.32, 25.25, 2024, "Precision landing near Shioli crater."),
    ("IM-1 Odysseus", -80.13, 1.44, 2024, "Near Malapert A, first commercial landing."),
]

# (IAU feature name, why it is listed)
MOON_FEATURES = [
    ("Shackleton", "Crater at the south pole. Its rim holds some of the most continuously lit ground on the Moon beside a permanently shadowed floor."),
    ("de Gerlache", "South-polar crater whose rim lends its name to an Artemis III candidate region."),
    ("Haworth", "Permanently shadowed crater; namesake of an Artemis III candidate region."),
    ("Nobile", "Namesake of two Artemis III candidate regions on its rim; planned VIPER rover area."),
    ("Malapert", "The Malapert massif nearby keeps Earth in view and is an Artemis III candidate region."),
    ("Mons Mouton", "Flat-topped mountain with strong Earth visibility; Artemis III candidate region."),
    ("Cabeus", "Site of the 2009 LCROSS impact, which detected water in the ejecta plume."),
    ("Slater", "The plain beside it is an Artemis III candidate region."),
    ("Peary", "North-polar crater whose rim was among the first proposed 'peaks of light'."),
    ("Whipple", "Small north-polar crater; the best-lit ground near the north pole lies on its rim."),
    ("Tycho", "Young rayed crater in the southern highlands."),
    ("Copernicus", "Prominent young crater in Oceanus Procellarum."),
    ("Aristarchus", "Bright crater on a volcanic plateau rich in pyroclastic deposits."),
    ("Mare Imbrium", "Large basalt-filled impact basin."),
    ("Mare Tranquillitatis", "Titanium-rich mare basalt; Apollo 11 landing region."),
    ("Schrödinger", "Far-side basin with a pyroclastic vent; target of planned landers."),
    ("Mare Orientale", "Youngest large multi-ring basin."),
    ("Aitken", "Crater on the northern edge of the South Pole–Aitken basin."),
]

MARS_LANDINGS = [
    ("Viking 1", 22.27, -47.95, 1976, "Chryse Planitia."),
    ("Viking 2", 47.64, 134.29, 1976, "Utopia Planitia."),
    ("Mars Pathfinder", 19.13, -33.22, 1997, "Ares Vallis outflow plain."),
    ("Spirit", -14.57, 175.47, 2004, "Gusev crater."),
    ("Opportunity", -1.95, -5.53, 2004, "Meridiani Planum. Highest landing to date."),
    ("Phoenix", 68.22, -125.75, 2008, "Northern plains; dug into ground ice."),
    ("Curiosity", -4.59, 137.44, 2012, "Gale crater."),
    ("InSight", 4.50, 135.62, 2018, "Elysium Planitia."),
    ("Perseverance", 18.44, 77.45, 2021, "Jezero crater delta."),
    ("Zhurong", 25.07, 109.93, 2021, "Southern Utopia Planitia."),
]

MARS_FEATURES = [
    ("Jezero", "Crater with a preserved river delta; Perseverance landing site."),
    ("Gale", "Crater with a layered central mound; Curiosity landing site."),
    ("Oxia Planum", "Clay-bearing plain selected for ESA's Rosalind Franklin rover."),
    ("Mawrth Vallis", "Channel cutting some of the largest clay exposures on Mars."),
    ("Meridiani Planum", "Hematite-bearing plain explored by Opportunity."),
    ("Arcadia Planitia", "Northern plain where radar and fresh craters reveal shallow ice."),
    ("Deuteronilus Mensae", "Mid-latitude region of debris-covered glaciers."),
    ("Utopia Planitia", "Vast basin with buried ice detected by radar."),
    ("Elysium Planitia", "Young volcanic plains."),
    ("Valles Marineris", "Canyon system 4,000 km long."),
    ("Olympus Mons", "Largest volcano in the solar system."),
    ("Hellas Planitia", "Deepest basin on Mars and its highest surface pressure."),
    ("Medusae Fossae", "Easily eroded deposits rich in chlorine and possibly ice."),
    ("Nili Fossae", "Troughs exposing olivine, carbonate and clay minerals."),
    ("Syrtis Major Planum", "Dark basaltic shield plain."),
    ("Korolev", "Crater filled with a dome of water ice 1.8 km thick."),
]

# name, lat, lon, country/region, bodies it is used for, theme, why, reference
EARTH_ANALOGS = [
    ("Atacama Desert, Yungay", -24.08, -69.92, "Chile", ["mars"], "Hyperarid soil",
     "Hyperarid core where soils approach the dry limit of microbial life.",
     "Navarro-González et al. (2003), Science 302, 1018–1021"),
    ("McMurdo Dry Valleys", -77.60, 161.50, "Antarctica", ["mars"], "Cold desert, ground ice",
     "Cold, hyperarid valleys with dry permafrost over ice-cemented ground.",
     "Marchant & Head (2007), Icarus 192, 187–222"),
    ("University Valley, Dry Valleys", -77.87, 160.75, "Antarctica", ["mars"], "Subsurface ice",
     "High-elevation valley used as an analog for shallow ground ice on Mars.",
     "Heldmann et al. (2013), Planet. Space Sci. 85, 53–58"),
    ("Don Juan Pond", -77.56, 161.19, "Antarctica", ["mars"], "Brines",
     "Calcium-chloride brine pond studied as an analog for Martian brine flows.",
     "Dickson et al. (2013), Scientific Reports 3, 1166"),
    ("Haughton impact structure, Devon Island", 75.37, -89.68, "Canada", ["moon", "mars"], "Impact crater in polar desert",
     "23 km impact structure in a polar desert; base of the Haughton-Mars Project.",
     "Lee & Osinski (2005), Meteorit. Planet. Sci. 40, 1755–1758"),
    ("Axel Heiberg Island cold springs", 79.07, -90.21, "Canada", ["mars"], "Saline springs in permafrost",
     "Perennial saline springs flowing through thick permafrost.",
     "Pollard et al. (2009), Planet. Space Sci. 57, 646–659"),
    ("Svalbard, Bockfjorden", 79.40, 13.40, "Norway", ["mars"], "Volcanics and carbonates in the Arctic",
     "Field site of the Arctic Mars Analog Svalbard Expeditions.",
     "AMASE expeditions, 2003–2011 (Steele et al.)"),
    ("Mauna Loa, HI-SEAS", 19.60, -155.49, "USA (Hawaiʻi)", ["moon", "mars"], "Basaltic volcano, crew isolation",
     "Barren basaltic flows used for long-duration crew simulations.",
     "HI-SEAS analog missions, University of Hawaiʻi / NASA"),
    ("Mauna Kea", 19.82, -155.47, "USA (Hawaiʻi)", ["moon", "mars"], "Basaltic tephra, ISRU tests",
     "Volcanic tephra site of NASA in-situ resource utilisation field tests.",
     "Hughes et al. (2019), Astrobiology 19, 260–283"),
    ("Craters of the Moon", 43.42, -113.52, "USA (Idaho)", ["moon", "mars"], "Basaltic lava field",
     "Young basaltic flows, cones and lava tubes studied by NASA's FINESSE and BASALT projects.",
     "Hughes et al. (2019), Astrobiology 19, 260–283"),
    ("Black Point Lava Flow", 35.68, -111.47, "USA (Arizona)", ["moon", "mars"], "Basalt flow, operations",
     "Basalt flow in the San Francisco Volcanic Field used for NASA Desert RATS rover field tests.",
     "NASA Desert Research and Technology Studies, 2010–2011"),
    ("Meteor Crater", 35.03, -111.02, "USA (Arizona)", ["moon"], "Simple impact crater",
     "Best-preserved simple impact crater on Earth; Apollo astronaut training site.",
     "Kring (2017), Guidebook to the Geology of Barringer Meteorite Crater, Arizona, 2nd ed., Lunar and Planetary Institute"),
    ("Kilbourne Hole", 31.97, -106.96, "USA (New Mexico)", ["moon"], "Volcanic maar",
     "Maar crater used for Apollo training and later NASA field-science exercises.",
     "NASA RIS4E / SSERVI field campaigns"),
    ("Mars Desert Research Station", 38.41, -110.79, "USA (Utah)", ["mars"], "Operations in layered sediments",
     "Crewed analog station among eroded Jurassic and Cretaceous sediments.",
     "The Mars Society, operating since 2001"),
    ("Mojave Desert, Amboy Crater", 34.54, -115.79, "USA (California)", ["mars"], "Basalt and sand",
     "Basaltic cinder cone and flow with wind streaks, long used in Mars aeolian studies.",
     "Greeley & Iversen (1985), Wind as a Geological Process, Cambridge University Press"),
    ("Mistastin Lake impact structure", 55.88, -63.30, "Canada", ["moon"], "Impact into anorthosite",
     "Impact crater formed in anorthosite, the rock of the lunar highlands.",
     "Mader & Osinski (2018), Meteoritics & Planetary Science 53"),
    ("Sudbury impact structure", 46.60, -81.18, "Canada", ["moon"], "Large impact basin",
     "Deeply eroded impact basin with breccias; Apollo 16 and 17 crews trained here.",
     "Apollo geology field training, 1971–1972"),
    ("Askja and Holuhraun", 65.03, -16.75, "Iceland", ["moon", "mars"], "Fresh basalt, sand plains",
     "Barren basaltic caldera and lava field; Apollo training site and basaltic-sand analog.",
     "Mangold et al. (2011), Earth Planet. Sci. Lett. 310, 233–243"),
    ("Lanzarote, Timanfaya", 29.00, -13.75, "Spain", ["moon", "mars"], "Volcanic field",
     "Historic basaltic eruption field used for ESA PANGAEA astronaut geology training.",
     "ESA PANGAEA programme"),
    ("Mount Etna", 37.75, 14.99, "Italy", ["moon"], "Basaltic volcano",
     "Loose basaltic slopes used for the ROBEX and ARCHES lunar robotics campaigns.",
     "DLR ROBEX (2017) and ARCHES (2022) analog missions"),
    ("Río Tinto", 37.72, -6.55, "Spain", ["mars"], "Acidic iron-sulfate system",
     "Acid river precipitating iron oxides and sulfates like those at Meridiani Planum.",
     "Fernández-Remolar et al. (2005), Earth Planet. Sci. Lett. 240, 149–167"),
    ("Nördlinger Ries", 48.88, 10.57, "Germany", ["moon"], "Complex impact crater",
     "24 km impact crater with suevite breccia; Apollo 14 and 17 crews trained here.",
     "Apollo geology field training, 1970"),
    ("Dallol, Danakil Depression", 14.24, 40.30, "Ethiopia", ["mars"], "Hydrothermal brines",
     "Hot, acidic, salt-saturated hydrothermal field below sea level.",
     "Cavalazzi et al. (2019), Astrobiology 19, 553–578"),
    ("Ibn Battuta Centre sites, Erfoud", 31.37, -4.05, "Morocco", ["mars"], "Desert test sites",
     "Desert sites used to rehearse ExoMars rover and instrument operations.",
     "Ibn Battuta Centre, Marrakech (Europlanet)"),
    ("Chott el Jerid", 33.70, 8.40, "Tunisia", ["mars"], "Salt flat",
     "Seasonal salt lake studied as an analog for Martian evaporite basins.",
     "Barbieri & Stivaletta (2011), Geological Journal 46"),
    ("Dhofar, AMADEE-18", 18.90, 55.60, "Oman", ["mars"], "Operations in rocky desert",
     "Site of the AMADEE-18 crewed Mars simulation.",
     "Groemer et al. (2020), Astrobiology 20, 1276–1286"),
    ("Makhtesh Ramon", 30.61, 34.80, "Israel", ["mars"], "Erosional crater, operations",
     "Arid erosional crater hosting the AMADEE-20 crewed simulation.",
     "Austrian Space Forum AMADEE-20 (2021)"),
    ("Makgadikgadi Pans", -20.70, 25.50, "Botswana", ["mars"], "Salt pans",
     "Large salt pans, remnant of a dried lake, studied as a playa analog.",
     "Franchi et al. (2020), Planetary and Space Science"),
    ("Lonar Crater", 19.98, 76.51, "India", ["moon", "mars"], "Impact crater in basalt",
     "Rare impact crater formed in basalt, the target rock of lunar maria and much of Mars.",
     "Maloof et al. (2010), Geol. Soc. Am. Bull. 122, 109–126"),
    ("Qaidam Basin, Dalangtan", 38.50, 91.40, "China", ["mars"], "Hyperarid salt basin, yardangs",
     "High, cold, hyperarid basin with evaporites and wind-carved yardangs.",
     "Xiao et al. (2017), Earth-Science Reviews 164, 84–101"),
    ("Pilbara, North Pole Dome", -21.10, 119.40, "Australia", ["mars"], "Ancient biosignatures",
     "3.5-billion-year-old stromatolites; field training for Mars rover science teams.",
     "Mars 2020 and ExoMars science-team field workshop, 2019"),
    ("Arkaroola", -30.30, 139.30, "Australia", ["mars"], "Arid ranges, hydrothermal deposits",
     "Mars Society Australia analog region in the northern Flinders Ranges.",
     "Mars Society Australia field expeditions"),
    ("Licancabur, High Lakes", -22.83, -67.88, "Chile / Bolivia", ["mars"], "High altitude, low pressure, UV",
     "Summit lake near 5,900 m: thin air, intense ultraviolet and cold.",
     "Cabrol et al. (2009), J. Geophys. Res. 114, G00D06"),
    ("Salar de Pajonales", -25.15, -68.82, "Chile", ["mars"], "Gypsum salar, biosignature mapping",
     "High Andean salar used to test biosignature search strategies from orbit to ground.",
     "Warren-Rhodes et al. (2023), Nature Astronomy 7, 406–422"),
    ("Pavilion Lake", 50.87, -121.74, "Canada", ["moon", "mars"], "Operations, microbialites",
     "Lake with microbialites used to rehearse science-driven exploration operations.",
     "Pavilion Lake Research Project (NASA / CSA)"),
    ("Lava Beds National Monument", 41.71, -121.51, "USA (California)", ["moon", "mars"], "Lava tubes",
     "Dense field of basaltic lava tubes explored by NASA's BRAILLE project.",
     "NASA BRAILLE project, 2018–2021"),
]


def moon_pins(names):
    out = []
    for name, lat, lon, year, note in MOON_LANDINGS:
        out.append({"id": f"moon-landing-{name}", "name": name, "kind": "landing", "lat": lat, "lon": lon, "year": year,
                    "note": note, "source": "NASA NSSDCA / mission team", "link": NSSDCA + "lunar/"})
    for name, why in MOON_FEATURES:
        f = names.find(name)
        if f:
            out.append({"id": f"moon-feature-{name}", "name": name, "kind": "feature", "lat": f["lat"], "lon": f["lon"],
                        "note": why, "source": "IAU Gazetteer of Planetary Nomenclature", "link": f["link"],
                        "feature_type": f["type"], "diam_km": f["diam_km"]})
    return out


def mars_pins(names):
    out = []
    for name, lat, lon, year, note in MARS_LANDINGS:
        out.append({"id": f"mars-landing-{name}", "name": name, "kind": "landing", "lat": lat, "lon": lon, "year": year,
                    "note": note, "source": "NASA NSSDCA / mission team", "link": NSSDCA + "planets/marspage.html"})
    for name, why in MARS_FEATURES:
        f = names.find(name)
        if f:
            out.append({"id": f"mars-feature-{name}", "name": name, "kind": "feature", "lat": f["lat"], "lon": f["lon"],
                        "note": why, "source": "IAU Gazetteer of Planetary Nomenclature", "link": f["link"],
                        "feature_type": f["type"], "diam_km": f["diam_km"]})
    return out


def earth_pins():
    return [{"id": f"earth-analog-{i}", "name": n, "kind": "analog", "lat": la, "lon": lo, "country": c, "bodies": b,
             "theme": t, "note": w, "source": ref}
            for i, (n, la, lo, c, b, t, w, ref) in enumerate(EARTH_ANALOGS)]
