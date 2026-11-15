# RADIUM site catalogue audit — 14 November 2026

The current catalogue contains **117 sites**: all **93 existing records preserved**, plus **24 additions**. The revised user instruction permits up to **100 additional sites** (193 total); the earlier 50-total limit does not apply. No original record was deleted or merged. New records were added only after checking identity, a published location, and the specific scientific context. This is a bounded expansion, not an exhaustive inventory of planetary field research.

| Body | Original | Added | Total | Location/evidence checked | Review needed |
|---|---:|---:|---:|---:|---:|
| Moon | 31 | 12 | 43 | 43 | 0 |
| Mars | 26 | 8 | 34 | 34 | 0 |
| Earth | 36 | 4 | 40 | 17 | 23 |

## Meaning of verification

`verified` means this audit checked the location identity and the cited coordinate reference. For an Earth record it additionally means a primary research publication, space-agency report, or documented research programme supports the stated planetary use. It is a catalogue provenance status, not a scientific quality score, mission endorsement, field-access permission, or certification of environmental equivalence.

**23 inherited Earth records remain `review_needed`.** They remain searchable and visible as research candidates with their existing scientific context and citations. Their site-specific coordinate and/or research evidence has not completed independent verification. They are excluded from results explicitly labelled “documented analogues,” including Nearby and numerical-comparison reference results. This does not assert that the underlying research is invalid. Bibliographic metadata alone does not verify a field coordinate.

All newly added Earth records are verified. Research purposes are narrow: Hverir supports hydrothermal-alteration spectroscopy and rover-emulator work, Lake Salda supports carbonate/microbialite investigation, Pisgah supports cave detection using thermal imaging, and SP Mountain supports planetary geological mapping/traverse training. None reproduces Martian or lunar gravity, pressure, radiation, or the full thermal environment.

## Source and coordinate method

- All 42 curated planetary geological features were checked against live USGS/IAU Gazetteer feature pages. Catalogue centres and diameters now match those pages; feature centres are not proposed landing coordinates or rover stops. East-positive longitudes were converted to the app’s [-180, 180) convention.
- Historical lunar locations use NASA NSSDCA Apollo tables and the lunar artifact inventory, LROC mission imaging, and NASA PGDA retroreflector locations. Mars locations use NASA PDS ODE mission coordinates and mission-team papers for InSight, Perseverance and Zhurong.
- Earth locations use published study coordinates, NASA AHED fieldwork metadata, the original USGS 2020 known-analog-site data release, or a separately identified authoritative geographic reference. Regional centroids, rounded published locators, study-area bounds and actual field locations are explicitly distinguished in each `coordinate_note`.
- Publication datums are not consistently specified for Earth locators. The catalogue does not label every source as a surveyed WGS84 point. A printed decimal coordinate reproduces the source; extra digits do not establish physical accuracy.
- The NASA PGDA IM-2 retroreflector coordinate (-84.7754, 29.1264) differs from the NASA NSSDCA artifact-inventory coordinate (-84.7906, 29.1957). The record uses the instrument-specific PGDA location and explicitly preserves this discrepancy in its notes. No average was invented.
- A source URL identifies a publication or record, not a guaranteed unauthenticated full-text download. Publisher sites may block automated requests or require institutional access. Broken NASA BRAILLE, Pavilion Lake and DLR ROBEX legacy URLs were replaced with live official records.

## Shared registry and scientific behavior

`backend/site_registry.json` is the single curated source. `backend/sites.py` validates IDs, names, coordinates, classifications, evidence fields, dates, the revised addition limit and the absence of preassigned grades. `backend/reference.py` preserves compatibility imports while deriving every pin and legacy tuple from that registry. `backend/naming.py` overlays reviewed IAU centres on the older bundled gazetteer so contextual names and catalogue markers agree.

`/api/pins`, `/api/sites`, `/api/search`, cell reference locations, source metadata, and documented-analogue consumers share these records. `/api/sites` supports body, text, classification and verified-only filters. Search includes names, aliases, programmes, purpose, country, description and source titles; accented names are searchable without accents.

No suitability, mission-planning or analog-scoring formula was changed. Historical importance does not supply a grade. Registry records carry `grade_status: not_scored`; calculated grades continue to come from the existing numerical model. Regional dataset identifiers identify model products available to the application, while actual cell coverage remains independently reported. Cited field measurements are not automatically ingested into the numerical model. `supported_dimensions` describes comparable model dimensions and must not be presented as evidence that a field campaign validated those dimensions.

Reviewed Earth sites can be near a computed grid result without being the same location or validating that result. The API now states this relationship explicitly. Invalid nonfinite coordinates and out-of-range latitude are rejected before grid indexing.

## Scientific corrections

