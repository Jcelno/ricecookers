import type { Body, Grade, Pin, Planet } from "./types";

export interface SiteRef {
  body: Body;
  lat: number;
  lon: number;
  label: string;
}
export interface SavedSource {
  title: string;
  url: string;
  role?: string;
}
export interface SavedContext {
  model: "mission suitability" | "analog similarity";
  modelVersion: string;
  purpose: string;
  weights: Record<string, number>;
  grade: Grade | null;
  score: number | null;
  coverage: number;
  assessedAt: string;
  excluded?: boolean;
}
export interface SavedSite extends SiteRef {
  id?: string;
  created?: string;
  collection?: string;
  sources?: SavedSource[];
  registry?: Pin;
  context?: SavedContext;
}
export interface SavedMission {
  id: string;
  name: string;
  mission: string;
  weights: Record<string, number>;
  limits: string[];
  site: SavedSite | null;
  created: string;
  collection?: string;
  context?: SavedContext;
  sources?: SavedSource[];
}
export interface SavedComparison {
  id: string;
  name: string;
  kind: "pair" | "sites";
  sites: SavedSite[];
  created: string;
  collection?: string;
  purpose: string;
  weights: Record<string, number> | null;
  context?: SavedContext;
  sources: SavedSource[];
  target?: SiteRef & { body: Planet };
  earth?: SiteRef;
  dimensions?: {
    id: string;
    label: string;
    score: number | null;
    grade: Grade | null;
    weight: number;
  }[];
}
export interface SavedState {
  version: 2;
  sites: SavedSite[];
  missions: SavedMission[];
  comparisons: SavedComparison[];
}
export type SavedKind = "sites" | "missions" | "comparisons";
export const SAVED_KEY = "radium.saved.v2";
export const LEGACY_SAVED_KEY = "radium.saved.v1";
export const emptySaved = (): SavedState => ({
  version: 2,
  sites: [],
  missions: [],
  comparisons: [],
});
export const sameSite = (a: SiteRef, b: SiteRef) =>
  a.body === b.body &&
  Math.abs(a.lat - b.lat) < 1e-6 &&
  Math.abs(a.lon - b.lon) < 1e-6;
