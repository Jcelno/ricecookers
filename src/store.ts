import { create } from "zustand";

import { api, ApiError } from "@/lib/api";
import { emitTour } from "@/lib/tour/events";
import { useNotebook } from "@/lib/notebook";
import { purposeVerb } from "@/lib/plain";
import { findings } from "@/lib/findings";
import { readSaved, writeSaved, sameSite, type SavedState, type SavedKind, type SavedSite, type SavedMission, type SavedComparison, type SavedContext, type SavedSource, type SiteRef } from "@/lib/persistence";
export type { SiteRef, SavedMission } from "@/lib/persistence";
import type { Body, CellInfo, CompareResult, Grade, Meta, NearbyResult, Pin, Planet, RankResult, TwinResult } from "@/lib/types";

export type Mode = "explore" | "mission" | "twin" | "near" | "compare" | "saved";
export type ColorBy = "grade" | "environment" | "application";
export type Units = "km" | "mi";
const initialSaved = readSaved();
export const COMPARE_MAX = 4;

export interface BriefRequest { body: Planet; lat: number; lon: number; purpose: string; earth_lat: number; earth_lon: number }

// Miles by default only where they are the everyday unit; anyone can switch.
const defaultUnits = (): Units => {
  try { return /^(en-US|en-LR|my)/.test(navigator.language) ? "mi" : "km"; } catch { return "km"; }
};
export type Status = "idle" | "loading" | "ready" | "error";
/** What a visitor asked for on the start screen. It is applied once the data service has answered. */
export type Intent =
  | { kind: "twin"; body: Planet }
  | { kind: "near" }
  | { kind: "rank" }
  | { kind: "explore" }
  | { kind: "demo" }
  | { kind: "link"; hash: string };
export type Sheet = null | "methodology" | "sources" | "help" | "findings" | "brief" | "scenarios" | "report";
export type Overlay = { kind: "tiles" | "grid"; id: string } | null;

export interface LayerState {
  base: string;
  overlay: Overlay;
  opacity: number;
  pins: { landing: boolean; feature: boolean; analog: boolean };
  labels: boolean;
  boundaries: boolean;
}

export interface Focus { body: Body; lat: number; lon: number; spanKm?: number; nonce: number }

const DEFAULT_LAYERS: Record<Body, LayerState> = {
  moon: { base: "LRO_WAC_Mosaic_Global_303ppd_v02", overlay: null, opacity: 0.72, pins: { landing: true, feature: true, analog: false }, labels: true, boundaries: true },
  mars: { base: "Mars_Viking_MDIM21_ClrMosaic_global_232m", overlay: null, opacity: 0.72, pins: { landing: true, feature: true, analog: false }, labels: true, boundaries: true },
  earth: { base: "s2cloudless", overlay: null, opacity: 0.78, pins: { landing: false, feature: false, analog: true }, labels: true, boundaries: true },
};

interface State {
  meta: Meta | null;
  metaError: string | null;
  pins: Record<Body, Pin[]>;
  /** False while the question chooser (start screen) is showing. */
  started: boolean;
  intent: Intent | null;
  /** When the app began asking the data service for its catalogue, for honest wake-up messages. */
  bootAt: number;

  body: Body;
  mode: Mode;
  layers: Record<Body, LayerState>;
  focus: Focus | null;
  cursor: { body: Body; lat: number; lon: number } | null;

  selection: { body: Body; lat: number; lon: number } | null;
  cell: CellInfo | null;
  cellStatus: Status;
  cellError: string | null;

  missionId: string;
  missionStep: "destination" | "mission" | "priorities" | "candidates" | "save";
  rawWeights: Record<string, Record<string, number>>;
  limitsOn: Record<string, string[]>;
  rank: RankResult | null;
  rankStatus: Status;
  rankError: string | null;
  lastRanked: { mission: string; weights: Record<string, number>; limits: string[] } | null;
  showSuitability: boolean;

  twinOrigin: { body: Planet; lat: number; lon: number } | null;
  /** Find Earth Twins step rail: 1 choose a site, 2 choose what to test, 3 results. */
  twinStep: 1 | 2 | 3;
  /** True on a first pass from the start screen: choosing a site leads to step 2 instead of straight to results. */
  twinGuided: boolean;
  purpose: string;
  twin: TwinResult | null;
  twinStatus: Status;
  twinError: string | null;
  showTwinOverlay: boolean;
  picked: { lat: number; lon: number } | null;
  compare: CompareResult | null;
  compareStatus: Status;
  compareError: string | null;

  // Earth Analogs atlas
  colorBy: ColorBy;
  gradeFilter: (Grade | "none")[];
  showDocumented: boolean;
  showModelled: boolean;
  catFilter: string[] | null;

  // Near Me. The location stays in this browser tab: it is sent only with a Near Me request and never put in share links.
  nearLoc: { lat: number; lon: number; source: "device" | "manual" | "map" | "search"; label?: string } | null;
  nearRadius: number;
  nearMode: "nearest" | "best";
  nearDocOnly: boolean;
  units: Units;
  nearResult: NearbyResult | null;
  nearStatus: Status;
  nearError: string | null;
  nearActive: string | null;

