// The field guide: 32 short topics, grouped by task. It is a reference to search, not a tour to finish.
// (The earlier sequential tour taught the same content in a fixed order; the order is gone, the content stays.)
import type { useStore } from "@/store";

type Store = ReturnType<typeof useStore.getState>;
export type GuideGroup = "twins" | "rank" | "evidence" | "save";
export interface GuideTopic { id: string; group: GuideGroup; title: string; body: string; more?: string; action?: { label: string; run: (s: Store) => void } }

export const GUIDE_GROUPS: { id: GuideGroup; label: string; blurb: string }[] = [
  { id: "twins", label: "Find twins", blurb: "Match a Moon or Mars site to places on Earth." },
  { id: "rank", label: "Rank sites", blurb: "Score Moon and Mars locations for a mission." },
  { id: "evidence", label: "Read the evidence", blurb: "Grades, measurements and what they can support." },
  { id: "save", label: "Save and share", blurb: "Keep what you found and send it to someone." },
];

const twins = (s: Store) => s.enter({ kind: "twin", body: s.body === "moon" ? "moon" : "mars" });
const rank = (s: Store) => s.enter({ kind: "rank" });
const explore = (s: Store) => s.enter({ kind: "explore" });
const catalog = (s: Store) => { s.enter({ kind: "explore" }); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-tour="catalog-button"]')?.click()); };