- Mauna Kea retains its established name and ID but now points to the published 2012 NASA/CSA Puʻu Haiwahine field-test location (19.7612, -155.468), rather than a generic summit-area locator.
- Axel Heiberg cold springs now point to the published Gypsum Hill field location (79°24′30″N, 90°43′05″W); the earlier approximate position was substantially displaced.
- Svalbard/Bockfjorden now identifies the AMASE Troll Springs sample locality (79°23′N, 13°26′E), with the distinction from the wider volcanic region recorded.
- Impact-structure locators, including Nördlinger Ries, were reconciled to the original USGS known-analog-site release and paired with independent planetary-research evidence.
- Craters of the Moon now uses the Smithsonian volcanic-field locator; NASA BASALT sampled particular flows inside this wider region. Pavilion Lake now uses the NASA AHED published fieldwork locator.
- Apollo, Chang’e, Chandrayaan-3, SLIM, Odysseus and Mars lander coordinates were checked and refined against their stated mission references. Radiometric and cartographic mission solutions are distinguished where relevant.
- Historical candidate regions are labelled as studied regions, with source dates. The catalogue does not present old Artemis or VIPER candidate lists as current approved mission plans. Chandrayaan-3 is not described with an obsolete highest-latitude record claim.
- Updated IAU centres can differ from the bundled snapshot, particularly broad features such as Noctis Labyrinthus and Melas Chasma. These are feature-centre updates, not relocated geological formations.

## Added sites

