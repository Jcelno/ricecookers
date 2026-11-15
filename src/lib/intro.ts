// Whether this browser has already seen the first-visit guide. Storage can be blocked (private windows,
// previews); then the guide counts as seen so it never traps anyone, and the Guide button still opens it.
const SEEN_KEY = "radium.intro.v1";
export function introSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; }
}
export function markIntroSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* nothing to remember in */ }
}

export interface TourProgress { path: "short" | "detailed"; index: number; completed: number[] }
export function loadTourProgress(): TourProgress {
  try {
    const v = JSON.parse(localStorage.getItem("radium.tutorial.v2") ?? "null");
    if (v && (v.path === "short" || v.path === "detailed") && Number.isInteger(v.index) && v.index >= 0 && v.index < 32 && Array.isArray(v.completed)) {
      return { path: v.path, index: v.index, completed: v.completed.filter((n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 32) };
    }
  } catch { /* The tutorial remains usable without storage. */ }
  return { path: "short", index: 0, completed: [] };
}
export function saveTourProgress(progress: TourProgress) {
  try { localStorage.setItem("radium.tutorial.v2", JSON.stringify(progress)); } catch { /* Optional learning progress. */ }
}