  brief: BriefRequest | null;
  compareList: SiteRef[];
  saved: SavedState;
  persistenceError: string | null;
  saveNotice: string | null;
  compareTab: "pair" | "sites";
  tempUnit: "K" | "C";
  twinWeights: Record<string, number> | null;
  /** Layer panel detail: plain-language (false) or full technical (true). */
  advanced: boolean;
  scenarioB: { mission: string; weights: Record<string, number>; limits: string[] } | null;

  leftOpen: boolean;
  rightOpen: boolean;
  sheet: Sheet;
  /** The 20-second example is driving the interface. */
  demo: boolean;

  init: () => Promise<void>;
  enter: (intent: Intent) => void;
  applyIntent: () => void;
  startOver: () => void;
  setTwinStep: (step: 1 | 2 | 3) => void;
  setBody: (b: Body) => void;
  setMode: (m: Mode) => void;
  setLayer: (body: Body, patch: Partial<LayerState>) => void;
  setCursor: (c: State["cursor"]) => void;
  flyTo: (body: Body, lat: number, lon: number, spanKm?: number) => void;
  select: (body: Body, lat: number, lon: number, o?: { fly?: boolean; spanKm?: number; source?: "marker" | "click" | "catalog" | "search" }) => Promise<void>;
  clearSelection: () => void;
  refreshCell: () => Promise<void>;

  setMission: (id: string) => void;
  setMissionStep: (step: State["missionStep"]) => void;
  setAdvanced: (advanced: boolean) => void;
  setWeight: (criterion: string, value: number) => void;
  resetWeights: () => void;
  toggleLimit: (id: string) => void;
  runRank: () => Promise<void>;

  startTwin: (origin?: { body: Planet; lat: number; lon: number }) => void;
  setPurpose: (p: string) => void;
  runTwin: () => Promise<void>;
  pickEarth: (lat: number, lon: number, fly?: boolean) => Promise<void>;
  clearPick: () => void;

  setAtlas: (patch: Partial<Pick<State, "colorBy" | "gradeFilter" | "showDocumented" | "showModelled" | "catFilter">>) => void;
  setNear: (patch: Partial<Pick<State, "nearLoc" | "nearRadius" | "nearMode" | "nearDocOnly" | "units" | "nearActive">>) => void;
  runNearby: () => Promise<void>;
  setTarget: (o: { body: Planet; lat: number; lon: number } | null) => void;
  addCompare: (s: SiteRef) => void;
  removeCompare: (i: number) => void;
  clearCompare: () => void;
  saveSite: (s: SiteRef) => void;
  saveMission: (name: string) => void;
  saveComparison: (name?: string, kind?: "pair" | "sites") => boolean;
  removeSaved: (kind: SavedKind, i: number) => void;
  renameSaved: (kind: SavedKind, i: number, name: string) => void;
  organizeSaved: (kind: SavedKind, i: number, collection: string) => void;
  openSaved: (kind: SavedKind, i: number) => Promise<void>;
  retryPersistence: () => void;
  setTwinWeights: (w: Record<string, number> | null) => void;
  openBrief: (earth: { lat: number; lon: number }) => void;

  setPanel: (side: "left" | "right", open: boolean) => void;
  setSheet: (s: State["sheet"]) => void;
}

export const ALL_GRADES: (Grade | "none")[] = ["A", "B", "C", "D", "F", "none"];

let cellAbort: AbortController | null = null;
let rankAbort: AbortController | null = null;
let twinAbort: AbortController | null = null;
let compareAbort: AbortController | null = null;
let nearAbort: AbortController | null = null;
let nonce = 0;

const message = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong.");
const aborted = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const weightKey = (weights: Record<string, number> | null) => JSON.stringify(Object.entries(weights ?? {}).sort(([a], [b]) => a.localeCompare(b)));
const comparisonKey = (c: SavedComparison) => `${c.kind}|${c.sites.map((x) => `${x.body}:${x.lat},${x.lon}`).join(";")}|${c.purpose}|${weightKey(c.weights)}`;
const uniqueSources = (sources: SavedSource[]) => sources.filter((s, i, all) => !!s.url && all.findIndex((x) => x.url === s.url) === i);
function cellSources(cell: CellInfo | null, s: State): SavedSource[] {
  return uniqueSources((cell?.groups ?? []).flatMap((g) => g.items).flatMap((m) => {
    const source = m.source ? s.meta?.sources_index[m.source] : null;
    return source ? [{ title: source.name, url: source.url, role: "scientific measurements" }] : [];
  }));
}
function enrichSite(site: SiteRef, s: State): SavedSite {
  const pin = s.pins[site.body].find((p) => sameSite(site, { body: site.body, ...p, label: p.name }));
  const selected = s.selection && sameSite(site, { ...s.selection, label: "" });
  const cell = selected && s.cellStatus === "ready" && s.cell?.body === site.body ? s.cell : null;
  const suitability = cell?.suitability;
  const context: SavedContext | undefined = suitability ? { model: "mission suitability", modelVersion: "RADIUM 1.0", purpose: suitability.mission,
    weights: Object.fromEntries(suitability.factors.map((f) => [f.id, f.weight * 100])), excluded: suitability.excluded, grade: suitability.excluded ? null : suitability.grade, score: suitability.score, coverage: suitability.coverage, assessedAt: new Date().toISOString() } : undefined;
  return { ...site, label: pin?.name ?? site.label, id: makeId(), created: new Date().toISOString(), collection: "", registry: pin ? structuredClone(pin) : undefined,
    sources: uniqueSources([...(pin?.sources ?? (pin?.link ? [{ title: pin.source || pin.name, url: pin.link, role: "site history" }] : [])), ...cellSources(cell, s)]), context };
}

