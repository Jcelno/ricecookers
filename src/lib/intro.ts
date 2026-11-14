// Whether this browser has already seen the first-visit guide. Storage can be blocked (private windows,
// previews); then the guide counts as seen so it never traps anyone, and the Guide button still opens it.
const SEEN_KEY = "radium.intro.v1";
export function introSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; }
}
export function markIntroSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* nothing to remember in */ }
}
