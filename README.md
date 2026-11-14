# RADIUM

Planetary site suitability and Earth analog discovery, built for the NASA Space Apps Challenge
("Permanent Moon Base Locations and Mars").

RADIUM answers two separate questions with public data from NASA and partner agencies:

1. **Site suitability.** How well does a place on the Moon or Mars serve a mission you define?
2. **Earth analog similarity.** Which places on Earth share the characteristics of that place that matter
   for research and testing, and where does the resemblance fail?

Every number on screen is labelled as observed, inferred, modelled, computed or interpreted, with its source,
native resolution and limits. Where a dataset has no value, the interface says so. Nothing is invented.

## Run it

Requirements: Node.js 20 or newer, Python 3.9 or newer, and an internet connection (map imagery streams from
NASA, EOX and OpenFreeMap).

```bash
git clone https://github.com/Jcelno/ricecookers.git
cd ricecookers
npm install                                   # web app dependencies
python3 -m venv .venv                         # Python environment for the data service
.venv/bin/pip install -r requirements.txt
npm run dev                                   # starts the data service (port 8000) and the web app
```

`requirements.txt` holds only what the app needs to run. To run the tests or rebuild the data, also install
the pipeline packages: `.venv/bin/pip install -r requirements-pipeline.txt`.

**Deploying to Vercel.** Import the repository; `vercel.json` configures everything. Vercel builds the web app
with Vite into `dist/` and serves it from its CDN, and runs the data service as one Python function
(`api/index.py`, which loads `backend/app.py`, about 380 MB with its data, under the 500 MB limit). Every
`/api/*` request is routed to that function.

Open <http://localhost:3000>. `npm run dev` runs both processes; stop it with Ctrl-C.

The clone includes the processed grids the app needs (`data/processed/`, about 215 MB on disk and 75 MB to
download). To rebuild them from the original sources, run `npm run pipeline` (see below).

| Command | What it does |
| --- | --- |
| `npm run dev` | Data service with auto-reload plus the Vite dev server on port 3000 |
| `npm test` | 48 scientific and logic checks (`tests/test_science.py`) |
| `npm run build` | Type-check and build the web app into `dist/` |
| `npm run pipeline` | Download the source data and rebuild every grid |
| `node screenshot.mjs http://localhost:3000 label` | Save a screenshot to `temporary screenshots/` |

## What you can do

- **Explore.** Spin 3D globes of the Moon and Mars drawn from real orbital mosaics (LROC WAC, Kaguya
  Terrain Camera, Viking MDIM 2.1) and a 2D map of Earth (Sentinel-2 cloudless, Blue Marble). Click anywhere
  to read the measurements for that analysis cell. Turn on data layers: elevation, slope, roughness,
  temperature, sunlight, hydrogen, permanent shadow, dust, precipitation, vegetation and more.
- **Design a mission.** Pick lunar permanent base, Mars robotic landing or Mars human exploration. Move the
  priority sliders; every cell is regraded A to F, the globe is recoloured and the list of best sites is
  re-ranked, with a sentence explaining what changed. Hard limits can be switched on and off.
- **Earth Twin.** Choose a Moon or Mars site and a purpose (rover mobility, ice and drilling, geology,
  dust, habitability). RADIUM compares the site with all 341,042 land cells on Earth, lists the closest
  matches, marks which are documented analog sites and which are new leads, and opens a side-by-side
  comparison that states the strong matches, the weak ones, and the conditions Earth cannot reproduce.
- **Photographs.** Every place shows real photographs: NASA science images of the nearest named feature or
  landing site on the Moon and Mars (NASA Image and Video Library), and openly licensed photographs taken near
  the place on Earth (Wikimedia Commons). Earth Twin shows both places together. Illustrations, artist's
  concepts and anything tagged as AI-generated are filtered out, and every photo carries its author, licence
  and a link to the original.
- **Methodology and Data sources.** Both pages are generated from the running code and the dataset registry.

## How it is built

```
pipeline/   Python. Downloads public datasets and turns them into analysis grids.
backend/    Python + FastAPI. Loads the grids, scores suitability and similarity, renders map overlays.
src/        React + TypeScript + Tailwind. CesiumJS globes, MapLibre Earth map, panels.
tests/      pytest. Checks against published values and against the method's own rules.
data/       raw/ (downloads, 5.6 GB, not committed)   processed/ (grids, 200 MB)
docs/       methodology.md: the long-form record of methods, checks and data quirks.
```

**Grids.** Moon 0.5° (15 km), Mars 0.5° (30 km), Earth 0.25° (28 km), plus 2.4 km polar-stereographic grids
within 305 km of each lunar pole. A click returns the cell's values, never an interpolated point.

