# RADIUM redesign validation — 14 November 2026

Implemented in the existing React/TypeScript and Python application for the NASA Space Apps Challenge. The Vercel production deployment was not changed.

## Catalogue and evidence

The corrected scope allows up to 100 **additional** sites beyond the original 93. The implementation retains all 93 and adds 24, for 117 entries. There are 43 verified Moon records, 34 verified Mars records, and 17 verified Earth analog records. Another 23 inherited Earth research candidates remain visible with explicit review-needed status and are excluded from documented-analog results. The remaining addition allowance was not filled with unsupported locations.

The shared JSON registry, complete inventory, individual citations, coordinate corrections, source disagreements and verification criteria are documented in [site-catalog.md](site-catalog.md). NASA mission records, NASA PDS, USGS/IAU nomenclature and primary terrestrial research sources support the records. No numerical suitability or similarity formula was changed.

## Product changes

- Four primary workspaces: Explore, Mission Planner, Earth Analogs and Saved.
- Shared planetary targets and research purposes across Discover, Compare and Near Me; registry selectors and scientific source details throughout.
- Circular map markers display calculated grades, neutral unscored status, or double-ring cluster counts. Globe and Earth cluster buttons zoom to their constituent locations. Review-needed records are not labeled as documented analogs.
- Versioned browser persistence retains places, comparisons, missions, available assessment context and source references. It supports migration, duplicate handling, rename, collections, reopen, delete/undo and export. Hard-limit exclusions never become saved grades.
- Copy View Link confirms actual clipboard success, with a selectable-link fallback. Links validate and restore supported view/model state while excluding the private Near Me starting location and local saved library.
- Searchable scientific source library, three Methodology reading levels, and a 32-topic optional tutorial using live controls, contextual highlights, mission steps, progress/resume and mobile minimization.
- Responsive navy interface, retained planetary imagery, keyboard focus states and reduced-motion behavior.
- Fixed comparison-column alignment after partial request failure, canceled-request handling, stale responses after world changes, and target inheritance between workspaces.

## Completed checks

| Check | Result |
|---|---|
| `npm run build` | TypeScript and production build pass |
| `npm test` | 106 scientific, API and catalogue tests pass |
| `npm run test:persistence` | 9 persistence tests pass |
| `npm run test:browser` | 13 browser workflow groups pass |
| `npm run test:sharing` | URL round trips, exact coordinate precision, custom weights, layers, filters, malformed input, private-location exclusion, mission reopening and stale-response checks pass |
| `npm run test:maps-tutorial` | Focused checks pass: clustering, dateline handling, actual globe/Earth cluster zoom, accessible markers, real tutorial controls/resume and mobile layout |
| `npm run snapshot` | Offline example regenerated from the real API using the revised registry |
| `git diff --check` | No whitespace errors |

Browser checks used local Vite and Python services with headless Chromium. They exercised all three maps, registry discovery, scientific comparison, Nearby results, mission planning, reload persistence, clipboard success/failure, and 390-pixel mobile layouts. Representative desktop and mobile screenshots were inspected in multiple rounds. The backend suite reports three pre-existing Pillow deprecation warnings; no failing tests.

## Practical limits

The catalogue is curated rather than exhaustive, and 23 inherited Earth records still require evidence reconciliation. Some scientific publications restrict full-text access. Map imagery depends on external tile services. Regional analysis cells do not resolve local landing hazards, and model grades are RADIUM assessments rather than NASA endorsements. Browser storage remains local to the browser; export a copy for portability. No deployment or production-server validation was performed.