export const GUIDE: GuideTopic[] = [
  // ---------------------------------------------------------------- Find twins
  { id: "workspaces", group: "twins", title: "Five places to work", body: "Find Earth Twins matches a Moon or Mars site to places on Earth. Rank Landing Sites scores Moon and Mars locations for a mission. Near Me lists analog sites close to you. Findings shows headline results. My Notebook keeps what you found.", action: { label: "Back to the four questions", run: (s) => s.startOver() } },
  { id: "pick-world", group: "twins", title: "Choose a world", body: "Three worlds, three sets of real data. Pick the Moon or Mars to choose a site. Earth is where its twins are found.", more: "Imagery shows appearance; analysis uses the processed data grid. A clicked point is assigned to the map square that contains it and is never interpolated." },
  { id: "move-map", group: "twins", title: "Move around a globe", body: "Drag to rotate. Scroll or pinch to zoom. The scale changes; the data underneath does not.", action: { label: "Explore the globes", run: explore } },
  { id: "map-controls", group: "twins", title: "Use the map controls", body: "Zoom, recentre or reset the view without dragging. The same controls work from the keyboard." },
  { id: "select-site", group: "twins", title: "Pick a site", body: "Choose a famous place from the list, or click anywhere on the globe. Values describe the whole map square around the point you click, not the exact point." },
  { id: "clusters", group: "twins", title: "Clusters count places", body: "A numbered cluster counts sites that overlap at this zoom. Zoom in to separate them. The count is never a score." },
  { id: "catalog-open", group: "twins", title: "Find a research site", body: "Research Sites lists landings, named features and documented analog sites. A verified record documents a location and its use, not its suitability.", action: { label: "Open Research Sites", run: catalog } },
  { id: "catalog-filter", group: "twins", title: "Search the research catalogue", body: "Search by name or research theme. Filters separate documented places from records that still need evidence review." },
  { id: "find-twin", group: "twins", title: "Find an Earth twin", body: "Pick a Moon or Mars site and what you want to test. RADIUM compares that site with every place on Earth's land and lists the closest matches.", more: "The comparison uses up to six purpose-weighted quantities across real Earth land squares. No overall score combines the twin score with the site score.", action: { label: "Find Earth Twins", run: twins } },
  { id: "twin-purpose", group: "twins", title: "Choose what to test", body: "Rover driving and ice drilling need different twins. Changing the purpose changes what counts, so the ranking changes too." },
  { id: "compare-sites", group: "twins", title: "Put places side by side", body: "Compare shows a Moon or Mars site next to an Earth match: what matches, what does not, and what Earth cannot reproduce. The comparison tray holds up to four places." },
  { id: "analogy-breaks", group: "twins", title: "Know where the analogy stops", body: "No place on Earth has the Moon's vacuum or Mars's gravity. Those conditions are listed with numbers and never scored. Test them in a chamber or with offloading rigs." },
  { id: "nearby-analogs", group: "twins", title: "Find fieldwork near you", body: "Near Me lists documented analog sites by distance from a place you choose. Pick a Moon or Mars site to rank the places near you by how well they match. Your location stays out of shared links.", action: { label: "Open Near Me", run: (s) => s.enter({ kind: "near" }) } },
  // ---------------------------------------------------------------- Rank sites
  { id: "choose-destination", group: "rank", title: "Choose a destination", body: "Rank Landing Sites starts from the place you want to assess. Choose a documented site or click any place on the globe.", action: { label: "Rank Landing Sites", run: rank } },
  { id: "choose-mission", group: "rank", title: "Choose a mission", body: "Each mission has its own priorities and hard limits: a lunar base, a Mars robotic landing or a Mars human landing. The mission decides which question the ranking answers." },
  { id: "priorities", group: "rank", title: "Adjust what matters", body: "Sliders change the ranking, not the measurements. Raise ice access and watch which sites move up." },
  { id: "hard-limits", group: "rank", title: "Test a hard limit", body: "A hard limit rules a place out even when everything else is strong. Turn one off to see what it was excluding." },
  { id: "read-candidates", group: "rank", title: "Read the ranked sites", body: "Each row says which factors helped a site and which held it back. Select one to see its measurements." },
  { id: "scenarios", group: "rank", title: "Compare two scenarios", body: "Scenario A/B keeps two sets of priorities and limits side by side. See which places move when the mission question changes." },
  // --------------------------------------------------------- Read the evidence
  { id: "turn-on-layer", group: "evidence", title: "Show a data layer", body: "Layers show the ground beneath the imagery: slope, temperature, ice and more. Each has a legend with its source, resolution and real range.", action: { label: "Explore the globes", run: explore } },
  { id: "advanced-layer", group: "evidence", title: "See the technical names", body: "Advanced mode shows full dataset names and controls. Imagery and scientific layers stay separate." },
  { id: "read-grade", group: "evidence", title: "Read a grade honestly", body: "Grades run from A to F and compare places for one purpose only. A is 0.80 or higher. A grey marker means not scored; it is never a zero.", more: "A ≥ 0.80; B ≥ 0.65; C ≥ 0.50; D ≥ 0.35; F < 0.35. These are RADIUM's own thresholds, not NASA ratings. The Methodology page documents them.", action: { label: "Open Methodology", run: (s) => s.setSheet("methodology") } },
  { id: "read-measurements", group: "evidence", title: "Read all the measurements", body: "Every measurement shows its kind of evidence, its source and its resolution. Missing data stays missing." },
  { id: "evidence-class", group: "evidence", title: "Know the kinds of evidence", body: "Observed, inferred, modelled, computed and interpreted are different things. Each value is labelled with the kind it is." },
  { id: "uncertainty", group: "evidence", title: "Understand what is uncertain", body: "Resolution and kind of evidence limit what a value can tell you. A quantity with no data cannot support a conclusion.", more: "Some quantities are derived from several inputs; the label describes the reported quantity. Numerical uncertainty is shown only when the source product supplies it." },
  { id: "seasonal-changes", group: "evidence", title: "Read changing conditions", body: "The timeline shows a lunar day or a Mars year. Observations and model curves are labelled separately." },
  { id: "terrain-profile", group: "evidence", title: "Look beyond one map square", body: "A regional profile puts elevation and slope in context. A sharper base image never adds scientific resolution." },
  { id: "understand-limits", group: "evidence", title: "Keep two questions apart", body: "The site score says how well a place serves a mission. The twin score says how closely an Earth place resembles it. A good twin does not make a site safe." },
  // ------------------------------------------------------------ Save and share
  { id: "save-it", group: "save", title: "Keep a discovery", body: "Every comparison you open is logged in My Notebook with its grade and date. Star the ones you want to keep. The notebook is stored in this browser.", action: { label: "Open My Notebook", run: (s) => { s.enter({ kind: "explore" }); s.setMode("saved"); } } },
  { id: "saved-library", group: "save", title: "Return to your notebook", body: "My Notebook supports names, collections, undo and export. Counts show twins found, new leads and places Earth cannot match." },
  { id: "share-link", group: "save", title: "Share a reproducible view", body: "Copy View Link saves the view and its settings in the address. Your Near Me location and your notebook stay in your browser." },
  { id: "research-brief", group: "save", title: "Build a research brief", body: "A comparison can become a test brief: what matches, what breaks down and what still needs testing." },
];

/** Case-insensitive match on every word of the query. */
export function searchGuide(query: string): GuideTopic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return GUIDE;
  return GUIDE.filter((t) => { const hay = `${t.title} ${t.body} ${t.more ?? ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}