**Terrain.** Slope and roughness are computed the same way on all three worlds from LOLA, MOLA and ETOPO
(1.9 km pixels, 3.7 km baseline), which makes terrain the one directly comparable dimension.

**Suitability.** `score = Σ wᵢ·sᵢ / Σ wᵢ` over the criteria that have data. Each criterion has a stated
transfer function. Weights are normalised; missing criteria are dropped and reported as coverage; hard limits
exclude cells. Grades: A ≥ 0.80, B ≥ 0.65, C ≥ 0.50, D ≥ 0.35, F below.

**Similarity.** Six dimensions (terrain, rock type, ice and frozen ground, bare dry ground, ground temperature,
airborne dust), each scored only where the comparison is physically meaningful, weighted by purpose. Gravity,
air pressure, radiation and lunar temperature are never scored; they are reported with numbers under "Where
the analogy breaks down". The list of documented analog sites labels results and never changes a grade.

Full details, including every rule and weight, are in the app under Methodology and in
[`docs/methodology.md`](docs/methodology.md).

## Data

Eighteen datasets, each documented in `backend/registry.py` and shown in the app under Data sources:
LOLA, Diviner, Lunar Prospector and LOLA illumination products for the Moon; MOLA, Odyssey GRS and the Mars
Climate Database for Mars; ETOPO 2022, NASA POWER (MERRA-2, CERES), MODIS via NASA GIBS and the GLiM
lithology map for Earth; IAU nomenclature and Natural Earth for names.

**Terms for the grids in this repository.** `data/processed/` holds derived grids, and each keeps the terms of
its source. The NASA, NOAA, USGS and Natural Earth sources are public domain or open. Two are not:

- the Mars climate grids (`data/processed/mars/`: `tmean`, `tmax`, `tmin`, `ps_*`, `solar_flux`, `dust_tau*`,
  `thermal_inertia`, `albedo`, `mcd_oro`) come from the Mars Climate Database, which is free for scientific use
  with attribution and needs the MCD team's authorisation for commercial use;
- the Earth rock-type grid (`data/processed/earth/lith.npy`) comes from GLiM, licensed CC BY 3.0.

Rebuild everything from the original sources:

```bash
npm run pipeline                               # fetch (resumable) + build, about an hour
.venv/bin/python -m pipeline.run_all --no-fetch   # build only, about five minutes
```

## Checks

`npm test` verifies, among other things:

- lunar slopes against LOLA's own slope product (r = 0.94);
- Diviner equatorial temperatures of 391 K by day and 95 K by night;
- the best-lit point near the lunar south pole at 89.45°S, 222.69°E, as published;
- MOLA elevations at eight landing sites within 0.6 km, and Mars pressure against a barometric estimate (r = 0.999);
- that scores equal the documented formula, weights normalise, missing data is dropped rather than filled,
  and hard limits exclude;
- that the top-ranked Mars sites include Gale, Meridiani and Oxia/Mawrth, and that four Artemis III
  candidate-region namesakes (the ridge beside Shackleton, Mons Mouton, Slater, the de Gerlache rim) sit in the
  top 2% of south-polar cells;
- that removing the reference list of analog sites changes no similarity score.

## Limits to keep in mind

- Cells are 2 to 30 km across. RADIUM screens regions; it cannot certify a landing ellipse.
- No indicator here is a detection of ice. Lunar evidence is hydrogen, permanent shadow and thermal stability;
  Martian evidence is hydrogen and thermal stability.
- Mars temperature, pressure, sunlight and dust come from a climate model on a 330 km grid for a typical year.
- Composition is averaged over 60 km on the Moon and several hundred kilometres on Mars; Earth rock type is one
  class per 55 km.
- Mars ice evidence would improve with the SWIM ice-consistency maps and lunar evidence with M3, LAMP and LEND
  detections; neither is integrated yet.
- The interface is designed for desktop. On a phone, Earth Twin's site picker is hidden; choose a site in
  Explore and use "Find its Earth twins".
- Grades are RADIUM's own scale for comparing options. They are not a NASA rating.

## Use of AI tools

RADIUM's concept, requirements and scientific rules are our team's work. We chose the challenge and specified
the product in detail before any code was written:

- two separate, explainable scores (how well a site suits a chosen mission, and how closely a place on Earth
  resembles it) that are never merged, shown as letter grades;
- three mission types with priorities the user can adjust, and hard limits that rule sites out;
- Earth Twin as the signature feature: matches found from data rather than from a list of famous sites, with
  a side-by-side view of where the analogy holds and where it breaks down;
