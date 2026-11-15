# RADIUM methodology

This is the long-form record of how RADIUM turns public data into grades. The app's Methodology page shows the
same rules read live from the code; this file adds the reasoning and the data problems found along the way.

## 1. Two questions, never merged

| | Site suitability | Earth analog similarity |
| --- | --- | --- |
| Question | How well does this Moon or Mars cell serve a defined mission? | Which Earth cells share the characteristics of this planetary cell that matter for research and testing? |
| Code | `backend/suitability.py` | `backend/similarity.py` |
| Inputs | Planetary data only | Planetary data and Earth data |
| Output | Grade per cell per mission | Grade per Earth cell per planetary cell per purpose |

A good analog need not resemble a good landing site. The two scores are never combined.

## 2. Analysis grids

| Grid | Cells | Cell size | Why |
| --- | --- | --- | --- |
| Moon, global | 720 × 360 | 0.5° ≈ 15 km | Native grid of Diviner and Lunar Prospector products |
| Moon, each pole | 254 × 254 | 2.4 km, polar stereographic | Latitude–longitude cells shrink to slivers near the poles; light and cold traps vary over kilometres |
| Mars | 720 × 360 | 0.5° ≈ 30 km | 256 MOLA pixels per cell |
| Earth | 1440 × 720 | 0.25° ≈ 28 km | 225 ETOPO pixels per cell; only cells at least half land are analysed |

Global cells that fall inside a lunar polar square are withheld from the global grid, so no place is ranked twice.
A map click returns the values of the cell under the pointer. Nothing is interpolated to a point.

## 3. Rules for handling data

1. **No invented values.** Missing data is stored as NaN and shown as "Data unavailable".
2. **Evidence is labelled.** Observed, inferred, modelled, computed or interpreted, per variable and, where the
   method changes with location, per cell (lunar sunlight is modelled poleward of 65° and computed from geometry
   elsewhere).
3. **Native resolution is kept on the label.** A 5° gamma-ray value is repeated across the cells it covers and
   still says "5° ≈ 300 km".
4. **Interpolation is used once**, for smooth reanalysis and climate-model fields that are coarser than the grid
   (NASA POWER, Mars Climate Database), and is stated on the label.
5. **Uncertainty is shown when the source provides it**: one-sigma values for Lunar Prospector and Odyssey
   gamma-ray products; local-time coverage for Diviner; laser-shot coverage for MOLA.

## 4. Terrain

Computed by `pipeline/common.py::terrain_cells`, identically for the Moon (LOLA 16 px/deg), Mars (MOLA 32 px/deg)
and Earth (ETOPO 2022, 60 arc-seconds). All three have pixels of about 1.9 km.

- **Slope.** Central differences on the sphere over two pixels (≈ 3.7 km). The east–west step is `round(1/cos φ)`
  pixels so the metric baseline is the same at every latitude.
- **Roughness.** Height minus the mean of its four neighbours at the same baselines (zero for a tilted plane),
  summarised as an inter-quartile range. This follows the curvature idea of Kreslavsky & Head (2000).
- **Per cell.** Median slope, 90th-percentile slope, roughness IQR, mean elevation.

Tests confirm the method returns the exact slope of a tilted plane and stays accurate at 60° latitude.
Against LOLA's own slope product the correlation is 0.94; RADIUM's values are about half as large because its
baseline is twice as long.

For the lunar poles two kinds of slope are kept: *local* (480 m baseline, statistics inside the 2.4 km cell) for
buildability, and *regional* (the same 3.8 km definition as everywhere else, over a 29 km window) for comparison
with Earth.

## 5. Site suitability

`score = Σ wᵢ·sᵢ / Σ wᵢ`, over criteria with data. Criteria, transfer functions, mission weights and hard limits
are defined in `backend/suitability.py` and printed in the app. The design choices:

- **Transfer functions are ramps between two stated values** (one trapezoid, for lunar peak temperature).
  The end points were chosen from the physical meaning of the quantity and from the observed distribution of the
  data, then fixed. They are RADIUM's choices, not agency standards.
- **Polar base criteria ask whether a cell contains usable ground**, not whether the whole cell is usable:
  "buildable ground" is the share of 240 m pixels at 10° slope or less, and sunlight is taken at the best-lit
  buildable pixel. A cell-median slope wrongly rejected ridge-top sites such as the rim beside Shackleton.
- **Permanent shadow counts only in regions of at least 1 km²** when measuring distance to cold traps.
- **Missing data.** A criterion without data is dropped and weights are rescaled; coverage is reported; below
  60% coverage there is no grade.
