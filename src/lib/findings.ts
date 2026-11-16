// Real results computed by the RADIUM API at build time (scripts/build_snapshot.py writes src/data/findings.json).
// They let the start screen and the Findings view show true numbers before the data service has answered.
// Nothing here is authored by hand: change the model and `npm run snapshot` rewrites every value.
import data from "@/data/findings.json";
import type { Grade, Planet } from "./types";

export interface Study {
  site: string; body: Planet; name: string; lat: number; lon: number; coords: string; place: string;
  purpose: string; purpose_label: string; cells: number; grades: Record<Grade, number>; best: number | null;
  top: { rank: number; name: string; lat: number; lon: number; coords: string; score: number; grade: Grade | null; new_lead: boolean }[];
  best_documented: { name: string; score: number; grade: Grade | null } | null;
  documented_scored: number; documented_below_top: number;
  breaks_down: { label: string; planet: string; earth: string; text: string; id?: string; kind?: string; ratio?: number | null; remedy?: string }[];
  dimensions: { id: string; label: string; score: number | null; grade: Grade | null; weight: number }[];
  link: string; compare_link: string; id?: string;
  request: Record<string, string | number>;
}
export interface Famous { id: string; body: Planet; name: string; lat: number; lon: number; line: string; source: string }
export interface RankCard {
  mission: string; label: string; body: Planet; cells: number; graded: number; excluded: number; grades: Record<Grade, number>;
  top: { place: string; coords: string; lat: number; lon: number; grade: Grade | null; score: number }[]; link: string;
}

export const findings = data as unknown as {
  generated_utc: string; generated_date: string; build: string; note: string;
  counts: { sources: number; earth_cells: number; moon_cells: number; mars_cells: number; documented_sites: number };
  famous: Famous[];
  cards: {
    moon: Study; mars: Study; rank: RankCard;
    near: { from: { lat: number; lon: number; label: string }; radius_km: number; in_radius: number; catalogue_size: number;
      nearest: { name: string; country: string; distance_km: number; theme: string; lat: number; lon: number }[] };
  };
  missions: Record<string, RankCard>;
  findings: Study[];
  featured: Study[];
};

/** One featured target a day, from the fixed curated rotation. */
export function featuredToday(now = Date.now()): Study {
  const list = findings.featured;
  return list[Math.floor(now / 86_400_000) % list.length];
}

export const famousFor = (body: Planet) => findings.famous.filter((f) => f.body === body);

/** "Karakoram Ra., Xinjiang, China" → "Karakoram Ra." for tight spaces; the full label stays available as a title. */
export const shortPlace = (label: string) => label.split(",")[0];

export const score2 = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toFixed(2));
export const count = (n: number) => n.toLocaleString("en-US");