- the ground rules: use only authentic space-agency data, never invent a value, show "data unavailable" where
  a dataset is silent, and label every figure as observed, modelled or computed with its source and limits.

We also set the visual direction, including real orbital imagery on the Moon and Mars globes, and directed
the build.

We used Claude Code (Anthropic's AI coding assistant) as our implementation tool. Working from our
specification and under our direction, it wrote the code for the data pipeline, the scoring service, the web
app and the automated tests, and drafted the documentation. It also proposed which public datasets to use,
the default scoring weights and thresholds, and the reference list of published analog sites. The datasets,
weights and thresholds are documented in the app's Data sources and Methodology pages so they can be checked.

No measurement in RADIUM is AI-generated. Every value comes from the public NASA and partner-agency datasets
listed under Data sources, and all imagery is real orbital and satellite data.

## Licence

RADIUM's own code and documentation are released under the [Apache License 2.0](LICENSE).
Copyright 2026 the RADIUM authors.

Third-party data, imagery and software keep their own terms, listed below. The citation for each dataset is
in the app's Data sources page and in `backend/registry.py`.

**Data stored in this repository** (as derived grids and name lists in `data/processed/`)

| Source | Provider | Terms |
| --- | --- | --- |
| LOLA elevation and polar illumination, Diviner temperatures, Lunar Prospector hydrogen and elements | NASA (PDS, GSFC PGDA) | Public domain |
| MOLA elevation, Mars Odyssey GRS elements | NASA (PDS) | Public domain |
| Mars Climate Database v6.2 | LMD (CNRS), Open University, IAA-CSIC, with ESA and CNES | Free for scientific use with attribution; commercial use needs the MCD team's authorisation |
| ETOPO 2022 relief | NOAA NCEI | Public domain |
| POWER climatology (MERRA-2, CERES) | NASA Langley | Open (NASA Earth science data policy) |
| MODIS land cover and NDVI, via GIBS | NASA EOSDIS | Open |
| GLiM lithology | Hartmann & Moosdorf, via PANGAEA | CC BY 3.0 |
| Planetary nomenclature | IAU and USGS Astrogeology | Public domain |
| Natural Earth boundaries | Natural Earth | Public domain |

**Imagery and labels streamed while the app runs** (not stored here)

| Source | Provider | Terms |
| --- | --- | --- |
| Moon and Mars mosaics (LROC WAC, Kaguya Terrain Camera, Viking MDIM 2.1 and others) | NASA Solar System Treks; Kaguya data from JAXA | NASA imagery is public domain; Kaguya mosaic courtesy of JAXA/SELENE |
| Blue Marble | NASA GIBS | Public domain |
| Sentinel-2 cloudless 2016 | EOX IT Services, with Copernicus Sentinel data | CC BY 4.0 |
| Borders and place names | OpenFreeMap, OpenMapTiles, OpenStreetMap contributors | OpenStreetMap data under ODbL 1.0 |
| Moon and Mars photographs | NASA Image and Video Library | NASA images, not copyrighted; credited to the releasing team |
| Earth photographs | Wikimedia Commons contributors | Each photo's own free licence (for example CC BY-SA), shown with the photo |

**Software** (direct dependencies; each is open source)

| Licence | Components |
| --- | --- |
| MIT | React, React DOM, Zustand, Vite, @vitejs/plugin-react, Tailwind CSS, concurrently, type definitions (`@types/*`), FastAPI, Pydantic, netCDF4, zarr, numcodecs, pyshp, watchfiles, pytest |
| Apache-2.0 | CesiumJS, TypeScript, Puppeteer, Requests, aiohttp (Apache-2.0 AND MIT) |
| BSD-3-Clause | MapLibre GL JS, NumPy, SciPy, Shapely, Starlette, Uvicorn, fsspec, tifffile, imagecodecs |
| ISC | lucide-react |
| MIT-CMU | Pillow |
| SIL OFL 1.1 | Newsreader, IBM Plex Sans and IBM Plex Sans Condensed fonts (via Fontsource) |

## Credits

Imagery and data: NASA (LRO LOLA, Diviner and LROC teams; MGS MOLA; Mars Odyssey GRS; Lunar Prospector;
Solar System Treks; GIBS; POWER), USGS Astrogeology and the IAU, JAXA (Kaguya), NOAA NCEI (ETOPO 2022),
LMD/OU/IAA/ESA/CNES (Mars Climate Database), EOX and Copernicus (Sentinel-2 cloudless, CC BY 4.0),
Hartmann & Moosdorf (GLiM, CC BY 3.0), Natural Earth, OpenStreetMap contributors and OpenFreeMap.
Citations for each dataset are in the Data sources page.