- **Hard limits** exclude a cell regardless of score. Each has a stated reason and can be switched off.
- **Ranking** uses greedy non-maximum suppression so listed sites are distinct places (25 km apart on the lunar
  polar grids, 60 km on the lunar global grid, 400 km on Mars).

What the default rankings show, as a sanity check rather than a target: the best Mars robotic sites include Gale,
Meridiani and the Oxia/Mawrth region; on the Moon, the ridge beside Shackleton and Mons Mouton rank in the top
0.05% of south-polar cells. North-polar sites score slightly higher overall because the terrain is gentler and
Lunar Prospector hydrogen is slightly higher there. RADIUM's criteria do not include the size and temperature of
cold traps or the science value of the South Pole–Aitken basin, which favour the south.

## 6. Earth analog similarity

For planetary cell P and Earth cell E: `similarity = Σ w_d·s_d / Σ w_d` over dimensions with data on both sides.

| Dimension | How it is compared |
| --- | --- |
| Terrain | Log-ratio of slope and roughness; a factor of two apart scores 0.61 |
| Rock type | Measured planetary chemistry mapped to Earth lithology classes through an affinity table (expert rule) |
| Ice and frozen ground | Planetary ice-evidence index against an Earth frozen-ground index; 1 − difference |
| Bare, dry ground | Share of exposed rock or soil and low precipitation on Earth; a precondition, the same for every site |
| Ground temperature | Mars only; Gaussian, 40 K tolerance |
| Airborne dust | Mars only; log-ratio of dust optical depth and aerosol optical depth |

Design choices:

- **Not comparable means not scored.** Gravity, pressure, radiation and lunar temperature are listed with numbers
  for both places and never enter the score.
- **Mars ice index.** Shallow ground ice persists where the annual-mean surface temperature is about 198 K or
  colder (Mellon & Jakosky 1993). Thermal stability earns half the index; hydrogen enrichment inside the stable
  zone earns the rest. Hydrogen in warm ground is not counted as ice, since it is more likely bound in hydrated
  minerals. Poleward of about 57° the gamma-ray product reports no value because the ground is too ice-rich for
  its retrieval (Boynton et al. 2002); there the index uses thermal stability alone.
- **Glacier ice hides the ground** as vegetation does, so ice-sheet interiors do not count as bare ground.
- **Purposes.** The same pair of places is graded once per purpose. A purpose that is irrelevant to the planetary
  site (ice drilling where there is no ice evidence) is reported as not applicable.
- **Discovery.** All Earth land cells are ranked from data alone. The reference list of 36 documented analog
  sites (`backend/reference.py`) labels results and shows how known sites score. A test confirms that emptying
  the list changes no score.

## 7. Planning tools built on the two scores

These tools reuse the two scores above. None of them changes a score, and none adds a third score.

**Three different quantities.** Site suitability (how well a Moon or Mars cell serves a mission), analog
similarity (how closely an Earth cell matches a Moon or Mars cell for a purpose) and geographic distance on Earth
are always shown separately. They are never averaged into one number.

**Near Me** (`POST /api/analogs/nearby`). Two rankings, chosen explicitly:
- *Distance*: RADIUM's 36 documented analog sites, sorted by great-circle distance from the user's point on a
  sphere of radius 6371.0088 km (`geo.gc_km`), ties broken by name. This says nothing about how good an analog a
  site is, and nothing about roads, borders, permits or access.
- *Similarity*: needs a Moon or Mars target and purpose. Earth cells and documented sites inside the radius are
  ranked by the Earth Twin score, the same array `/api/twin` uses (tests check equality with
  `/api/twin/compare`). Model regions are thinned with the same greedy non-maximum suppression as elsewhere
  (minimum spacing radius ÷ 8, clamped to 30–300 km), and only valid land cells are eligible. Distance is shown
  beside each result and plotted against similarity as a decision aid; it never enters the score.
The user's location is sent only with the request, is not stored by the service and is never written into
share links.

**Analog atlas.** Documented sites can be coloured by similarity grade (ordinal, A to F), by environment type or
by study theme (both categorical). Environment and study-theme tags come from each site's curated theme and note
in `backend/reference.py`, by explicit keyword rules listed there; a site no rule matches is "Other or mixed".
They describe what a site has been studied for, are not measurements and never enter a score. Every badge
carries text (a grade letter or a two-letter code) so that colour is never the only cue.