/** A shared link, or a test that opts out of first-run screens, goes straight to its view; a bare address shows the question chooser. */
function arrivedWithView(): boolean {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("start") === "1") return false;
    return location.hash.length > 1 || q.get("tour") === "0" || q.get("start") === "0";
  } catch { return true; }
}

export const useStore = create<State>((set, get) => ({
  meta: null,
  metaError: null,
  pins: { moon: [], mars: [], earth: [] },
  started: arrivedWithView(),
  intent: null,
  bootAt: Date.now(),

  body: "moon",
  mode: "explore",
  layers: structuredClone(DEFAULT_LAYERS),
  focus: null,
  cursor: null,

  selection: null,
  cell: null,
  cellStatus: "idle",
  cellError: null,

  missionId: "lunar_base",
  missionStep: "destination",
  rawWeights: {},
  limitsOn: {},
  rank: null,
  rankStatus: "idle",
  rankError: null,
  lastRanked: null,
  showSuitability: true,

  twinOrigin: null,
  twinStep: 1,
  twinGuided: false,
  purpose: "general",
  twin: null,
  twinStatus: "idle",
  twinError: null,
  showTwinOverlay: true,
  picked: null,
  compare: null,
  compareStatus: "idle",
  compareError: null,

  colorBy: "grade",
  gradeFilter: [...ALL_GRADES],
  showDocumented: true,
  showModelled: true,
  catFilter: null,

  nearLoc: null,
  nearRadius: 1500,
  nearMode: "nearest",
  nearDocOnly: false,
  units: defaultUnits(),
  nearResult: null,
  nearStatus: "idle",
  nearError: null,
  nearActive: null,

  brief: null,
  compareList: [],
  saved: initialSaved.saved,
  persistenceError: initialSaved.error,
  saveNotice: null,
  compareTab: "sites",
  tempUnit: "K",
  twinWeights: null,
  advanced: false,
  scenarioB: null,

  // On narrow screens panels float over the map, so they start closed.
  // The map is the centrepiece: the layer panel starts collapsed below 1400 px (one click opens it).
  leftOpen: typeof window === "undefined" || window.innerWidth >= 1400,
  // The right panel opens at the start on every screen size: on phones it is a bottom sheet over the map,
  // so first-time visitors see what RADIUM is for. It can be closed.
  rightOpen: true,
  sheet: null,
  demo: false,

  enter: (intent) => {
    set({ started: true, intent });
    get().applyIntent();
  },
  // Runs when a start-screen choice is made and again when the catalogue arrives, whichever is later.
  applyIntent: () => {
    const s = get();
    const intent = s.intent;
    if (!intent || !s.meta) return;
    set({ intent: null });
    if (intent.kind === "twin") {
      twinAbort?.abort(); compareAbort?.abort(); cellAbort?.abort();
      document.documentElement.dataset.world = intent.body;
      set({ mode: "twin", body: intent.body, twinOrigin: null, twin: null, twinStatus: "idle", twinError: null, picked: null, compare: null, compareStatus: "idle",
        purpose: "general", twinWeights: null, twinStep: 1, twinGuided: true, selection: null, cell: null, cellStatus: "idle", rightOpen: true });
      emitTour("view:changed", { mode: "twin" });
    } else if (intent.kind === "near") get().setMode("near");
    else if (intent.kind === "rank") { get().setMode("mission"); get().setMissionStep("mission"); }
    else if (intent.kind === "explore") get().setMode("explore");
    else if (intent.kind === "demo") set({ demo: true });
    else if (intent.kind === "link") { try { history.replaceState(null, "", `${location.pathname}${location.search}${intent.hash}`); } catch { /* restricted embed */ } window.dispatchEvent(new HashChangeEvent("hashchange")); }
  },
  startOver: () => {
    set({ started: false, intent: null, demo: false, sheet: null });
    try { history.replaceState(null, "", `${location.pathname}${location.search}`); } catch { /* restricted embed */ }
  },
  setTwinStep: (twinStep) => set({ twinStep }),

  init: async () => {
    set({ metaError: null });
    try {
      const meta = await api.meta();
      const rawWeights: State["rawWeights"] = {};
      const limitsOn: State["limitsOn"] = {};
      for (const m of meta.missions) {
        rawWeights[m.id] = Object.fromEntries(m.criteria.map((c) => [c.id, Math.round(c.weight * 100)]));
        limitsOn[m.id] = m.limits.map((l) => l.id);
      }
      set({ meta, rawWeights, limitsOn, metaError: null });
      const [moon, mars, earth] = await Promise.all([api.pins("moon"), api.pins("mars"), api.pins("earth")]);
      set({ pins: { moon, mars, earth } });
      get().applyIntent();
    } catch (e) {
      set({ metaError: message(e) });
    }
  },

  setBody: (b) => {
    const s = get();
    if (s.body === b && (s.mode === "explore" || s.mode === "mission")) return;
    let mode = s.mode;
    let missionId = s.missionId;
    if (mode === "twin" || mode === "near" || mode === "compare" || mode === "saved") mode = "explore";
    if (mode === "mission") {
      if (b === "earth") mode = "explore";
      else if (s.meta) {
        const cur = s.meta.missions.find((m) => m.id === missionId);
        if (cur?.body !== b) missionId = s.meta.missions.find((m) => m.body === b)!.id;
      }
    }
    cellAbort?.abort();
    if (missionId !== s.missionId || b !== s.body) rankAbort?.abort();
    document.documentElement.dataset.world = b;
    set({ body: b, mode, missionId, selection: null, cell: null, cellStatus: "idle", cursor: null, rank: mode === "mission" && missionId !== s.missionId ? null : s.rank });
    if (b !== s.body) emitTour("body:changed", { body: b });
    if (mode === "mission") void get().runRank();
  },

  setMode: (m) => {
    const s = get();
    if (m !== s.mode) queueMicrotask(() => { if (get().mode === m) emitTour("view:changed", { mode: m }); });
    if (m === "mission") {
      let body = s.body;
      let missionId = s.missionId;
      const cur = s.meta?.missions.find((x) => x.id === missionId);
      if (body === "earth") body = cur?.body ?? "moon";
      else if (cur?.body !== body) missionId = s.meta?.missions.find((x) => x.body === body)?.id ?? missionId;
      document.documentElement.dataset.world = body;
      set({ mode: m, body, missionId, leftOpen: true, rightOpen: typeof window === "undefined" || window.innerWidth >= 1100 ? get().rightOpen : false });
      void get().runRank();
      void get().refreshCell();
      return;
    }
    if (m === "twin") {
      get().startTwin();
      return;
    }
    if (m === "compare") {
      if (s.twinOrigin) document.documentElement.dataset.world = s.twinOrigin.body;
      set({ mode: m });
      return;
    }
    if (m === "near") {
      document.documentElement.dataset.world = "earth";
      set({ mode: m, rightOpen: true, leftOpen: typeof window === "undefined" || window.innerWidth >= 760 });
      if (get().nearLoc) void get().runNearby();
      return;
    }
    document.documentElement.dataset.world = s.body;
    set({ mode: m });
    void get().refreshCell();
  },

  setLayer: (body, patch) => {
    const previous = get().layers[body].overlay;
    set((s) => ({ layers: { ...s.layers, [body]: { ...s.layers[body], ...patch } } }));
    if (patch.overlay && (previous?.id !== patch.overlay.id || previous?.kind !== patch.overlay.kind)) {
      emitTour("layer:enabled", { body, id: patch.overlay.id });
    }
  },
  setAdvanced: (advanced) => {
    const changed = get().advanced !== advanced;
    set({ advanced });
    if (changed) emitTour("layer:mode-changed", { advanced });
  },
  setCursor: (cursor) => set({ cursor }),
  flyTo: (body, lat, lon, spanKm) => set({ focus: { body, lat, lon, spanKm, nonce: ++nonce } }),

  select: async (body, lat, lon, o = {}) => {
    cellAbort?.abort();
    cellAbort = new AbortController();
    const signal = cellAbort.signal;
    const s = get();
    set({ selection: { body, lat, lon }, cellStatus: "loading", cellError: null, rightOpen: true });
    if (o.fly) get().flyTo(body, lat, lon, o.spanKm);
    try {
      const mission = body === "earth" ? undefined : s.meta?.missions.find(m => m.id === s.missionId && m.body === body)?.id ?? s.meta?.missions.find(m => m.body === body)?.id;
      const cell = await api.cell(body, lat, lon, mission ? { mission, weights: s.rawWeights[mission], limits: s.limitsOn[mission] } : {}, signal);
      if (signal.aborted) return;
      set({ cell, cellStatus: "ready" });
      if (o.source) emitTour("selection:set", { body, lat, lon, source: o.source });
    } catch (e) {
      if (signal.aborted || aborted(e)) return;
      set({ cellStatus: "error", cellError: message(e) });
    }
  },

  clearSelection: () => {
    cellAbort?.abort();
    set({ selection: null, cell: null, cellStatus: "idle", cellError: null });
  },

  refreshCell: async () => {
    const s = get();
    if (!s.selection || s.selection.body !== s.body) return;
    await get().select(s.selection.body, s.selection.lat, s.selection.lon);
  },

  setMission: (id) => {
    const m = get().meta?.missions.find((x) => x.id === id);
    if (!m) return;
    document.documentElement.dataset.world = m.body;
    const changedBody = m.body !== get().body;
    set((s) => ({ missionId: id, body: m.body, rank: null, lastRanked: null, ...(changedBody ? { selection: null, cell: null, cellStatus: "idle" as Status } : {}), mode: s.mode }));
    void get().runRank();
    void get().refreshCell();
  },

  setMissionStep: (missionStep) => {
    if (get().missionStep === missionStep) return;
    set({ missionStep });
    emitTour("mission:stepChanged", { step: missionStep });
  },

  setWeight: (criterion, value) => {
    if (get().rawWeights[get().missionId]?.[criterion] === value) return;
    set((s) => ({ rawWeights: { ...s.rawWeights, [s.missionId]: { ...s.rawWeights[s.missionId], [criterion]: value } } }));
    emitTour("mission:weightChanged", { criterion, value });
  },

  resetWeights: () => {
    const s = get();
    const m = s.meta?.missions.find((x) => x.id === s.missionId);
    if (!m) return;
    set({
      rawWeights: { ...s.rawWeights, [m.id]: Object.fromEntries(m.criteria.map((c) => [c.id, Math.round(c.weight * 100)])) },
      limitsOn: { ...s.limitsOn, [m.id]: m.limits.map((l) => l.id) },
    });
    void get().runRank();
    void get().refreshCell();
  },

  toggleLimit: (id) => {
    set((s) => {
      const cur = s.limitsOn[s.missionId] ?? [];
      return { limitsOn: { ...s.limitsOn, [s.missionId]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } };
    });
    emitTour("mission:hardLimitToggled", { id, enabled: get().limitsOn[get().missionId].includes(id) });
    void get().runRank();
    void get().refreshCell();
  },

  runRank: async () => {
    const s = get();
    const mission = s.missionId;
    const weights = s.rawWeights[mission];
    const limits = s.limitsOn[mission];
    if (!weights) return;
    rankAbort?.abort();
    rankAbort = new AbortController();
    const signal = rankAbort.signal;
    set({ rankStatus: "loading", rankError: null });
    const prev = s.lastRanked && s.lastRanked.mission === mission ? s.lastRanked : null;
    try {
      const rank = await api.rank({ mission, weights, limits, n: 12, ...(prev ? { prev_weights: prev.weights, prev_limits: prev.limits } : {}) }, signal);
      if (signal.aborted) return;
      set({ rank, rankStatus: "ready", lastRanked: { mission, weights: { ...weights }, limits: [...limits] } });
    } catch (e) {
      if (signal.aborted || aborted(e)) return;
      set({ rankStatus: "error", rankError: message(e) });
    }
  },

  startTwin: (origin) => {
    const s = get();
    const sel = s.selection && s.selection.body !== "earth" ? (s.selection as { body: Planet; lat: number; lon: number }) : null;
    const inAnalogs = s.mode === "twin" || s.mode === "near" || s.mode === "compare";
    const o = origin ?? (inAnalogs ? s.twinOrigin ?? sel : sel ?? s.twinOrigin);
    const body: Body = o?.body ?? (s.body === "earth" ? (s.twinOrigin?.body ?? "mars") : s.body);
    const purposes = s.meta?.purposes[body as Planet] ?? [];
    const purpose = purposes.some((p) => p.id === s.purpose) ? s.purpose : "general";
    const sameTarget = !!o && !!s.twinOrigin && sameSite({ ...o, label: "" }, { ...s.twinOrigin, label: "" });
    if (!sameTarget) { twinAbort?.abort(); compareAbort?.abort(); }
    document.documentElement.dataset.world = body;
    set({ mode: "twin", body, twinOrigin: o ?? null, twinStep: o ? (s.twinGuided && !sameTarget ? 2 : s.twinGuided ? s.twinStep : 3) : 1, purpose, twinWeights: purpose !== s.purpose ? null : s.twinWeights, twin: o && s.twinOrigin && o.lat === s.twinOrigin.lat && o.lon === s.twinOrigin.lon && o.body === s.twinOrigin.body ? s.twin : null, picked: sameTarget ? s.picked : null, compare: sameTarget ? s.compare : null, compareStatus: sameTarget ? s.compareStatus : "idle", rightOpen: true });
    if (o) {
      if (!s.selection || s.selection.body !== o.body || s.selection.lat !== o.lat || s.selection.lon !== o.lon) void get().select(o.body, o.lat, o.lon);
      void get().runTwin();
    }
  },

  setPurpose: (purpose) => {
    compareAbort?.abort();
    set({ purpose, compare: null, compareStatus: "idle", twinWeights: null, twinStep: get().twinOrigin ? 3 : 1, twinGuided: false });
    emitTour("twin:purposeChanged", { purpose });
    if (get().mode === "near" && get().nearLoc) void get().runNearby();
    void get().runTwin().then(() => {
      const p = get().picked;
      if (p) void get().pickEarth(p.lat, p.lon);
    });
  },

  runTwin: async () => {
    const s = get();
    if (!s.twinOrigin) return;
    twinAbort?.abort();
    twinAbort = new AbortController();
    const signal = twinAbort.signal;
    set({ twinStatus: "loading", twinError: null });
    try {
      const twin = await api.twin({ ...s.twinOrigin, purpose: s.purpose, n: 10, ...(s.twinWeights ? { weights: s.twinWeights } : {}) }, signal);
      if (signal.aborted) return;
      set({ twin, twinStatus: "ready" });
      // A search the visitor asked to see (not the quiet one that checks which purposes apply) goes in the Notebook.
      if (get().twinStep === 3 && !s.twinWeights) {
        useNotebook.getState().logSearch({ body: s.twinOrigin.body, target: { ...s.twinOrigin, label: targetLabel(get(), s.twinOrigin, twin.planet.place.label) }, purpose: s.purpose,
          purposeLabel: purposeVerb(s.purpose, s.twinOrigin.body).label, best: twin.distribution.best, gradeA: twin.distribution.grades.A,
          purposes: twin.purposes.filter((p) => p.applicable).map((p) => p.id) });
      }
      emitTour("twin:started", { ...s.twinOrigin });
    } catch (e) {
      if (signal.aborted || aborted(e)) return;
      set({ twinStatus: "error", twinError: message(e), twin: null });
    }
  },

  pickEarth: async (lat, lon, fly) => {
    const s = get();
    if (!s.twinOrigin) return;
    compareAbort?.abort();
    compareAbort = new AbortController();
    const signal = compareAbort.signal;
    set({ picked: { lat, lon }, compareTab: "pair", compare: null, compareStatus: "loading", compareError: null, rightOpen: true });
    if (fly) get().flyTo("earth", lat, lon, 1400);
    try {
      const compare = await api.compare({ ...s.twinOrigin, purpose: s.purpose, earth_lat: lat, earth_lon: lon, ...(s.twinWeights ? { weights: s.twinWeights } : {}) }, signal);
      if (signal.aborted) return;
      set({ compare, compareStatus: "ready" });
      if (compare.earth.analysed && !s.twinWeights) {
        useNotebook.getState().logComparison({ body: s.twinOrigin.body, target: { ...s.twinOrigin, label: targetLabel(get(), s.twinOrigin, compare.planet.place.label) }, purpose: s.purpose,
          purposeLabel: purposeVerb(s.purpose, s.twinOrigin.body).label, earth: { lat: compare.earth.cell.lat, lon: compare.earth.cell.lon, label: compare.earth.place.label },
          grade: compare.match.grade, score: compare.match.score, newLead: !compare.documented });
      }
    } catch (e) {
      if (signal.aborted || aborted(e)) return;
      set({ compareStatus: "error", compareError: message(e) });
    }
  },

  clearPick: () => {
    compareAbort?.abort();
    set({ picked: null, compare: null, compareStatus: "idle", compareError: null });
  },

  setAtlas: (patch) => set(patch),

  setNear: (patch) => {
    // Switching units snaps the radius to the nearest round value in the new unit.
    if (patch.units && patch.units !== get().units && patch.nearRadius === undefined && get().nearRadius < 20000) {
      const opts = patch.units === "mi" ? [150, 300, 600, 1000, 2000, 4000].map((m) => Math.round(m * 1.609344)) : [250, 500, 1000, 1500, 3000, 6000];
      patch = { ...patch, nearRadius: opts.reduce((a, b) => (Math.abs(b - get().nearRadius) < Math.abs(a - get().nearRadius) ? b : a)) };
    }
    set(patch);
    const keys = Object.keys(patch);
    if (keys.some((k) => k !== "nearActive") && get().nearLoc) void get().runNearby();
  },

  runNearby: async () => {
    const s = get();
    if (!s.nearLoc) return;
    const target = s.twinOrigin;
    if (s.nearMode === "best" && !target) {
      set({ nearStatus: "error", nearError: "Choose a Moon or Mars target to rank by similarity, or rank by distance instead.", nearResult: null });
      return;
    }
    nearAbort?.abort();
    nearAbort = new AbortController();
    const signal = nearAbort.signal;
    set({ nearStatus: "loading", nearError: null });
    try {
      const nearResult = await api.nearby({
        lat: s.nearLoc.lat, lon: s.nearLoc.lon, radius_km: s.nearRadius, mode: s.nearMode, documented_only: s.nearDocOnly, limit: 20,
        ...(target ? { body: target.body, target_lat: target.lat, target_lon: target.lon, purpose: s.purpose, ...(s.twinWeights ? { weights: s.twinWeights } : {}) } : {}),
      }, signal);
      if (signal.aborted) return;
      set({ nearResult, nearStatus: "ready", nearActive: null });
      emitTour("near:searched", { count: nearResult.documented.length + nearResult.regions.length });
    } catch (e) {
      if (signal.aborted || aborted(e)) return;
      set({ nearStatus: "error", nearError: message(e), nearResult: null });
    }
  },

  setTarget: (o) => {
    const s = get();
    const purposes = o ? s.meta?.purposes[o.body] ?? [] : [];
    const purpose = purposes.some((p) => p.id === s.purpose) ? s.purpose : "general";
    twinAbort?.abort(); compareAbort?.abort();
    const picked = o && s.mode === "compare" ? s.picked : null;
    set({ twinOrigin: o, twinStep: o ? (s.twinGuided ? 2 : 3) : 1, purpose, twin: null, twinStatus: "idle", twinWeights: purpose !== s.purpose ? null : s.twinWeights,
      picked, compare: null, compareStatus: "idle", ...(o ? { body: o.body } : { nearMode: "nearest" as const }) });
    if (o) {
      document.documentElement.dataset.world = s.mode === "near" ? "earth" : o.body;
      if (s.mode === "twin" || s.mode === "compare") {
        void get().select(o.body, o.lat, o.lon, { fly: true });
        void get().runTwin();
        if (picked) void get().pickEarth(picked.lat, picked.lon);
      }
    }
    if (s.nearLoc) void get().runNearby();
  },

  addCompare: (site) => {
    const s = get();
    if (s.compareList.some((x) => sameSite(x, site))) return;
    set({ compareList: [...s.compareList, site].slice(-COMPARE_MAX), compareTab: "sites" });
    emitTour("compare:added", { body: site.body, lat: site.lat, lon: site.lon });
  },
  removeCompare: (i) => set((s) => ({ compareList: s.compareList.filter((_, k) => k !== i) })),
  clearCompare: () => set({ compareList: [] }),
  saveSite: (site) => {
    const s = get();
    if (s.saved.sites.some((x) => sameSite(x, site))) { set({ saveNotice: "This place is already saved." }); return; }
    const saved = { ...s.saved, sites: [enrichSite(site, s), ...s.saved.sites] };
    set({ saved, persistenceError: writeSaved(saved), saveNotice: "Place saved to your research workspace." });
    emitTour("save:added", { kind: "site" });
  },
  saveMission: (name) => {
    const s = get();
    const mission = s.meta?.missions.find((m) => m.id === s.missionId);
    if (!mission) return;
    const sel = s.selection?.body === mission.body ? enrichSite({ ...s.selection, label: s.cell?.place.label ?? `${mission.body} destination` }, s) : null;
    const weights = { ...s.rawWeights[s.missionId] };
    const limits = [...(s.limitsOn[s.missionId] ?? [])];
    if (s.saved.missions.some((m) => m.mission === s.missionId && weightKey(m.weights) === weightKey(weights) && [...m.limits].sort().join() === [...limits].sort().join() && (m.site && sel ? sameSite(m.site, sel) : m.site === sel))) {
      set({ saveNotice: "A mission with these settings and destination is already saved." }); return;
    }
    const m: SavedMission = { id: makeId(), name: name.trim().slice(0, 160) || mission.label, mission: s.missionId, weights, limits, site: sel,
      created: new Date().toISOString(), collection: "", context: sel?.context, sources: sel?.sources ?? [] };
    const saved = { ...s.saved, missions: [m, ...s.saved.missions] };
    set({ saved, persistenceError: writeSaved(saved), saveNotice: "Mission and its settings saved." });
    emitTour("save:added", { kind: "mission" });
  },
  saveComparison: (name, kind = get().compareTab) => {
    const s = get();
    let comparison: SavedComparison;
    if (kind === "pair") {
      if (!s.twinOrigin || !s.picked || !s.compare || s.compareStatus !== "ready") { set({ saveNotice: "Wait for a complete comparison before saving." }); return false; }
      const target = enrichSite({ ...s.twinOrigin, label: s.compare.planet.place.label }, s) as SavedSite & { body: Planet };
      const earth = enrichSite({ body: "earth", ...s.picked, label: s.compare.earth.place.label }, s);
      const weights = s.twinWeights ? { ...s.twinWeights } : null;
      const match = s.compare.match;
      comparison = { id: makeId(), name: name?.trim().slice(0, 160) || `${target.label} × ${earth.label}`, kind, sites: [target, earth], target, earth,
        purpose: s.purpose, weights, created: new Date().toISOString(), collection: "", sources: uniqueSources([...target.sources ?? [], ...earth.sources ?? [], ...cellSources(s.compare.planet, s), ...cellSources(s.compare.earth, s)]),
        context: { model: "analog similarity", modelVersion: "RADIUM 1.0", purpose: s.purpose, weights: weights ?? Object.fromEntries(match.dimensions.map((d) => [d.id, d.weight * 100])), grade: match.grade, score: match.score, coverage: match.coverage, assessedAt: new Date().toISOString() },
        dimensions: match.dimensions.map(({ id, label, score, grade, weight }) => ({ id, label, score, grade, weight })) };
    } else {
      if (s.compareList.length < 2) { set({ saveNotice: "Add at least two places to save a comparison." }); return false; }
      const sites = s.compareList.map((site) => enrichSite(site, s));
      comparison = { id: makeId(), name: name?.trim().slice(0, 160) || sites.map((x) => x.label).join(" × "), kind, sites, purpose: "measured environments", weights: null, created: new Date().toISOString(), collection: "", sources: uniqueSources(sites.flatMap((x) => x.sources ?? [])) };
    }
    if (s.saved.comparisons.some((c) => comparisonKey(c) === comparisonKey(comparison))) { set({ saveNotice: "This comparison and its settings are already saved." }); return true; }
    const saved = { ...s.saved, comparisons: [comparison, ...s.saved.comparisons] };
    set({ saved, persistenceError: writeSaved(saved), saveNotice: "Comparison, sources and model context saved." });
    emitTour("save:added", { kind: "comparison" });
    return true;
  },
  removeSaved: (kind, i) => {
    const s = get();
    const saved = { ...s.saved, [kind]: s.saved[kind].filter((_, k) => k !== i) } as SavedState;
    set({ saved, persistenceError: writeSaved(saved), saveNotice: "Removed from saved research." });
  },
  renameSaved: (kind, i, name) => {
    if (!name.trim()) return;
    const s = get();
    const saved = { ...s.saved, [kind]: s.saved[kind].map((item, k) => k === i ? { ...item, [kind === "sites" ? "label" : "name"]: name.trim().slice(0, 160) } : item) } as SavedState;
    set({ saved, persistenceError: writeSaved(saved), saveNotice: "Research renamed." });
  },
  organizeSaved: (kind, i, collection) => {
    const s = get();
    const saved = { ...s.saved, [kind]: s.saved[kind].map((item, k) => k === i ? { ...item, collection: collection.trim().slice(0, 80) } : item) } as SavedState;
    set({ saved, persistenceError: writeSaved(saved), saveNotice: "Collection updated." });
  },
  openSaved: async (kind, i) => {
    const s = get();
    if (kind === "sites") {
      const site = s.saved.sites[i]; if (!site) return;
      get().setBody(site.body); get().setMode("explore");
      await get().select(site.body, site.lat, site.lon, { fly: true });
    } else if (kind === "missions") {
      const m = s.saved.missions[i]; if (!m) return;
      const mission = s.meta?.missions.find((x) => x.id === m.mission);
      if (!mission) { set({ saveNotice: "This saved mission type is no longer available." }); return; }
      const weights = Object.fromEntries(mission.criteria.map((c) => [c.id, m.weights[c.id] ?? Math.round(c.weight * 100)]));
      const limits = m.limits.filter((l) => mission.limits.some((x) => x.id === l));
      cellAbort?.abort(); rankAbort?.abort();
      set({ mode: "mission", body: mission.body, missionId: mission.id, rawWeights: { ...s.rawWeights, [mission.id]: weights },
        limitsOn: { ...s.limitsOn, [mission.id]: limits }, selection: null, cell: null, cellStatus: "idle", rank: null, lastRanked: null, leftOpen: true, rightOpen: !!m.site });
      document.documentElement.dataset.world = mission.body;
      await Promise.all([get().runRank(), m.site ? get().select(m.site.body, m.site.lat, m.site.lon, { fly: true }) : Promise.resolve()]);
    } else {
      const c = s.saved.comparisons[i]; if (!c) return;
      if (c.kind === "sites") {
        set({ compareList: c.sites.map(({ body, lat, lon, label }) => ({ body, lat, lon, label })), compareTab: "sites" });
        get().setMode("compare");
      } else if (c.target && c.earth) {
        const target = c.target;
        const purpose = s.meta?.purposes[target.body].some((p) => p.id === c.purpose) ? c.purpose : "general";
        twinAbort?.abort(); compareAbort?.abort();
        set({ mode: "compare", body: target.body, twinOrigin: target, purpose, twinWeights: c.weights, picked: null, compare: null, compareStatus: "idle", twin: null, twinStatus: "idle", compareTab: "pair" });
        document.documentElement.dataset.world = target.body;
        await Promise.all([get().runTwin(), get().pickEarth(c.earth.lat, c.earth.lon, true)]);
      }
    }
  },
  retryPersistence: () => set({ persistenceError: writeSaved(get().saved) }),
  setTwinWeights: (w) => {
    compareAbort?.abort();
    set({ twinWeights: w, compare: null, compareStatus: "idle" });
    void get().runTwin().then(() => { const p = get().picked; if (p) void get().pickEarth(p.lat, p.lon); });
    if (get().mode === "near" && get().nearLoc) void get().runNearby();
  },

  openBrief: (earth) => {
    const s = get();
    if (!s.twinOrigin) return;
    set({ brief: { ...s.twinOrigin, purpose: s.purpose, earth_lat: earth.lat, earth_lon: earth.lon }, sheet: "brief" });
    emitTour("brief:opened", {});
  },

  setPanel: (side, open) => set(side === "left" ? { leftOpen: open } : { rightOpen: open }),
  setSheet: (sheet) => { set({ sheet }); if (sheet) emitTour("sheet:opened", { sheet }); },
}));

/** The name a visitor knows a target by: a famous site, a catalogued place, or else the computed place label. */
export function targetLabel(s: Pick<State, "pins">, t: { body: Planet; lat: number; lon: number }, fallback: string): string {
  const near = (a: { lat: number; lon: number }) => Math.abs(a.lat - t.lat) < 0.01 && Math.abs(a.lon - t.lon) < 0.01;
  return findings.famous.find((f) => f.body === t.body && near(f))?.name ?? s.pins[t.body].find(near)?.name ?? fallback;
}

export const currentMission = (s: State) => s.meta?.missions.find((m) => m.id === s.missionId) ?? null;

/** Shares of the score implied by the raw slider values (they always sum to 1). */
export function shares(raw: Record<string, number> | undefined): Record<string, number> {
  if (!raw) return {};
  const total = Object.values(raw).reduce((a, b) => a + Math.max(0, b), 0);
  const n = Object.keys(raw).length;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, total > 0 ? Math.max(0, v) / total : 1 / n]));
}

// Development aid: lets the screenshot script drive the app (`window.__radium.getState()`).
if (import.meta.env.DEV) (window as unknown as { __radium: typeof useStore }).__radium = useStore;