| Site | Body | Latitude, east longitude | Classification | Evidence |
|---|---|---|---|---|
| Surveyor 1 | moon | -2.4745, -43.3398 | historical_mission | [NASA lunar spacecraft landing inventory](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Surveyor 3 | moon | -3.0162, -23.418 | historical_mission | [NASA lunar spacecraft landing inventory](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Surveyor 5 | moon | 1.4551, 23.1943 | historical_mission | [NASA lunar spacecraft landing inventory](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Surveyor 6 | moon | 0.4742, -1.4275 | historical_mission | [NASA lunar spacecraft landing inventory](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Surveyor 7 | moon | -40.9812, -11.5127 | historical_mission | [NASA lunar spacecraft landing inventory](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Luna 16 | moon | -0.5137, 56.3638 | historical_mission | [NASA lunar spacecraft landing inventory](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Luna 17 | moon | 38.23764, -35.00163 | historical_mission | [NASA lunar spacecraft landing inventory](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Luna 20 | moon | 3.7863, 56.6242 | historical_mission | [NASA lunar spacecraft landing inventory](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Luna 21 | moon | 25.9994, 30.4076 | historical_mission | [NASA lunar spacecraft landing inventory](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Luna 24 | moon | 12.7142, 62.2129 | historical_mission | [NASA lunar spacecraft landing inventory](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| IM-2 Athena | moon | -84.7754, 29.1264 | historical_mission | [Mission landing-location record](https://pgda.gsfc.nasa.gov/products/101); [NASA lunar spacecraft inventory, LROC position](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Blue Ghost Mission 1 | moon | 18.562, 61.81 | historical_mission | [NASA lunar spacecraft inventory, LROC position](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html); [Mission landing-location record](https://iaaras.ru/en/observations/sc/blueghost/) |
| Eberswalde | mars | -23.98, -33.3 | candidate_region | [IAU / USGS Gazetteer: Eberswalde](https://planetarynames.wr.usgs.gov/Feature/1706); [NASA: Mars Science Laboratory landing-site finalists](https://science.nasa.gov/resource/more-than-60-sites-considered-for-next-mars-rover-landing/) |
| Holden | mars | -26.04, -34.02 | candidate_region | [IAU / USGS Gazetteer: Holden](https://planetarynames.wr.usgs.gov/Feature/2540); [NASA: Mars Science Laboratory landing-site finalists](https://science.nasa.gov/resource/more-than-60-sites-considered-for-next-mars-rover-landing/) |
| Gusev | mars | -14.53, 175.52 | geological_research_region | [IAU / USGS Gazetteer: Gusev](https://planetarynames.wr.usgs.gov/Feature/2289) |
| Ares Vallis | mars | 10.28, -25.8 | geological_research_region | [IAU / USGS Gazetteer: Ares Vallis](https://planetarynames.wr.usgs.gov/Feature/358) |
| Noctis Labyrinthus | mars | -6.92, -102.2 | geological_research_region | [IAU / USGS Gazetteer: Noctis Labyrinthus](https://planetarynames.wr.usgs.gov/Feature/4324) |
| Hebes Chasma | mars | -1.09, -76.2 | geological_research_region | [IAU / USGS Gazetteer: Hebes Chasma](https://planetarynames.wr.usgs.gov/Feature/2402) |
| Melas Chasma | mars | -10.28, -72.7 | geological_research_region | [IAU / USGS Gazetteer: Melas Chasma](https://planetarynames.wr.usgs.gov/Feature/3812) |
| Ius Chasma | mars | -6.92, -85.8 | geological_research_region | [IAU / USGS Gazetteer: Ius Chasma](https://planetarynames.wr.usgs.gov/Feature/2757) |
| Lake Salda | earth | 37.55, 29.68 | terrestrial_analog | [Garczynski (2019), Lake Salda field report with coordinates](https://astrobiology.nasa.gov/uploads/filer_public/29/d1/29d15953-db5c-4e96-aff3-e190686acfa3/report_lc_garczynski_project.pdf); [NASA: What a lake in Turkey can tell us about Mars](https://science.nasa.gov/blogs/earth-matters/2021/02/17/what-a-lake-in-turkey-can-tell-us-about-mars/) |
| Hverir, Námafjall | earth | 65.640694, -16.812 | terrestrial_analog | [Allender et al. (2021), Multiscale spectral discrimination using ExoMars rover emulator data](https://www.sciencedirect.com/science/article/pii/S0019103521002141) |
| Pisgah Lava Field | earth | 34.746389, -116.375 | terrestrial_analog | [Titus (2021), USGS Pisgah thermal-imaging data](https://www.usgs.gov/data/oblique-thermal-imaging-pisgah-lava-field-california-acquired-march-2010); [Wynne et al. (2021), Advancing cave detection using terrain analysis and thermal imagery](https://www.mdpi.com/2072-4292/13/18/3578) |
| SP Mountain | earth | 35.6, -111.6 | terrestrial_analog | [Tanaka et al. (2009), SP Mountain planetary mapping assessment](https://www.usgs.gov/publications/assessment-planetary-geologic-mapping-techniques-mars-using-terrestrial-analogs-sp); [USGS SP Mountain field guide (2021)](https://www.hou.usra.edu/meetings/terrestrialanalogs2021/pdf/8067.pdf); [Oregon State Volcano World: SP Mountain coordinates](https://volcano.oregonstate.edu/volcanoes-2) |

## Retained Earth records needing further review

All records below retain their IDs and source citations. They require a completed coordinate/research reconciliation before entering the documented-analogue list.

| Site | Current locator | Available evidence |
|---|---|---|
| Atacama Desert, Yungay | -24.08, -69.92 | [Mars-Like Soils in the Atacama Desert, Chile, and the Dry Limit of Microbial Life](https://doi.org/10.1126/science.1089143) |
| McMurdo Dry Valleys | -77.6, 161.5 | [Antarctic dry valleys: Microclimate zonation, variable geomorphic processes, and implications for assessing climate change on Mars](https://doi.org/10.1016/j.icarus.2007.06.018) |
| Don Juan Pond | -77.56, 161.19 | [Don Juan Pond, Antarctica: Near-surface CaCl2-brine feeding Earth's most saline lake and implications for Mars](https://doi.org/10.1038/srep01166) |
| Mauna Loa, HI-SEAS | 19.6, -155.49 | [HI-SEAS research programme](https://www.hi-seas.org/) |
| Black Point Lava Flow | 35.68, -111.47 | [NASA Desert RATS film and site record](https://www.loc.gov/item/2021688805/) |
| Kilbourne Hole | 31.97, -106.96 | [NASA Goddard RIS4E instrument field campaign](https://svs.gsfc.nasa.gov/12788/) |
| Mojave Desert, Amboy Crater | 34.54, -115.79 | [Wind as a Geological Process](https://doi.org/10.1017/CBO9780511573071) |
| Askja and Holuhraun | 65.03, -16.75 | [Segregation of olivine grains in volcanic sands in Iceland and implications for Mars](https://doi.org/10.1016/j.epsl.2011.07.025) |
| Lanzarote, Timanfaya | 29.0, -13.75 | [Training astronauts for scientific exploration on planetary surfaces: The ESA PANGAEA programme](https://doi.org/10.1016/j.actaastro.2022.12.034) |
| Mount Etna | 37.75, 14.99 | [DLR ROBEX planetary exploration campaign](https://www.dlr.de/en/rm/research/projects/completed-projects/robex) |
| Río Tinto | 37.72, -6.55 | [The Río Tinto Basin, Spain: Mineralogy, sedimentary geobiology, and implications for interpretation of outcrop rocks at Meridiani Planum, Mars](https://doi.org/10.1016/j.epsl.2005.09.043) |
| Dallol, Danakil Depression | 14.24, 40.3 | [The Dallol Geothermal Area, Northern Afar (Ethiopia)—An Exceptional Planetary Field Analog on Earth](https://doi.org/10.1089/ast.2018.1926) |
| Ibn Battuta Centre sites, Erfoud | 31.37, -4.05 | [Europlanet terrestrial planetary field analogues](https://www.europlanet-society.org/europlanet-2024-ri/ta1-pfa/) |
| Chott el Jerid | 33.7, 8.4 | [Continental evaporites and the search for evidence of life on Mars](https://doi.org/10.1002/gj.1326) |
| Dhofar, AMADEE-18 | 18.9, 55.6 | [The AMADEE-18 Mars Analog Expedition in the Dhofar Region of Oman](https://doi.org/10.1089/ast.2019.2031) |
| Makhtesh Ramon | 30.61, 34.8 | [Austrian Space Forum AMADEE-20 programme](https://oewf.org/en/amadee-20/) |
| Makgadikgadi Pans | -20.7, 25.5 | [Layered mound, inverted channels and polygonal fractures from the Makgadikgadi pan (Botswana): Possible analogues for Martian aqueous morphologies](https://doi.org/10.1016/j.pss.2020.105048) |
| Qaidam Basin, Dalangtan | 38.5, 91.4 | [Xiao et al. (2017), Earth-Science Reviews 164, 84–101, doi:10.1016/j.earscirev.2016.11.003](https://doi.org/10.1016/j.earscirev.2016.11.003) |
| Pilbara, North Pole Dome | -21.1, 119.4 | [NASA Mars teams train in Australia](https://www.jpl.nasa.gov/news/nasa-and-esa-take-rovers-to-mars-in-australia/) |
| Arkaroola | -30.3, 139.3 | [Mars Society Australia research programmes](https://www.marssociety.org.au/) |
| Licancabur, High Lakes | -22.83, -67.88 | [The High‐Lakes Project](https://doi.org/10.1029/2008JG000818) |
| Salar de Pajonales | -25.15, -68.82 | [Orbit-to-ground framework to decode and predict biosignature patterns in terrestrial analogues](https://doi.org/10.1038/s41550-022-01882-x) |
| Lava Beds National Monument | 41.71, -121.51 | [NASA BRAILLE cave exploration](https://www.nasa.gov/universe/using-a-cave-rover-nasa-learns-to-search-for-life-underground/) |

## Coordinate change ledger for original sites

Published precision is retained where available. The registry includes the complete coordinate-reference explanation for each change. Saved records created before this audit may retain their originally saved coordinates; catalogue IDs remain stable.

| Site | Previous latitude, longitude | Reviewed latitude, longitude | Coordinate source / interpretation |
|---|---|---|---|
| Apollo 11 | 0.67, 23.47 | 0.67416, 23.47314 | [NASA landing-location record](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html) |
| Apollo 12 | -3.01, -23.42 | -3.0128, -23.4219 | [NASA landing-location record](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html) |
| Apollo 14 | -3.65, -17.47 | -3.64589, -17.47194 | [NASA landing-location record](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html) |
| Apollo 15 | 26.13, 3.63 | 26.13239, 3.6333 | [NASA landing-location record](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html) |
| Apollo 16 | -8.97, 15.5 | -8.9734, 15.5011 | [NASA landing-location record](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html) |
| Apollo 17 | 20.19, 30.77 | 20.1911, 30.7723 | [NASA landing-location record](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html) |
| Chang'e 3 | 44.12, -19.51 | 44.1214, -19.5117 | [NASA landing-location record](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Chang'e 4 | -45.44, 177.6 | -45.4562, 177.5885 | [LROC: Chang’e 4 lander coordinates](https://www.lroc.asu.edu/posts/1168) |
| Chang'e 5 | 43.06, -51.92 | 43.0576, -51.9161 | [NASA landing-location record](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html) |
| Chang'e 6 | -41.64, -153.99 | -41.6385, -153.9852 | [LROC: First Look, Chang’e 6](https://www.lroc.im-ldi.com/images/1374) |
| Chandrayaan-3 | -69.37, 32.32 | -69.3735, 32.3199 | [NASA GSFC miniature laser retroreflector arrays: landing locations](https://pgda.gsfc.nasa.gov/products/101) |
| SLIM | -13.32, 25.25 | -13.31549, 25.24889 | [NASA GSFC miniature laser retroreflector arrays: landing locations](https://pgda.gsfc.nasa.gov/products/101) |
| IM-1 Odysseus | -80.13, 1.44 | -80.1277, 1.4357 | [NASA GSFC miniature laser retroreflector arrays: landing locations](https://pgda.gsfc.nasa.gov/products/101) |
| de Gerlache | -88.4849, -88.3447 | -88.48, -88.34 | [IAU / USGS Gazetteer: de Gerlache](https://planetarynames.wr.usgs.gov/Feature/1439) |
| Haworth | -87.45, -5.17 | -86.9, -4.0 | [IAU / USGS Gazetteer: Haworth](https://planetarynames.wr.usgs.gov/Feature/14502) |
| Nobile | -85.2752, 53.2725 | -85.28, 53.27 | [IAU / USGS Gazetteer: Nobile](https://planetarynames.wr.usgs.gov/Feature/4321) |
| Malapert | -84.9998, 11.4031 | -85.0, 11.4 | [IAU / USGS Gazetteer: Malapert](https://planetarynames.wr.usgs.gov/Feature/3603) |
| Cabeus | -85.3303, -42.1327 | -85.33, -42.13 | [IAU / USGS Gazetteer: Cabeus](https://planetarynames.wr.usgs.gov/Feature/953) |
| Slater | -88.0792, 111.2881 | -88.08, 111.29 | [IAU / USGS Gazetteer: Slater](https://planetarynames.wr.usgs.gov/Feature/15325) |
| Peary | 88.6251, 24.4024 | 88.57, 25.73 | [IAU / USGS Gazetteer: Peary](https://planetarynames.wr.usgs.gov/Feature/4627) |
| Whipple | 89.1373, 120.0192 | 89.14, 120.02 | [IAU / USGS Gazetteer: Whipple](https://planetarynames.wr.usgs.gov/Feature/14566) |
| Tycho | -43.2958, -11.2153 | -43.3, -11.22 | [IAU / USGS Gazetteer: Tycho](https://planetarynames.wr.usgs.gov/Feature/6163) |
| Copernicus | 9.6209, -20.0786 | 9.62, -20.08 | [IAU / USGS Gazetteer: Copernicus](https://planetarynames.wr.usgs.gov/Feature/1296) |
| Aristarchus | 23.7299, -47.4901 | 23.73, -47.49 | [IAU / USGS Gazetteer: Aristarchus](https://planetarynames.wr.usgs.gov/Feature/380) |
| Mare Imbrium | 34.7244, -14.9086 | 34.72, -14.91 | [IAU / USGS Gazetteer: Mare Imbrium](https://planetarynames.wr.usgs.gov/Feature/3678) |
| Mare Tranquillitatis | 8.3487, 30.8346 | 8.35, 30.83 | [IAU / USGS Gazetteer: Mare Tranquillitatis](https://planetarynames.wr.usgs.gov/Feature/3691) |
| Schrödinger | -74.7326, 132.9252 | -74.73, 132.93 | [IAU / USGS Gazetteer: Schrödinger](https://planetarynames.wr.usgs.gov/Feature/5381) |
| Mare Orientale | -19.8655, -94.6703 | -19.87, -94.67 | [IAU / USGS Gazetteer: Mare Orientale](https://planetarynames.wr.usgs.gov/Feature/3685) |
| Aitken | -16.443, 172.9583 | -16.44, 172.96 | [IAU / USGS Gazetteer: Aitken](https://planetarynames.wr.usgs.gov/Feature/119) |
| Viking 1 | 22.27, -47.95 | 22.269, -47.951 | [NASA landing-location record](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Landing_Sites.htm) |
| Viking 2 | 47.64, 134.29 | 47.668, 134.28 | [NASA landing-location record](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Landing_Sites.htm) |
| Mars Pathfinder | 19.13, -33.22 | 19.095, -33.253 | [NASA landing-location record](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Landing_Sites.htm) |
| Spirit | -14.57, 175.47 | -14.5692, 175.4729 | [NASA landing-location record](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Landing_Sites.htm) |
| Opportunity | -1.95, -5.53 | -1.9462, -5.5266 | [NASA landing-location record](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Landing_Sites.htm) |
| InSight | 4.5, 135.62 | 4.502, 135.623 | [Golombek et al. (2020), Geology of the InSight landing site on Mars](https://doi.org/10.1038/s41467-020-14679-1) |
| Perseverance | 18.44, 77.45 | 18.4446, 77.4509 | [Bell et al. (2022), Perseverance imaging results](https://doi.org/10.1126/sciadv.abo4856) |
| Zhurong | 25.07, 109.93 | 25.066, 109.925 | [Ding et al. (2022), Surface characteristics of the Zhurong Mars rover traverse](https://doi.org/10.1038/s41561-022-00905-6) |
| Jezero | 18.4082, 77.6873 | 18.41, 77.69 | [IAU / USGS Gazetteer: Jezero](https://planetarynames.wr.usgs.gov/Feature/14300) |
| Gale | -5.3672, 137.811 | -5.44, 137.7 | [IAU / USGS Gazetteer: Gale](https://planetarynames.wr.usgs.gov/Feature/2071) |
| Mawrth Vallis | 22.4304, -16.9726 | 22.36, -16.5 | [IAU / USGS Gazetteer: Mawrth Vallis](https://planetarynames.wr.usgs.gov/Feature/3763) |
| Meridiani Planum | -0.04, -3.14 | 0.2, -2.5 | [IAU / USGS Gazetteer: Meridiani Planum](https://planetarynames.wr.usgs.gov/Feature/3854) |
| Arcadia Planitia | 49.02, -171.85 | 46.66, -168.0 | [IAU / USGS Gazetteer: Arcadia Planitia](https://planetarynames.wr.usgs.gov/Feature/348) |
| Deuteronilus Mensae | 45.1095, 23.9184 | 43.56, 22.6 | [IAU / USGS Gazetteer: Deuteronilus Mensae](https://planetarynames.wr.usgs.gov/Feature/1509) |
| Utopia Planitia | 46.7363, 117.5168 | 49.67, 118.0 | [IAU / USGS Gazetteer: Utopia Planitia](https://planetarynames.wr.usgs.gov/Feature/6260) |
| Elysium Planitia | 2.979, 154.7372 | 1.98, 155.0 | [IAU / USGS Gazetteer: Elysium Planitia](https://planetarynames.wr.usgs.gov/Feature/1784) |
| Valles Marineris | -14.0059, -58.5877 | -13.74, -59.2 | [IAU / USGS Gazetteer: Valles Marineris](https://planetarynames.wr.usgs.gov/Feature/6288) |
| Olympus Mons | 18.6528, -133.8025 | 18.4, -134.0 | [IAU / USGS Gazetteer: Olympus Mons](https://planetarynames.wr.usgs.gov/Feature/4453) |
| Hellas Planitia | -42.4301, 70.5025 | -42.66, 70.0 | [IAU / USGS Gazetteer: Hellas Planitia](https://planetarynames.wr.usgs.gov/Feature/2432) |
| Medusae Fossae | -2.1663, -164.1956 | -3.16, -163.0 | [IAU / USGS Gazetteer: Medusae Fossae](https://planetarynames.wr.usgs.gov/Feature/3795) |
| Nili Fossae | 22.0182, 76.6948 | 22.56, 76.8 | [IAU / USGS Gazetteer: Nili Fossae](https://planetarynames.wr.usgs.gov/Feature/4271) |
| Syrtis Major Planum | 9.2007, 67.103 | 8.4, 69.5 | [IAU / USGS Gazetteer: Syrtis Major Planum](https://planetarynames.wr.usgs.gov/Feature/5796) |
| Korolev | 72.7677, 164.584 | 72.77, 164.58 | [IAU / USGS Gazetteer: Korolev](https://planetarynames.wr.usgs.gov/Feature/3091) |
| Haughton impact structure, Devon Island | 75.37, -89.68 | 75.3667, -89.6833 | [Hunter (2020), USGS Known Terrestrial Analog Sites](https://doi.org/10.5066/P9J72921) |
| Axel Heiberg Island cold springs | 79.07, -90.21 | 79.408333, -90.718056 | [McGill research thesis: Gypsum Hill spring coordinates](https://www.collectionscanada.gc.ca/obj/thesescanada/vol2/QMM/TC-QMM-138895.pdf) |
| Svalbard, Bockfjorden | 79.4, 13.4 | 79.383333, 13.433333 | [AMASE 2004 Troll springs study locality](https://d-nb.info/1238969488/34) |
| Mauna Kea | 19.82, -155.47 | 19.7612, -155.468 | [Simulated real-time lunar volatiles prospecting with a rover-borne neutron spectrometer](https://www.sciencedirect.com/science/article/abs/pii/S0273117715000873) |
| Craters of the Moon | 43.42, -113.52 | 43.371, -113.493 | [Smithsonian Global Volcanism Program: Craters of the Moon](https://volcano.si.edu/volcano.cfm?vn=324020) |
| Meteor Crater | 35.03, -111.02 | 35.0333, -111.017 | [Hunter (2020), USGS Known Terrestrial Analog Sites](https://doi.org/10.5066/P9J72921) |
| Mars Desert Research Station | 38.41, -110.79 | 38.4, -110.783333 | [NASA analog-environment review, MDRS coordinates](https://ntrs.nasa.gov/api/citations/20100011346/downloads/20100011346.pdf) |
| Mistastin Lake impact structure | 55.88, -63.3 | 55.8833, -63.3 | [Hunter (2020), USGS Known Terrestrial Analog Sites](https://doi.org/10.5066/P9J72921) |
| Sudbury impact structure | 46.6, -81.18 | 46.6, -81.1833 | [Hunter (2020), USGS Known Terrestrial Analog Sites](https://doi.org/10.5066/P9J72921) |
| Nördlinger Ries | 48.88, 10.57 | 48.8833, 10.6167 | [Hunter (2020), USGS Known Terrestrial Analog Sites](https://doi.org/10.5066/P9J72921) |
| Lonar Crater | 19.98, 76.51 | 19.9667, 76.5167 | [Hunter (2020), USGS Known Terrestrial Analog Sites](https://doi.org/10.5066/P9J72921) |
| Pavilion Lake | 50.87, -121.74 | 50.86732985, -121.7350536 | [NASA AHED: Pavilion Lake Research Project dataset (Lim)](https://ahed.nasa.gov/datasets/85c5ac42f4b0fece89e6f0a344d5) |

## Complete catalogue inventory

The JSON registry is authoritative for descriptions, programmes, purposes, coordinate notes and all source roles. The inventory below records every retained and added site and its current evidence state.

| ID | Site | Body | Status | Latitude, longitude |
|---|---|---|---|---|
| `moon-landing-Apollo 11` | Apollo 11 | moon | verified | 0.67416, 23.47314 |
| `moon-landing-Apollo 12` | Apollo 12 | moon | verified | -3.0128, -23.4219 |
| `moon-landing-Apollo 14` | Apollo 14 | moon | verified | -3.64589, -17.47194 |
| `moon-landing-Apollo 15` | Apollo 15 | moon | verified | 26.13239, 3.6333 |
| `moon-landing-Apollo 16` | Apollo 16 | moon | verified | -8.9734, 15.5011 |
| `moon-landing-Apollo 17` | Apollo 17 | moon | verified | 20.1911, 30.7723 |
| `moon-landing-Chang'e 3` | Chang'e 3 | moon | verified | 44.1214, -19.5117 |
| `moon-landing-Chang'e 4` | Chang'e 4 | moon | verified | -45.4562, 177.5885 |
| `moon-landing-Chang'e 5` | Chang'e 5 | moon | verified | 43.0576, -51.9161 |
| `moon-landing-Chang'e 6` | Chang'e 6 | moon | verified | -41.6385, -153.9852 |
| `moon-landing-Chandrayaan-3` | Chandrayaan-3 | moon | verified | -69.3735, 32.3199 |
| `moon-landing-SLIM` | SLIM | moon | verified | -13.31549, 25.24889 |
| `moon-landing-IM-1 Odysseus` | IM-1 Odysseus | moon | verified | -80.1277, 1.4357 |
| `moon-feature-Shackleton` | Shackleton | moon | verified | -89.67, 129.78 |
| `moon-feature-de Gerlache` | de Gerlache | moon | verified | -88.48, -88.34 |
| `moon-feature-Haworth` | Haworth | moon | verified | -86.9, -4.0 |
| `moon-feature-Nobile` | Nobile | moon | verified | -85.28, 53.27 |
| `moon-feature-Malapert` | Malapert | moon | verified | -85.0, 11.4 |
| `moon-feature-Mons Mouton` | Mons Mouton | moon | verified | -84.6, 31.0 |
| `moon-feature-Cabeus` | Cabeus | moon | verified | -85.33, -42.13 |
| `moon-feature-Slater` | Slater | moon | verified | -88.08, 111.29 |
| `moon-feature-Peary` | Peary | moon | verified | 88.57, 25.73 |
| `moon-feature-Whipple` | Whipple | moon | verified | 89.14, 120.02 |
| `moon-feature-Tycho` | Tycho | moon | verified | -43.3, -11.22 |
| `moon-feature-Copernicus` | Copernicus | moon | verified | 9.62, -20.08 |
| `moon-feature-Aristarchus` | Aristarchus | moon | verified | 23.73, -47.49 |
| `moon-feature-Mare Imbrium` | Mare Imbrium | moon | verified | 34.72, -14.91 |
| `moon-feature-Mare Tranquillitatis` | Mare Tranquillitatis | moon | verified | 8.35, 30.83 |
| `moon-feature-Schrödinger` | Schrödinger | moon | verified | -74.73, 132.93 |
| `moon-feature-Mare Orientale` | Mare Orientale | moon | verified | -19.87, -94.67 |
| `moon-feature-Aitken` | Aitken | moon | verified | -16.44, 172.96 |
| `mars-landing-Viking 1` | Viking 1 | mars | verified | 22.269, -47.951 |
| `mars-landing-Viking 2` | Viking 2 | mars | verified | 47.668, 134.28 |
| `mars-landing-Mars Pathfinder` | Mars Pathfinder | mars | verified | 19.095, -33.253 |
| `mars-landing-Spirit` | Spirit | mars | verified | -14.5692, 175.4729 |
| `mars-landing-Opportunity` | Opportunity | mars | verified | -1.9462, -5.5266 |
| `mars-landing-Phoenix` | Phoenix | mars | verified | 68.22, -125.75 |
| `mars-landing-Curiosity` | Curiosity | mars | verified | -4.59, 137.44 |
| `mars-landing-InSight` | InSight | mars | verified | 4.502, 135.623 |
| `mars-landing-Perseverance` | Perseverance | mars | verified | 18.4446, 77.4509 |
| `mars-landing-Zhurong` | Zhurong | mars | verified | 25.066, 109.925 |
| `mars-feature-Jezero` | Jezero | mars | verified | 18.41, 77.69 |
| `mars-feature-Gale` | Gale | mars | verified | -5.44, 137.7 |
| `mars-feature-Oxia Planum` | Oxia Planum | mars | verified | 17.28, -25.71 |
| `mars-feature-Mawrth Vallis` | Mawrth Vallis | mars | verified | 22.36, -16.5 |
| `mars-feature-Meridiani Planum` | Meridiani Planum | mars | verified | 0.2, -2.5 |
| `mars-feature-Arcadia Planitia` | Arcadia Planitia | mars | verified | 46.66, -168.0 |
| `mars-feature-Deuteronilus Mensae` | Deuteronilus Mensae | mars | verified | 43.56, 22.6 |
| `mars-feature-Utopia Planitia` | Utopia Planitia | mars | verified | 49.67, 118.0 |
| `mars-feature-Elysium Planitia` | Elysium Planitia | mars | verified | 1.98, 155.0 |
| `mars-feature-Valles Marineris` | Valles Marineris | mars | verified | -13.74, -59.2 |
| `mars-feature-Olympus Mons` | Olympus Mons | mars | verified | 18.4, -134.0 |
| `mars-feature-Hellas Planitia` | Hellas Planitia | mars | verified | -42.66, 70.0 |
| `mars-feature-Medusae Fossae` | Medusae Fossae | mars | verified | -3.16, -163.0 |
| `mars-feature-Nili Fossae` | Nili Fossae | mars | verified | 22.56, 76.8 |
| `mars-feature-Syrtis Major Planum` | Syrtis Major Planum | mars | verified | 8.4, 69.5 |
| `mars-feature-Korolev` | Korolev | mars | verified | 72.77, 164.58 |
| `earth-analog-0` | Atacama Desert, Yungay | earth | review_needed | -24.08, -69.92 |
| `earth-analog-1` | McMurdo Dry Valleys | earth | review_needed | -77.6, 161.5 |
| `earth-analog-2` | University Valley, Dry Valleys | earth | verified | -77.87, 160.75 |
| `earth-analog-3` | Don Juan Pond | earth | review_needed | -77.56, 161.19 |
| `earth-analog-4` | Haughton impact structure, Devon Island | earth | verified | 75.3667, -89.6833 |
| `earth-analog-5` | Axel Heiberg Island cold springs | earth | verified | 79.408333, -90.718056 |
| `earth-analog-6` | Svalbard, Bockfjorden | earth | verified | 79.383333, 13.433333 |
| `earth-analog-7` | Mauna Loa, HI-SEAS | earth | review_needed | 19.6, -155.49 |
| `earth-analog-8` | Mauna Kea | earth | verified | 19.7612, -155.468 |
| `earth-analog-9` | Craters of the Moon | earth | verified | 43.371, -113.493 |
| `earth-analog-10` | Black Point Lava Flow | earth | review_needed | 35.68, -111.47 |
| `earth-analog-11` | Meteor Crater | earth | verified | 35.0333, -111.017 |
| `earth-analog-12` | Kilbourne Hole | earth | review_needed | 31.97, -106.96 |
| `earth-analog-13` | Mars Desert Research Station | earth | verified | 38.4, -110.783333 |
| `earth-analog-14` | Mojave Desert, Amboy Crater | earth | review_needed | 34.54, -115.79 |
| `earth-analog-15` | Mistastin Lake impact structure | earth | verified | 55.8833, -63.3 |
| `earth-analog-16` | Sudbury impact structure | earth | verified | 46.6, -81.1833 |
| `earth-analog-17` | Askja and Holuhraun | earth | review_needed | 65.03, -16.75 |
| `earth-analog-18` | Lanzarote, Timanfaya | earth | review_needed | 29.0, -13.75 |
| `earth-analog-19` | Mount Etna | earth | review_needed | 37.75, 14.99 |
| `earth-analog-20` | Río Tinto | earth | review_needed | 37.72, -6.55 |
| `earth-analog-21` | Nördlinger Ries | earth | verified | 48.8833, 10.6167 |
| `earth-analog-22` | Dallol, Danakil Depression | earth | review_needed | 14.24, 40.3 |
| `earth-analog-23` | Ibn Battuta Centre sites, Erfoud | earth | review_needed | 31.37, -4.05 |
| `earth-analog-24` | Chott el Jerid | earth | review_needed | 33.7, 8.4 |
| `earth-analog-25` | Dhofar, AMADEE-18 | earth | review_needed | 18.9, 55.6 |
| `earth-analog-26` | Makhtesh Ramon | earth | review_needed | 30.61, 34.8 |
| `earth-analog-27` | Makgadikgadi Pans | earth | review_needed | -20.7, 25.5 |
| `earth-analog-28` | Lonar Crater | earth | verified | 19.9667, 76.5167 |
| `earth-analog-29` | Qaidam Basin, Dalangtan | earth | review_needed | 38.5, 91.4 |
| `earth-analog-30` | Pilbara, North Pole Dome | earth | review_needed | -21.1, 119.4 |
| `earth-analog-31` | Arkaroola | earth | review_needed | -30.3, 139.3 |
| `earth-analog-32` | Licancabur, High Lakes | earth | review_needed | -22.83, -67.88 |
| `earth-analog-33` | Salar de Pajonales | earth | review_needed | -25.15, -68.82 |
| `earth-analog-34` | Pavilion Lake | earth | verified | 50.86732985, -121.7350536 |
| `earth-analog-35` | Lava Beds National Monument | earth | review_needed | 41.71, -121.51 |
| `moon-landing-Surveyor 1` | Surveyor 1 | moon | verified | -2.4745, -43.3398 |
| `moon-landing-Surveyor 3` | Surveyor 3 | moon | verified | -3.0162, -23.418 |
| `moon-landing-Surveyor 5` | Surveyor 5 | moon | verified | 1.4551, 23.1943 |
| `moon-landing-Surveyor 6` | Surveyor 6 | moon | verified | 0.4742, -1.4275 |
| `moon-landing-Surveyor 7` | Surveyor 7 | moon | verified | -40.9812, -11.5127 |
| `moon-landing-Luna 16` | Luna 16 | moon | verified | -0.5137, 56.3638 |
| `moon-landing-Luna 17` | Luna 17 | moon | verified | 38.23764, -35.00163 |
| `moon-landing-Luna 20` | Luna 20 | moon | verified | 3.7863, 56.6242 |
| `moon-landing-Luna 21` | Luna 21 | moon | verified | 25.9994, 30.4076 |
| `moon-landing-Luna 24` | Luna 24 | moon | verified | 12.7142, 62.2129 |
| `moon-landing-IM-2 Athena` | IM-2 Athena | moon | verified | -84.7754, 29.1264 |
| `moon-landing-Blue Ghost Mission 1` | Blue Ghost Mission 1 | moon | verified | 18.562, 61.81 |
| `mars-feature-Eberswalde` | Eberswalde | mars | verified | -23.98, -33.3 |
| `mars-feature-Holden` | Holden | mars | verified | -26.04, -34.02 |
| `mars-feature-Gusev` | Gusev | mars | verified | -14.53, 175.52 |
| `mars-feature-Ares Vallis` | Ares Vallis | mars | verified | 10.28, -25.8 |
| `mars-feature-Noctis Labyrinthus` | Noctis Labyrinthus | mars | verified | -6.92, -102.2 |
| `mars-feature-Hebes Chasma` | Hebes Chasma | mars | verified | -1.09, -76.2 |
| `mars-feature-Melas Chasma` | Melas Chasma | mars | verified | -10.28, -72.7 |
| `mars-feature-Ius Chasma` | Ius Chasma | mars | verified | -6.92, -85.8 |
| `earth-analog-salda` | Lake Salda | earth | verified | 37.55, 29.68 |
| `earth-analog-hverir` | Hverir, Námafjall | earth | verified | 65.640694, -16.812 |
| `earth-analog-pisgah` | Pisgah Lava Field | earth | verified | 34.746389, -116.375 |
| `earth-analog-sp-mountain` | SP Mountain | earth | verified | 35.6, -111.6 |

## Maintenance and validation

New records must include a traceable coordinate reference and a narrowly supported scientific description. Earth research candidates must not be promoted based on appearance, a broad-region citation, or numerical similarity alone. Do not fill the remaining addition allowance with unverified locations. A future review should prioritize the 23 preserved candidates before adding less-supported entries.

Backend tests cover the original 93-record preservation requirement, revised 193-total ceiling, unique identifiers/coordinates, source roles, valid dataset identifiers, honest verification/grade states, source and search integration, shared contextual coordinates, selected published corrections, exclusions from documented results, and invalid request coordinates. The full existing scientific/API suite is also run; this audit does not claim independent validation of the numerical model.
