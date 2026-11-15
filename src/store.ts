import { create } from "zustand";

import { api, ApiError } from "@/lib/api";
import type { Body, CellInfo, CompareResult, Grade, Meta, NearbyResult, Pin, Planet, RankResult, TwinResult } from "@/lib/types";

export type Mode = "explore" | "mission" | "twin" | "near" | "compare";
export type ColorBy = "grade" | "environment" | "application";
export type Units = "km" | "mi";
export interface BriefRequest { body: Planet; lat: number; lon: number; purpose: string; earth_lat: number; earth_lon: number }

// Miles by default only where they are the everyday unit; anyone can switch.
const defaultUnits = (): Units => {
  try { return /^(en-US|en-LR|my)/.test(navigator.language) ? "mi" : "km"; } catch { return "km"; }
};
export type Status = "idle" | "loading" | "ready" | "error";
export type Overlay = { kind: "tiles" | "grid"; id: string } | null;

export interface LayerState {
  base: string;
  overlay: Overlay;
  opacity: number;
  pins: { landing: boolean; feature: boolean; analog: boolean };
  labels: boolean;
}

export interface Focus { body: Body; lat: number; lon: number; spanKm?: number; nonce: number }

const DEFAULT_LAYERS: Record<Body, LayerState> = {
  moon: { base: "LRO_WAC_Mosaic_Global_303ppd_v02", overlay: null, opacity: 0.72, pins: { landing: true, feature: true, analog: false }, labels: true },
  mars: { base: "Mars_Viking_MDIM21_ClrMosaic_global_232m", overlay: null, opacity: 0.72, pins: { landing: true, feature: true, analog: false }, labels: true },
  earth: { base: "s2cloudless", overlay: null, opacity: 0.78, pins: { landing: false, feature: false, analog: true }, labels: true },
};

interface State {
  meta: Meta | null;
  metaError: string | null;
  pins: Record<Body, Pin[]>;

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
  rawWeights: Record<string, Record<string, number>>;
  limitsOn: Record<string, string[]>;
  rank: RankResult | null;
  rankStatus: Status;
  rankError: string | null;
  lastRanked: { mission: string; weights: Record<string, number>; limits: string[] } | null;
  showSuitability: boolean;

  twinOrigin: { body: Planet; lat: number; lon: number } | null;
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
  scenarioB: { mission: string; weights: Record<string, number>; limits: string[] } | null;

  leftOpen: boolean;
  rightOpen: boolean;
  sheet: null | "methodology" | "sources" | "intro" | "brief" | "scenarios";

  init: () => Promise<void>;
  setBody: (b: Body) => void;
  setMode: (m: Mode) => void;
  setLayer: (body: Body, patch: Partial<LayerState>) => void;
  setCursor: (c: State["cursor"]) => void;
  flyTo: (body: Body, lat: number, lon: number, spanKm?: number) => void;
  select: (body: Body, lat: number, lon: number, o?: { fly?: boolean; spanKm?: number }) => Promise<void>;
  clearSelection: () => void;
  refreshCell: () => Promise<void>;

