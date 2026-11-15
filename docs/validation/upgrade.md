# RADIUM sibling-build upgrade validation

This work preserves the React/Zustand application, processed-grid analysis, mission and similarity models, catalog, saved library, comparisons, reports and versioned links. The sibling builds provide interaction ideas; their qualitative or interpolated scores are not imported.

## Baseline

- Canonical repository: `Jcelno/ricecookers`.
- Build: passed before changes.
- Backend: 106 tests passed; three existing Pillow deprecation warnings.
- Persistence: nine tests passed.
- Initial module/preload graph: exact byte and gzip counts in `bundle-before.json`.
- Before screenshots: `temporary screenshots/screenshot-89-baseline-desktop.png` (1440 × 900) and `screenshot-89-baseline-mobile.png` (390 × 844).

## Tutorial semantics

The new introductory welcome is eligible only after metadata and the first rendered map frame. Shared-link arrivals receive a dismissible invitation. `?tour=0`, offline examples, and automated browsers suppress automatic opening; `?tour=1` explicitly requests a demo opening. Blocked storage always suppresses automatic opening, including a forced demo.

`radium.intro.v2` records dismissal or completion, not mere display. Therefore a crash or reload during the welcome may show it again. The acceptance check for “reload does not reopen” dismisses the welcome first and reloads without the force-open flag. This resolves the contradictory request to both force-open `?tour=1` and never mark a displayed welcome seen.

Progress is stored as stable topic IDs in `radium.tutorial.v3`; obsolete numeric `v2` progress is ignored. Semantic events originate from successful application actions. Camera movement requires a real user gesture; preparation and fly-to do not complete the movement task. Empty panel clicks never complete tasks.

The visual direction retains the existing basalt and regolith tokens, world accents, Newsreader place/display typography and IBM Plex controls. The map remains the main visual surface; coaching uses a dimmed SVG cutout and a restrained floating surface. Mobile coaching reserves space above its bottom dock.

## Scientific rules retained

- Suitability coverage threshold: 60%; similarity: 80%. These are separate model rules, not TV's 50% rule.
- Locations resolve to existing analysis cells with no interpolation.
- No score combines mission suitability with analog similarity.
- Missing measurements and unavailable external context remain unavailable.

## What was ported

| Section | Origin | Delivered behavior |
| --- | --- | --- |
| 1.1–1.8 | RADIUM tutorial rebuild | First rendered frame gate, first-run welcome, seven real-action tasks, 32 stable-ID topics in six chapters, quizzes, ranking feedback, SVG spotlight with observers, resume/minimize, keyboard/focus support and contextual first-use hints. |
| 2.1 | TV | Existing weighted mission factors explain primary strength and limiting factor in the Site Card and candidate rows. |
| 2.2 | TV | Coverage and provenance-derived confidence beside overall location, mission and comparison grades, with the existing backend eligibility gates. |
| 2.3–2.4 | TV | Optional desktop mission telemetry, UTC clock, search keycap and guarded keyboard shortcuts. |
| 2.5–2.6 | TV | Skip navigation, research badge/caveat, actual source-failure chips, precise coordinate copy with fallback, centre control and cursor world/coordinate readout. |
| 2.7 | TV | On-demand SoilGrids topsoil and a trimmed official GVP snapshot, labelled context only, with timeout/abort/unavailable behavior and registry entries. |
| 3.1 | NR | Lazy full-screen orbital/photo gallery, image attribution, thumbnails, keyboard navigation, focus return, swipe/pinch/zoom, external Google links at the exact selected Earth point. |
| 3.2 | NR | Globe pin fans, ground dots/leaders, camera-dependent scale, selected nameplates, limb fade and selection/click cues; native clustering remains the overview fallback. |
| 3.3 | NR | Lazy reverse search over real Moon/Mars cells and catalog sites, using the existing pairwise similarity model, with purpose-specific comparisons and curated-analog outrank counts. |
| 3.4 | NR | Documented/New leads/Both filtering, dashed lead cues and source-labelled target context in list and map. |
| 3.5–3.6 | NR | In-map imagery/layer popovers, opacity/off controls, independent boundaries, attributed Esri imagery, and a shared continuous ramp whose legend alpha follows the rendered overlay. |
| 3.7–3.8 | NR | Catalog-resolved demo aliases, subtle shell glow/grain, and the requested spring easing token. |
| 4 | Cross-cutting | Live starter assessments, mobile 25/60/100% location-sheet snaps, lazy panels and feature modules, and updated README/Methodology/Sources. |

## Deliberate omissions and adaptations