**Research Test Brief** (`POST /api/brief`). An experiment proposal for one target, one Earth place and one
purpose. Measured content comes from the Earth Twin comparison: dimensions graded B or better are listed as
reasons the place may be useful, dimensions below 0.5 as mismatches, dimensions without data as not assessed,
and the never-scored differences (gravity, pressure, radiation, temperature regime) as conditions Earth cannot
reproduce. Each dimension links the registered datasets behind it. The protocol text is a reviewed template per
purpose (`backend/briefs.py`) that describes a class of test; it states nothing about a particular site. Site
access, logistics, equipment and budget are always "Not assessed. Requires field verification."

**Scenario comparison.** Two sets of weights and hard limits for the same mission are ranked with the unchanged
`/api/rank` model. Each site is also graded under the other scenario (the `probe` field), so a site outside one
list is shown as graded, below the top 10, or excluded by a named hard limit, never as zero. The explanation of a
change is each criterion's contribution difference, value × (share under B − share under A). Identical
scenarios return identical rankings (tested).

**Compare view.** Shows the same `/api/twin/compare` result as Earth Analogs, laid out side by side. The radar
plots only the normalised (0–1) similarity scores of dimensions that were compared; raw quantities in different
units are never put on one axis. A dimension without data is drawn as "not compared", never as a low score.

**Regional terrain profile** (`GET /api/profile`). Cell-mean elevation of the global grid (Moon and Mars 0.5°,
Earth 0.25°) for up to 30 cells either side of the selected cell, north–south or east–west. Earth water cells are
missing, not zero. At 15–30 km per point it shows regional relief only and says nothing about landing hazards.

**Place search** (Near Me). Uses RADIUM's own name lists, including Natural Earth's 7,342 populated places (public
domain), so no query is sent to an outside geocoding service.

**Offline example.** `scripts/build_snapshot.py` runs the real API in-process for the worked example and stores
the responses unchanged in `public/demo/snapshot.json`, with the time and build. The app shows it only when the
data service is unreachable and labels it as a saved example.

**Reference list.** The 36 documented analog sites cite either a peer-reviewed paper or a named field programme.
22 journal and book citations were checked against Crossref on 2026-11-14 (authors, year, journal, volume and
pages) and carry their DOI; programme-only entries (for example HI-SEAS, AMASE, Desert RATS) cite the programme.

**Lunar polar overlays.** Within 305 km of each pole the 2.4 km polar grids replace the 15 km global grid. Map
images are drawn so the two never overlap or leave gaps: the global image stops at 75.5°, and the polar cap image
covers everything poleward of it, with polar values inside the square and global values around it, on the global
layer's colour scale. Transparent pixels carry the nearest visible colour (alpha stays zero) so texture filtering
cannot draw dark fringes. The squares are outlined on the map; a polar-only layer says so when the selected place
lies outside them. Scores are unaffected.

**Time series** (`GET /api/timeline`, `pipeline/build_timeline.py`). Moon: Diviner bolometric temperature by local
hour, the mean of observed quarter-hour bins only (unobserved hours stay empty). Mars: Mars Climate Database
seasonal means of surface temperature and solar flux (12 seasons). Earth: NASA POWER monthly skin temperature.

**Custom similarity weights.** Earth Analogs, compare, briefs, Near Me and the twin overlay accept user weights for
the purpose's own dimensions (0–100 each, at least one positive). Sending the documented weights reproduces the
default results exactly (tested). The fitness-by-purpose table always uses the documented weights.

**Site assessment.** The label in the Site Analysis Card follows fixed rules: "Limited data" when fewer than half
of the headline measurements exist; "Potential terrain concerns" when typical or steep-ground slope exceeds the
level at which the suitability terrain criterion gives no credit (Moon 12°/20°, Mars and Earth 6°/15°), unless at
least 30% of a polar cell is gentle at 480 m; "Promising" only when the cell grades A or B for a mission with no
hard limit failed; otherwise "Additional analysis required".

**Share links.** The address hash records the view (mode, world, target, purpose, chosen Earth cell, mission
weights and limits, scenario B, atlas colouring and Near Me settings). Values read from a link are validated
(latitude −90..90, longitude −180..180, weights 0..100, known ids only) and anything else is ignored.

## 8. Data problems found and how they were handled

