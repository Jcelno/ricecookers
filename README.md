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

## Credits

Imagery and data: NASA (LRO LOLA, Diviner and LROC teams; MGS MOLA; Mars Odyssey GRS; Lunar Prospector;
Solar System Treks; GIBS; POWER), USGS Astrogeology and the IAU, JAXA (Kaguya), NOAA NCEI (ETOPO 2022),
LMD/OU/IAA/ESA/CNES (Mars Climate Database), EOX and Copernicus (Sentinel-2 cloudless, CC BY 4.0),
Hartmann & Moosdorf (GLiM, CC BY 3.0), Natural Earth, OpenStreetMap contributors and OpenFreeMap.
Citations for each dataset are in the Data sources page.
