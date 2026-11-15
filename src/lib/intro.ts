import { emitTour } from "@/lib/tour/events";

const SEEN_KEY = "radium.intro.v2";
const PROGRESS_KEY = "radium.tutorial.v3";
export const QUICK_IDS = ["pick-world", "move-map", "select-site", "read-grade", "turn-on-layer", "find-twin", "save-it"] as const;
export function introSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; }
}
export function markIntroSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* nothing to remember in */ }
}

export interface TourProgress { path: "quick" | "full"; stepId: string; completed: string[]; finished?: boolean }
export function loadTourProgress(): TourProgress {
  try {
    const v = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null");
    if (v && (v.path === "quick" || v.path === "full") && typeof v.stepId === "string" && Array.isArray(v.completed)) {
      return { path: v.path, stepId: v.stepId, completed: [...new Set<string>(v.completed.filter((id: unknown) => typeof id === "string"))], finished: v.finished === true };
    }
  } catch { /* The old index-based v2 progress is deliberately ignored. */ }
  return { path: "quick", stepId: "pick-world", completed: [] };
}
export function saveTourProgress(progress: TourProgress) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* Optional learning progress. */ }
  emitTour("tutorial:changed", { completed: progress.completed, stepId: progress.stepId });
}
export function quickTourSummary() {
  const progress = loadTourProgress();
  const completedCount = QUICK_IDS.filter((id) => progress.completed.includes(id)).length;
  return { completedCount, total: QUICK_IDS.length, complete: completedCount === QUICK_IDS.length, currentStep: Math.min(completedCount + 1, QUICK_IDS.length) };
}
export function readHints(): string[] {
  try { const ids = JSON.parse(localStorage.getItem("radium.hints.v1") ?? "[]"); return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []; } catch { return ["mission", "compare", "near", "saved"]; }
}
export function markHintSeen(id: string) {
  try { localStorage.setItem("radium.hints.v1", JSON.stringify([...new Set([...readHints(), id])])); } catch { /* Hints are optional. */ }
}
