# Changelog

## Unreleased: since `submitted-2026-11-15`

The version judged in NASA Space Apps 2026 is tagged `submitted-2026-11-15`. Everything below is on the
`upgrade/first-open` branch and has not been deployed to the submitted link.

### First open
- The first screen is a question chooser, "What do you want to find out?", with four cards. Each shows one
  real result computed by the API at build time, and the Moon, Earth and Mars are drawn from real imagery.
- The 32-topic tour and its welcome dialog are removed. In their place: a 20-second example that drives the
  real interface, three coach marks shown once each, and a searchable Help reference that keeps all 32 topics.
- The page shell renders without waiting for the data service. A wake-up message appears after 4 s and a
  saved example, labelled as such, after 20 s. Counts show a dash, never 0, while loading.
- The map engine loads only when a globe is needed: first-paint JavaScript fell from 4,536 KB to 395 KB.

### Find Earth Twins
- A three-step rail (Site, What to test, Results) with famous sites first and purposes written as verbs.
  A purpose that does not apply stays visible, disabled, with the reason.
- Results: a read-out from the response, numbered pins, the top three side by side, "New lead" tags,
  "Try next" suggestions, and weight bars that re-rank the list and say what moved.
- A fixed "Earth can't reproduce" strip: red chips for gravity, air pressure and radiation, green for the
  Mars day.
- Each top match reports whether it stays in the top 10 when the weights vary by ±20%.
- The Documented analog sites tab shows where each verified site ranks among all Earth places.

### Compare, Site card, Notebook
- Compare shows where the analogy breaks down as one bar per condition, with what a test needs to make up
  the difference, and can draw a shareable image of the pair.
- The Site Analysis Card leads with what the place is, its grade with one sentence why and one primary
  button. Provenance moves into a collapsed Evidence section.
- Saved becomes My Notebook: every comparison is logged with its grade and date, with three counts and
  badges earned from real results.
- Near Me and Rank Landing Sites carry the same three-step rail.

### Renamed in the interface (ids unchanged)
- Earth Analogs → Find Earth Twins; Mission Planner → Rank Landing Sites; Saved → My Notebook;
  Discover → Best matches; "Coverage 100%" → "All data available".

### Model and API
- New: `POST /api/twin/robustness` and `POST /api/twin/validation`. Neither changes a score.
- The "breaks down" list carries machine-readable fields and cited radiation reference values. None is scored.
- Fixed: the best match could report "1 match better" because of a float round-off; it now reports none.
- No scoring formula, weight or threshold changed.

### Tests
- Backend: 139 tests (was 125).
- Browser: `tests/first-open.mjs` replaces the two tour tests; the workflow and maps tests were updated for
  the new navigation.

### Not done
- A combined overall score (ruled out by design: the two scores stay separate).
- New datasets (SWIM, M3, LAMP, LEND), sharper zoomed-in Mars imagery, a warm-up ping for the data service,
  the demo video and a single AI-use statement.