const record = (v: unknown): v is Record<string, any> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const validWeights = (v: unknown): v is Record<string, number> =>
  record(v) &&
  Object.values(v).every(
    (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100,
  );
export const validSite = (v: unknown): v is SavedSite =>
  record(v) &&
  ["earth", "moon", "mars"].includes(v.body) &&
  typeof v.lat === "number" &&
  Number.isFinite(v.lat) &&
  Math.abs(v.lat) <= 90 &&
  typeof v.lon === "number" &&
  Number.isFinite(v.lon) &&
  Math.abs(v.lon) <= 180 &&
  typeof v.label === "string";
const sources = (v: unknown): SavedSource[] =>
  Array.isArray(v)
    ? v.filter(
        (s) =>
          record(s) &&
          typeof s.title === "string" &&
          typeof s.url === "string" &&
          /^https?:\/\//.test(s.url),
      )
    : [];
const context = (v: unknown): SavedContext | undefined =>
  record(v) &&
  ["mission suitability", "analog similarity"].includes(v.model) &&
  typeof v.modelVersion === "string" &&
  typeof v.purpose === "string" &&
  validWeights(v.weights) &&
  (v.grade === null || ["A", "B", "C", "D", "F"].includes(v.grade)) &&
  (v.score === null ||
    (typeof v.score === "number" &&
      Number.isFinite(v.score) &&
      v.score >= 0 &&
      v.score <= 1)) &&
  typeof v.coverage === "number" &&
  Number.isFinite(v.coverage) &&
  v.coverage >= 0 &&
  v.coverage <= 1 &&
  typeof v.assessedAt === "string"
    ? (v as SavedContext)
    : undefined;
const cleanSite = (s: SavedSite): SavedSite => ({
  ...s,
  collection: typeof s.collection === "string" ? s.collection.slice(0, 80) : "",
  sources: sources(s.sources),
  context: context(s.context),
  registry:
    record(s.registry) && typeof s.registry.name === "string"
      ? s.registry
      : undefined,
});

/** Validate the browser payload without letting a malformed record break the whole workspace. */
export function parseSaved(input: unknown): {
  saved: SavedState;
  rejected: number;
} {
  if (
    !record(input) ||
    !Array.isArray(input.sites) ||
    !Array.isArray(input.missions)
  )
    throw new Error("Invalid saved workspace");
  const saved = emptySaved();
  let rejected = 0;
  for (const v of input.sites) {
    if (!validSite(v)) {
      rejected++;
      continue;
    }
    if (!saved.sites.some((s) => sameSite(s, v)))
      saved.sites.push(cleanSite(v));
  }
  for (const v of input.missions) {
    if (
      !record(v) ||
      typeof v.id !== "string" ||
      typeof v.name !== "string" ||
      typeof v.mission !== "string" ||
      !validWeights(v.weights) ||
      !Array.isArray(v.limits) ||
      !v.limits.every((x: unknown) => typeof x === "string") ||
      (v.site !== null && !validSite(v.site)) ||
      typeof v.created !== "string"
    ) {
      rejected++;
      continue;
    }
    saved.missions.push({
      ...v,
      collection:
        typeof v.collection === "string" ? v.collection.slice(0, 80) : "",
      site: v.site ? cleanSite(v.site) : null,
      sources: sources(v.sources),
      context: context(v.context),
    } as SavedMission);
  }
  for (const v of Array.isArray(input.comparisons) ? input.comparisons : []) {
    if (
      !record(v) ||
      typeof v.id !== "string" ||
      typeof v.name !== "string" ||
      !["sites", "pair"].includes(v.kind) ||
      !Array.isArray(v.sites) ||
      v.sites.length < 2 ||
      v.sites.length > 4 ||
      !v.sites.every(validSite) ||
      typeof v.created !== "string" ||
      typeof v.purpose !== "string" ||
      (v.weights !== null && !validWeights(v.weights)) ||
      (v.kind === "pair" &&
        (!validSite(v.target) ||
          v.target.body === "earth" ||
          !validSite(v.earth) ||
          v.earth.body !== "earth"))
    ) {
      rejected++;
      continue;
    }
    saved.comparisons.push({
      ...v,
      sites: v.sites.map(cleanSite),
      collection:
        typeof v.collection === "string" ? v.collection.slice(0, 80) : "",
      sources: sources(v.sources),
      context: context(v.context),
      dimensions: Array.isArray(v.dimensions)
        ? v.dimensions.filter(
            (d: unknown) =>
              record(d) &&
              typeof d.label === "string" &&
              (d.score === null || typeof d.score === "number"),
          )
        : [],
    } as SavedComparison);
  }
  return { saved, rejected };
}

export function readSaved(storage?: Pick<Storage, "getItem" | "setItem">): {
  saved: SavedState;
  error: string | null;
} {
  try {
    const target = storage ?? window.localStorage;
    const current = target.getItem(SAVED_KEY);
    const raw = current ?? target.getItem(LEGACY_SAVED_KEY);
    if (raw === null) return { saved: emptySaved(), error: null };
    const { saved, rejected } = parseSaved(JSON.parse(raw));
    let error = rejected
      ? `${rejected} invalid saved record${rejected === 1 ? " was" : "s were"} skipped. The original browser data has been retained.`
      : null;
    // Never remove the old key: it remains a recovery copy after migration.
    if (current === null && rejected === 0)
      error = writeSaved(saved, target) ?? error;
    return { saved, error };
  } catch {
    return {
      saved: emptySaved(),
      error:
        "Saved research could not be read. Browser storage may be blocked or the saved data may be damaged. The original data has been retained.",
    };
  }
}
export function writeSaved(
  saved: SavedState,
  storage?: Pick<Storage, "setItem">,
): string | null {
  try {
    (storage ?? window.localStorage).setItem(SAVED_KEY, JSON.stringify(saved));
    return null;
  } catch {
    return "Browser storage is unavailable or full. Changes are kept in this tab only; export your research before closing it.";
  }
}
