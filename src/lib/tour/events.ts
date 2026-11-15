import type { Body } from "@/lib/types";

/** Semantic events come from successful application actions, never document clicks. */
export interface TourPayloads {
  "ready:frame": { body: Body };
  "body:changed": { body: Body };
  "map:moved": { body?: Body; altitudeKm?: number };
  "map:zoomed": { body?: Body; altitudeKm?: number };
  "selection:set": { source: "marker" | "click" | "catalog" | "search"; body?: Body; lat?: number; lon?: number };
  "layer:enabled": { body?: Body; id: string };
  "layer:mode-changed": { advanced?: boolean; mode?: string };
  "locationTab:changed": { tab: string };
  "catalog:opened": Record<string, never>;
  "catalog:filtered": { query?: string; filter?: string };
  "mission:stepChanged": { step: string };
  "mission:weightChanged": { criterion: string; value: number };
  "mission:hardLimitToggled": { id: string; enabled?: boolean };
  "twin:started": { body?: Body; lat?: number; lon?: number };
  "twin:purposeChanged": { purpose: string };
  "compare:added": { body?: Body; lat?: number; lon?: number };
  "near:searched": { count?: number };
  "save:added": { kind?: string };
  "link:copied": { url?: string };
  "brief:opened": Record<string, never>;
  "view:changed": { mode: string };
  "sheet:opened": { sheet: string };
  "widget:answered": { id: string };
  "tutorial:changed": { completed?: string[]; stepId?: string; running?: boolean; welcome?: boolean };
}
export type TourEvent = keyof TourPayloads;
export type TourSignal = { [K in TourEvent]: { type: K; payload: TourPayloads[K] } }[TourEvent];
const listeners = new Set<(event: TourSignal) => void>();
export function emitTour<K extends TourEvent>(type: K, payload: TourPayloads[K]) {
  const event = { type, payload } as TourSignal;
  for (const listener of [...listeners]) listener(event);
}
export function onTour(listener: (event: TourSignal) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