  setMission: (id: string) => void;
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

export const useStore = create<State>((set, get) => ({
  meta: null,
  metaError: null,
  pins: { moon: [], mars: [], earth: [] },

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
  rawWeights: {},
  limitsOn: {},
  rank: null,
  rankStatus: "idle",
  rankError: null,
  lastRanked: null,
  showSuitability: true,

  twinOrigin: null,
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
  scenarioB: null,

  // On narrow screens panels float over the map, so they start closed.
  leftOpen: typeof window === "undefined" || window.innerWidth >= 1100,
  // The right panel opens at the start on every screen size: on phones it is a bottom sheet over the map,
  // so first-time visitors see what RADIUM is for. It can be closed.
  rightOpen: true,
  sheet: null,

  init: async () => {
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
    } catch (e) {
      set({ metaError: message(e) });
    }
  },

  setBody: (b) => {
    const s = get();
    if (s.body === b && s.mode !== "twin") return;
    let mode = s.mode;
    let missionId = s.missionId;
    if (mode === "twin" || mode === "near" || mode === "compare") mode = "explore";
    if (mode === "mission") {
      if (b === "earth") mode = "explore";
      else if (s.meta) {
        const cur = s.meta.missions.find((m) => m.id === missionId);
        if (cur?.body !== b) missionId = s.meta.missions.find((m) => m.body === b)!.id;
      }
    }
    document.documentElement.dataset.world = b;
    set({ body: b, mode, missionId, selection: null, cell: null, cellStatus: "idle", cursor: null, rank: mode === "mission" && missionId !== s.missionId ? null : s.rank });
    if (mode === "mission") void get().runRank();
  },

  setMode: (m) => {
    const s = get();
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

  setLayer: (body, patch) => set((s) => ({ layers: { ...s.layers, [body]: { ...s.layers[body], ...patch } } })),
  setCursor: (cursor) => set({ cursor }),
  flyTo: (body, lat, lon, spanKm) => set({ focus: { body, lat, lon, spanKm, nonce: ++nonce } }),

  select: async (body, lat, lon, o = {}) => {
    cellAbort?.abort();
    cellAbort = new AbortController();
    const s = get();
    set({ selection: { body, lat, lon }, cellStatus: "loading", cellError: null, rightOpen: true });
    if (o.fly) get().flyTo(body, lat, lon, o.spanKm);
    try {
      const mission = s.mode === "mission" && body !== "earth" ? s.missionId : undefined;
      const cell = await api.cell(body, lat, lon, mission ? { mission, weights: s.rawWeights[mission], limits: s.limitsOn[mission] } : {}, cellAbort.signal);
      set({ cell, cellStatus: "ready" });
    } catch (e) {
      if (aborted(e)) return;
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

  setWeight: (criterion, value) =>
    set((s) => ({ rawWeights: { ...s.rawWeights, [s.missionId]: { ...s.rawWeights[s.missionId], [criterion]: value } } })),

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
    set({ rankStatus: "loading", rankError: null });
    const prev = s.lastRanked && s.lastRanked.mission === mission ? s.lastRanked : null;
    try {
      const rank = await api.rank({ mission, weights, limits, n: 12, ...(prev ? { prev_weights: prev.weights, prev_limits: prev.limits } : {}) }, rankAbort.signal);
      set({ rank, rankStatus: "ready", lastRanked: { mission, weights: { ...weights }, limits: [...limits] } });
    } catch (e) {
      if (aborted(e)) return;
      set({ rankStatus: "error", rankError: message(e) });
    }
  },

  startTwin: (origin) => {
    const s = get();
    const sel = s.selection && s.selection.body !== "earth" ? (s.selection as { body: Planet; lat: number; lon: number }) : null;
    const o = origin ?? sel ?? s.twinOrigin;
    const body: Body = o?.body ?? (s.body === "earth" ? (s.twinOrigin?.body ?? "mars") : s.body);
    const purposes = s.meta?.purposes[body as Planet] ?? [];
    const purpose = purposes.some((p) => p.id === s.purpose) ? s.purpose : "general";
    document.documentElement.dataset.world = body;
    set({ mode: "twin", body, twinOrigin: o ?? null, purpose, twin: o && s.twinOrigin && o.lat === s.twinOrigin.lat && o.lon === s.twinOrigin.lon && o.body === s.twinOrigin.body ? s.twin : null, picked: null, compare: null, compareStatus: "idle", rightOpen: true });
    if (o) {
      if (!s.selection || s.selection.body !== o.body || s.selection.lat !== o.lat || s.selection.lon !== o.lon) void get().select(o.body, o.lat, o.lon);
      void get().runTwin();
    }
  },

  setPurpose: (purpose) => {
    set({ purpose, compare: null });
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
    set({ twinStatus: "loading", twinError: null });
    try {
      const twin = await api.twin({ ...s.twinOrigin, purpose: s.purpose, n: 10 }, twinAbort.signal);
      set({ twin, twinStatus: "ready" });
    } catch (e) {
      if (aborted(e)) return;
      set({ twinStatus: "error", twinError: message(e), twin: null });
    }
  },

  pickEarth: async (lat, lon, fly) => {
    const s = get();
    if (!s.twinOrigin) return;
    compareAbort?.abort();
    compareAbort = new AbortController();
    set({ picked: { lat, lon }, compareStatus: "loading", compareError: null, rightOpen: true });
    if (fly) get().flyTo("earth", lat, lon, 1400);
    try {
      const compare = await api.compare({ ...s.twinOrigin, purpose: s.purpose, earth_lat: lat, earth_lon: lon }, compareAbort.signal);
      set({ compare, compareStatus: "ready" });
    } catch (e) {
      if (aborted(e)) return;
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
    set({ nearStatus: "loading", nearError: null });
    try {
      const nearResult = await api.nearby({
        lat: s.nearLoc.lat, lon: s.nearLoc.lon, radius_km: s.nearRadius, mode: s.nearMode, documented_only: s.nearDocOnly, limit: 20,
        ...(target ? { body: target.body, target_lat: target.lat, target_lon: target.lon, purpose: s.purpose } : {}),
      }, nearAbort.signal);
      set({ nearResult, nearStatus: "ready", nearActive: null });
    } catch (e) {
      if (aborted(e)) return;
      set({ nearStatus: "error", nearError: message(e), nearResult: null });
    }
  },

  setTarget: (o) => {
    const s = get();
    const purposes = o ? s.meta?.purposes[o.body] ?? [] : [];
    const purpose = purposes.some((p) => p.id === s.purpose) ? s.purpose : "general";
    set({ twinOrigin: o, purpose, twin: null, picked: null, compare: null, ...(o ? {} : { nearMode: "nearest" as const }) });
    if (s.nearLoc) void get().runNearby();
  },

  openBrief: (earth) => {
    const s = get();
    if (!s.twinOrigin) return;
    set({ brief: { ...s.twinOrigin, purpose: s.purpose, earth_lat: earth.lat, earth_lon: earth.lon }, sheet: "brief" });
  },

  setPanel: (side, open) => set(side === "left" ? { leftOpen: open } : { rightOpen: open }),
  setSheet: (sheet) => set({ sheet }),
}));

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
