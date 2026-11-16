// Coach marks: at most three per path, each shown once at the moment it matters, then never again.
export type CoachId = "grades" | "new-lead" | "compare";
export const COACH: Record<CoachId, { text: string; anchor: string }> = {
  grades: { text: "Grades compare places for this purpose only. A = 0.80 or higher.", anchor: '[data-coach="grades"]' },
  "new-lead": { text: "Not in our list of documented analog sites. This is a candidate to verify.", anchor: '[data-coach="new-lead"]' },
  compare: { text: "Red chips are conditions no place on Earth can reproduce.", anchor: '[data-coach="cannot"]' },
};
const KEY = "radium.coach.v1";

function read(): string[] {
  const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
/** If storage is unavailable every tip counts as seen: a visitor is never shown the same tip twice. */
export function coachSeen(id: CoachId): boolean {
  try { return read().includes(id); } catch { return true; }
}
export function markCoachSeen(id: CoachId) {
  try { localStorage.setItem(KEY, JSON.stringify([...new Set([...read(), id])])); } catch { /* tips are optional */ }
}
export function resetCoachMarks() {
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
  window.dispatchEvent(new Event("radium:coach-reset"));
}
/** Tests written before the start screen pass ?tour=0 to switch first-run help off. */
export const coachEnabled = () => {
  try { return new URLSearchParams(location.search).get("tour") !== "0"; } catch { return false; }
};