- No inverse-distance interpolation or sibling qualitative scores. The canonical containing-cell analysis and measured grids remain authoritative.
- No single overall score. Mission suitability and Earth similarity remain separate throughout UI, links and exports.
- No TV 50% coverage rule. Suitability still requires 60%; similarity still requires 80%.
- No Earth analog-envelope score or optional map layer. A calibrated envelope rubric is absent, so the UI says **Not assessed**. Reverse similarity is implemented and labelled computed instead of being presented as Earth suitability.
- No invented “Shackleton Rim” coordinate or preview grade. The starter/demo opens the actual Shackleton crater catalog record, with an explicit centre/rim caveat. Atacama's Earth mission grade is Not assessed, and its catalog coordinate-review caveat remains visible.
- The limiting-factor card uses the lowest available positive-weight criterion score; primary strength uses the greatest weighted contribution. The distinction avoids calling a strong criterion a limitation merely because it has a small weight. Both expose the weight and original factor score.
- Reverse-match confidence is Not assessed: that response includes contributing source lists but does not yet expose the per-input availability needed for the documented confidence calculation. Forward comparisons have the measurement provenance to assess it.
- External SoilGrids availability is not guaranteed. The registry records the provider's announced REST-service pause; the browser shows Unavailable on timeout/failure. GVP proximity is not a volcanic hazard, lava-tube or cave-access assessment.

## Bundle measurement

Measure the emitted HTML's JavaScript entry and unique modulepreload tags with `node scripts/measure-initial-bundle.mjs`. This uses file bytes and Node's `gzipSync` consistently before/after, excluding CSS, images and dynamically imported feature chunks. The large Cesium dependency is included in both totals. Exact chunk records are in `bundle-before.json` and `bundle-after.json`.

The gallery viewer, tour provider and reverse-twin UI remain dynamic imports. Location, Layers and Mission panels also load separately, reducing the entry payload enough to cover the added bootstrap, map controls and telemetry.
The selected Site Card is deferred until a place is selected; the empty starter panel does not load its photographs, profile or timeline code.


| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Entry JavaScript | 151,822 bytes | 111,304 bytes | 26.69% smaller |
| Initial entry + preloads | 4,584,429 bytes | 4,536,308 bytes | 1.05% smaller |
| Initial entry + preloads, gzip | 1,239,748 bytes | 1,225,661 bytes | 1.14% smaller |

## Validation commands

```sh
npm run build
npm test
npm run test:browser
npm run test:persistence
npm run test:sharing
npm run test:maps-tutorial
npm run test:tour
npm run test:upgrade
npm run test:evidence
```

Screenshots use the unmodified `screenshot.mjs` helper against localhost. `tests/screenshot-state.mjs` prepares representative site, mission, Earth, twin and gallery states; `tests/screenshot-tour.mjs` prepares a resumed coach mark. Before/after and revision screenshots remain in the ignored `temporary screenshots/` directory.

## Screenshot review record

Every group below was inspected at 1440×900 and 390×844 in at least two passes. `screenshots.json` lists the captured file names and actual PNG dimensions. Files remain local and ignored rather than adding large screenshots to source control.

| Change | Before/reference | First and second review passes |
| --- | --- | --- |
| Tutorial welcome/coach | 89 baseline | 90–92; full-guide catalog/analogy corrections in 153 and 164 `tour-*` captures |
| Decision cards | 93 site/mission | 102–109 |
| Coverage/confidence | 93 site/mission; existing comparison | 120–134, site/mission/compare labels |
| Telemetry | 89 baseline | 100–101 |
| Shortcuts sheet | 89 header | 110, 112 |
| Accessibility/resilience | 89, 94–95 | 96–99 error chips; 118, 124 shell |
| Precise coordinates | 93 site | 133, 137 |
| Earth context/reverse | 93 Site Card | 148, 155 and 159 `context`/`reverse` captures; Sources role filter in 155 and 159 |
| Gallery | 94 gallery-before | 123, 137 gallery-after |
| Fanned pins | 94–95 | 111–117 |
| Discovered leads | 113 leads-before | 125, 137 leads-after |
| Map controls | 118–119 | 128–139, including final collision/opacity corrections |
| Ramp/legend agreement | 140–141 | 144–147 |
| Demo aliases | Existing versioned views | 149–152, 156–160: all three aliases |
| Shell/starter/mobile sheets | 89, 93 | 142–143, 147, 154; handle behavior also verified through pointer/keyboard tests |
| Methodology explanations | Existing Methodology sheet | 162–163, with fully loaded mobile confirmation in 165 |

Review corrections included mobile control collisions, legend opacity, full-guide offscreen targets, sticky mobile sheet anchors, visible-search focus, stale context values and duplicate source-credit keys. Expected canceled requests (`ERR_ABORTED`) during navigation are distinct from failed data or uncaught page errors.

## Integrated verification

| Check | Result |
| --- | --- |
| Production typecheck and build | Passed |
| Scientific/backend/API regressions | 125 passed |
| Persistence | 10 passed |
| Confidence, coverage and Earth context unit tests | 10 passed |
| Existing browser workflows | 13 passed |
| Sharing | 2 assertion groups passed |
| Existing maps/tutorial checks | 5 assertion groups passed |
| New upgrade browser suite | 10 programs, 32 assertion groups passed |

The Python run retains three existing Pillow `mode` deprecation warnings. Browser workflow assertions were preserved; one new wait observes the rendered Mission step list because cached rank data can be ready before its lazy panel mounts. Tour tests likewise wait for actual controls and a stationary clickable marker, while still completing every Quick step through real input.

Source changes and validation are committed on `upgrade/radium-field-guide`. No production deployment is part of this upgrade. Existing processed grids, suitability formulas/weights and forward similarity formulas remain unchanged; backend additions expose evidence metadata and reuse the existing scoring paths.