| Problem | Evidence | Handling |
| --- | --- | --- |
| The north-polar Diviner PRP table lists longitudes mirrored | PRP triangle altitudes correlate with LOLA at r = 0.11 as listed and r = 0.999 with `lon = 180° − lon`; LOLA's orientation confirmed with 21 IAU crater positions | Correction applied in `build_moon_polar.py`; recorded in the grid's validation block |
| MODIS land cover labels bright salt flats as permanent snow | Aral seabed, Bonneville, Lop Nur classed as ice at mean ground temperatures above 10 °C | 122 cells reassigned to barren where mean ground temperature exceeds 10 °C |
| One Lunar Prospector hydrogen bin holds a Fortran overflow marker | `**********` at 43.0–43.5°N, 153.5–154.0°E | Stored as no data |
| ETOPO download ended early without an error | 118 MB of 478 MB | Downloader checks size and resumes |
| NASA NEO float archive is no longer served | URL redirects to a general page | MODIS values read from NASA GIBS through its published colour maps instead (99.99% of pixels match a colour-map entry exactly) |
| Reanalysis soil wetness reads "saturated" over ice sheets | Value 1.0 across Antarctica | Blanked where the cell is mostly permanent ice |
| NASA GIBS reference label layers return blank tiles; CARTO label tiles now need a key | Tile probes | Earth labels use OpenFreeMap vector tiles |

## 9. Known limits

### Coverage, evidence confidence and decision cards

Coverage is the computed share of the assessment's normalized weight for which a criterion has data. The UI
uses the thresholds returned by the backend: **60% for mission suitability**, **80% for analog similarity**.
Below the applicable threshold the overall letter is withheld and the tile says **Insufficient data**. A hard
limit remains a separate exclusion, regardless of coverage. Individual criterion grades are not overall grades;
the backend does not publish a separate weighted coverage for each criterion, and the UI does not invent one.

Confidence is an **interpreted, conservative source-mix summary**, not a probability, error bar, validation
result or NASA assurance. It uses only scored, positive-weight criteria and the available input measurements
that contributed to them. Each criterion's weight is counted once, using its least direct available evidence:
inferred takes precedence, then modelled/interpreted, then observed/computed. This deliberately avoids treating
a criterion with many input fields as more important than one with few. Geology's affinity rule also counts as
interpreted evidence. The class shares are normalized over contributing criterion weights:

- **Low:** more than 40% of weight is inferred.
- **Medium:** otherwise, more than 40% is modelled/interpreted.
- **High:** otherwise, more than 50% is observed/computed.
- **Medium:** the remaining mixed cases, including a tie at 50% direct evidence.
- **Not assessed:** no scored criteria or missing evidence provenance for any contributing criterion. A teaser
  that has scores without input provenance reports this explicitly; it does not infer confidence from a grade.

These fixed, RADIUM-defined boundaries describe evidence classes; high confidence does not improve spatial
resolution or make an interpreted scoring rubric a validated engineering result. Input sources and native
resolutions remain available in the location panel and comparison evidence. Missing measurements and
zero-weight criteria do not enter the confidence mixture.

The **Primary strength** card is the available criterion with the largest `criterion score × normalized weight`.
The **Limiting factor** is the lowest available criterion score among positive-weight criteria. A score of zero
is valid; missing is not zero. The cards quote the existing criterion score and weight and create no new score.

See the app's Methodology page ("What RADIUM cannot tell you") and each dataset's "Limits" entry under Data
sources. The most important: cells are kilometres across; no indicator is a detection of ice; Mars climate values
come from a model; composition products are tens to hundreds of kilometres coarse.

## References

Boynton, W. V. et al. (2002), Science 297, 81–85. · Boynton, W. V. et al. (2007), J. Geophys. Res. 112, E12S99. ·
Feldman, W. C. et al. (2001), J. Geophys. Res. 106, 23231–23251. · Forget, F. et al. (1999), J. Geophys. Res. 104,
24155–24175. · Gelaro, R. et al. (2017), J. Climate 30, 5419–5454. · Hartmann, J. & Moosdorf, N. (2012), Geochem.
Geophys. Geosyst. 13, Q12004. · Kreslavsky, M. A. & Head, J. W. (2000), J. Geophys. Res. 105, 26695–26711. ·
Mazarico, E. et al. (2011), Icarus 211, 1066–1081. · Mellon, M. T. & Jakosky, B. M. (1993), J. Geophys. Res. 98,
3345–3364. · Paige, D. A. et al. (2010), Science 330, 479–482. · Prettyman, T. H. et al. (2006), J. Geophys. Res.
111, E12007. · Smith, D. E. et al. (2001), J. Geophys. Res. 106, 23689–23722. · Smith, D. E. et al. (2010),
Geophys. Res. Lett. 37, L18204. · Williams, J.-P. et al. (2017), Icarus 283, 300–325.
