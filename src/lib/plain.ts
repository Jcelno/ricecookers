// Plain-English names for the interface. Internal ids and the API's labels are unchanged; these are what a
// first-time visitor reads. Each purpose is a verb with one line saying what gets compared.
import type { Planet } from "./types";

interface Verb { label: string; line: string }

const VERBS: Record<string, Verb & { moon?: Partial<Verb> }> = {
  general: { label: "Find an all-round twin", line: "A balance of terrain, rock type, bare ground and the rest." },
  mobility: { label: "Test rover driving", line: "Slopes, roughness and loose, bare ground." },
  ice: {
    label: "Practise ice drilling", line: "Frozen ground, cold and a dry, bare surface.",
    moon: { label: "Practise drilling for polar ice", line: "Frozen, ice-bearing ground like the Moon's poles." },
  },
  geology: {
    label: "Practise rock sampling", line: "The same kinds of rock, exposed at the surface.",
    moon: { label: "Practise rock sampling and processing", line: "The same kinds of rock, for geology and making materials." },
  },
  dust: { label: "Test dust on solar panels", line: "Airborne dust over dry, bare ground." },
  astrobiology: { label: "Search for signs of life", line: "Cold, dry places where life is at its limit." },
};

/** The verb form of a research purpose ("Rover mobility" → "Test rover driving"). */
export function purposeVerb(id: string, body: Planet, fallback?: string): Verb {
  const v = VERBS[id];
  if (!v) return { label: fallback ?? id, line: "" };
  return body === "moon" && v.moon ? { label: v.moon.label ?? v.label, line: v.moon.line ?? v.line } : { label: v.label, line: v.line };
}

/** What each compared quantity means, in a few words (the API calls these "dimensions"). */
export const DIMENSION_PLAIN: Record<string, { label: string; hint: string }> = {
  terrain: { label: "Terrain", hint: "slopes and roughness" },
  geology: { label: "Rock type", hint: "the kind of rock at the surface" },
  ice: { label: "Ice and frozen ground", hint: "how frozen the ground is" },
  environment: { label: "Bare, dry ground", hint: "no plants, little rain" },
  thermal: { label: "Ground temperature", hint: "yearly average" },
  dust: { label: "Airborne dust", hint: "how hazy the air is" },
};
export const dimensionLabel = (id: string, fallback: string) => DIMENSION_PLAIN[id]?.label ?? fallback;

/** "Coverage 100%" → "All data available"; anything less says how much of the comparison could be made. */
export function coverageText(coverage: number): string {
  return coverage >= 0.999 ? "All data available" : `${Math.round(coverage * 100)}% of the data available`;
}

export const WORLD_NAME: Record<"moon" | "mars" | "earth", string> = { moon: "the Moon", mars: "Mars", earth: "Earth" };
