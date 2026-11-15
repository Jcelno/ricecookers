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

## Validation commands

```sh
npm run build
npm test
npm run test:browser
npm run test:persistence
npm run test:sharing
npm run test:maps-tutorial
npm run test:tour
```

Screenshots use the unmodified `screenshot.mjs` helper against localhost. `tests/screenshot-state.mjs` prepares representative site, mission, Earth, twin and gallery states; `tests/screenshot-tour.mjs` prepares a resumed coach mark. Before/after and revision screenshots remain in the ignored `temporary screenshots/` directory.
