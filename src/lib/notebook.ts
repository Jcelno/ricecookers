// My Notebook: what this visitor has found. Every comparison opened is logged with its grade and date, and
// every search that finds no grade-A place on Earth is remembered as "a place Earth can't match".
// Counts and badges come only from real API results; nothing is awarded for clicking.
import { create } from "zustand";

import type { Grade, Planet } from "./types";

const KEY = "radium.notebook.v1";
const MAX = 200;

export interface NotebookEntry {
  id: string; at: string; body: Planet; target: { lat: number; lon: number; label: string };
  purpose: string; purposeLabel: string; earth: { lat: number; lon: number; label: string };
  grade: Grade | null; score: number | null; newLead: boolean; starred: boolean;
}
export interface Unmatched { id: string; at: string; body: Planet; target: { lat: number; lon: number; label: string }; purpose: string; purposeLabel: string; best: number | null }
export interface Badge { id: "new-lead" | "no-twin" | "all-purposes"; label: string; how: string }

export const BADGES: Badge[] = [
  { id: "new-lead", label: "Found a new lead", how: "Opened a good or excellent match that is not in the list of documented analog sites." },
  { id: "no-twin", label: "Found a place no Earth site matches", how: "Searched a site and purpose for which no place on Earth earns an A." },
  { id: "all-purposes", label: "Compared every purpose for one site", how: "Searched one Moon or Mars site for each thing it can be tested for." },
];

interface State {
  entries: NotebookEntry[];
  unmatched: Unmatched[];
  /** Purposes searched per target, to recognise "compared every purpose for one site". */
  searched: Record<string, string[]>;
  complete: string[];
  /** Ids of entries added since the Notebook was last opened (for the "New lead" shimmer and counter pop). */
  fresh: string[];
  logComparison: (e: Omit<NotebookEntry, "id" | "at" | "starred">) => { added: boolean; newLead: boolean };
  logSearch: (s: { body: Planet; target: { lat: number; lon: number; label: string }; purpose: string; purposeLabel: string; best: number | null; gradeA: number; purposes: string[] }) => void;
  toggleStar: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  seen: () => void;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const targetKey = (body: Planet, t: { lat: number; lon: number }) => `${body}:${r3(t.lat)},${r3(t.lon)}`;
const entryKey = (e: Pick<NotebookEntry, "body" | "target" | "purpose" | "earth">) => `${targetKey(e.body, e.target)}|${e.purpose}|${r3(e.earth.lat)},${r3(e.earth.lon)}`;

function read(): Pick<State, "entries" | "unmatched" | "searched" | "complete"> {
  const empty = { entries: [], unmatched: [], searched: {}, complete: [] };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!v || typeof v !== "object") return empty;
    const ok = (e: unknown): e is NotebookEntry => !!e && typeof e === "object" && typeof (e as NotebookEntry).id === "string" && Number.isFinite((e as NotebookEntry).target?.lat) && Number.isFinite((e as NotebookEntry).earth?.lat);
    return {
      entries: Array.isArray(v.entries) ? v.entries.filter(ok).slice(0, MAX) : [],
      unmatched: Array.isArray(v.unmatched) ? v.unmatched.filter((u: Unmatched) => u && typeof u.id === "string" && Number.isFinite(u.target?.lat)).slice(0, MAX) : [],
      searched: v.searched && typeof v.searched === "object" ? v.searched : {},
      complete: Array.isArray(v.complete) ? v.complete.filter((x: unknown) => typeof x === "string") : [],
    };
  } catch { return empty; }
}
function write(s: State) {
  try { localStorage.setItem(KEY, JSON.stringify({ entries: s.entries, unmatched: s.unmatched, searched: s.searched, complete: s.complete })); } catch { /* the notebook then lasts for this visit only */ }
}

export const useNotebook = create<State>((set, get) => ({
  ...read(),
  fresh: [],
  logComparison: (e) => {
    const s = get();
    const id = entryKey(e);
    const at = new Date().toISOString();
    const old = s.entries.find((x) => x.id === id);
    const entry: NotebookEntry = { ...e, id, at, starred: old?.starred ?? false };
    set({ entries: [entry, ...s.entries.filter((x) => x.id !== id)].slice(0, MAX), fresh: old ? s.fresh : [...s.fresh, id] });
    write(get());
    return { added: !old, newLead: !old && e.newLead && (e.grade === "A" || e.grade === "B") };
  },
  logSearch: ({ purposes, gradeA, ...u }) => {
    const s = get();
    const tk = targetKey(u.body, u.target);
    const done = [...new Set([...(s.searched[tk] ?? []), u.purpose])];
    const complete = purposes.length > 1 && purposes.every((p) => done.includes(p)) && !s.complete.includes(tk) ? [...s.complete, tk] : s.complete;
    const id = `${tk}|${u.purpose}`;
    const unmatched = gradeA === 0 ? [{ ...u, id, at: new Date().toISOString() }, ...s.unmatched.filter((x) => x.id !== id)].slice(0, MAX) : s.unmatched.filter((x) => x.id !== id);
    set({ searched: { ...s.searched, [tk]: done }, complete, unmatched });
    write(get());
  },
  toggleStar: (id) => { set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e)) })); write(get()); },
  remove: (id) => { set((s) => ({ entries: s.entries.filter((e) => e.id !== id), unmatched: s.unmatched.filter((u) => u.id !== id) })); write(get()); },
  clear: () => { set({ entries: [], unmatched: [], searched: {}, complete: [], fresh: [] }); write(get()); },
  seen: () => set({ fresh: [] }),
}));

/** The three Notebook counts, derived from the log. */
export function notebookCounts(s: Pick<State, "entries" | "unmatched">) {
  const twins = s.entries.filter((e) => e.grade === "A" || e.grade === "B");
  return { twins: twins.length, leads: twins.filter((e) => e.newLead).length, unmatched: s.unmatched.length, opened: s.entries.length };
}
export function earnedBadges(s: Pick<State, "entries" | "unmatched" | "complete">): Badge["id"][] {
  const c = notebookCounts(s);
  return [c.leads > 0 && "new-lead", c.unmatched > 0 && "no-twin", s.complete.length > 0 && "all-purposes"].filter(Boolean) as Badge["id"][];
}
