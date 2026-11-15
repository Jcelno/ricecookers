// Share links: the visible state is written to the address hash, and a pasted link restores it.
// Everything read from a link is untrusted and validated. The Near Me starting location is never written.

import { useStore, type ColorBy, type Mode } from "@/store";
import type { Body, Planet } from "./types";

const MODES: Mode[] = ["explore", "mission", "twin", "near"];
const BODIES: Body[] = ["moon", "mars", "earth"];
const COLORS: ColorBy[] = ["grade", "environment", "application"];
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

function latlon(v: string | null): { lat: number; lon: number } | null {
  if (!v) return null;
  const [a, b] = v.split(",").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: a, lon: b };
}
function weights(v: string | null, allowed: string[]): Record<string, number> | null {
  if (!v) return null;
  const out: Record<string, number> = {};
  for (const part of v.split(";")) {
    const [k, raw] = part.split(":");
    const n = Number(raw);
    if (allowed.includes(k) && Number.isFinite(n) && n >= 0 && n <= 100) out[k] = Math.round(n);
  }
  return Object.keys(out).length ? out : null;
}
const encW = (w: Record<string, number>) => Object.entries(w).map(([k, v]) => `${k}:${Math.round(v)}`).join(";");

/** Apply a link's state. Unknown or malformed parts are ignored. */
export function applyLink(hash: string) {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  if (!q.toString()) return;
  const st = useStore.getState();
  const meta = st.meta;
  if (!meta) return;
  const mode = MODES.includes(q.get("m") as Mode) ? (q.get("m") as Mode) : "explore";
  const body = BODIES.includes(q.get("b") as Body) ? (q.get("b") as Body) : st.body;

  const c = q.get("c") as ColorBy;
  if (COLORS.includes(c)) st.setAtlas({ colorBy: c });

  // Moon or Mars target shared by Earth Analogs, Near Me and the test brief.
  const tRaw = q.get("t")?.split(",") ?? [];
  const tBody = tRaw[0] as Planet;
  const tPos = latlon(tRaw.slice(1).join(","));
  const target = (tBody === "moon" || tBody === "mars") && tPos ? { body: tBody, ...tPos } : null;
  const p = q.get("p");
  if (target && p && meta.purposes[target.body].some((x) => x.id === p)) useStore.setState({ purpose: p });

  const mission = meta.missions.find((x) => x.id === q.get("mi"));
  if (mission) {
    const w = weights(q.get("w"), mission.criteria.map((x) => x.id));
    const lim = q.get("l");
    const allowedLimits = mission.limits.map((x) => x.id);
    useStore.setState((s) => ({
      missionId: mission.id,
      rawWeights: w ? { ...s.rawWeights, [mission.id]: { ...s.rawWeights[mission.id], ...w } } : s.rawWeights,
      limitsOn: lim !== null ? { ...s.limitsOn, [mission.id]: lim === "-" ? [] : lim.split(",").filter((x) => allowedLimits.includes(x)) } : s.limitsOn,
    }));
    const wb = weights(q.get("wb"), mission.criteria.map((x) => x.id));
    const lb = q.get("lb");
    if (wb || lb !== null) {
      useStore.setState({ scenarioB: {
        mission: mission.id,
        weights: { ...useStore.getState().rawWeights[mission.id], ...(wb ?? {}) },
        limits: lb === null ? [...allowedLimits] : lb === "-" ? [] : lb.split(",").filter((x) => allowedLimits.includes(x)),
      } });
    }
  }

  const sel = latlon(q.get("s"));
  const earth = latlon(q.get("e"));
  if (mode === "twin" && target) {
    st.startTwin(target);
    if (earth) void useStore.getState().pickEarth(earth.lat, earth.lon, true);
  } else if (mode === "near") {
    const nr = Number(q.get("nr"));
    useStore.setState({
      twinOrigin: target, nearMode: q.get("nm") === "best" && target ? "best" : "nearest", nearDocOnly: q.get("nd") === "1",
      ...(Number.isFinite(nr) && nr >= 10 && nr <= 20015 ? { nearRadius: nr } : {}),
    });
    st.setMode("near");
  } else if (mode === "mission") {
    if (mission && mission.body !== st.body) st.setBody(mission.body);
    st.setMode("mission");
    if (sel) void useStore.getState().select(useStore.getState().body, sel.lat, sel.lon, { fly: true, spanKm: 600 });
  } else {
    st.setBody(body);
    if (target) useStore.setState({ twinOrigin: target });
    if (sel) void useStore.getState().select(body, sel.lat, sel.lon, { fly: true, spanKm: body === "earth" ? 1200 : 600 });
  }
  const sheet = q.get("sh");
  if (sheet === "brief" && target && earth) {
    useStore.setState({ twinOrigin: target });
    useStore.getState().openBrief(earth);
  } else if (sheet === "scenarios" && mission) st.setSheet("scenarios");
  else if (sheet === "methodology" || sheet === "sources") st.setSheet(sheet);
}

/** The link for the current view. */
export function currentLink(): string {
  const s = useStore.getState();
  const q = new URLSearchParams();
  q.set("m", s.mode);
  q.set("b", s.body);
  if (s.colorBy !== "grade") q.set("c", s.colorBy);
  if (s.twinOrigin && (s.mode === "twin" || s.mode === "near" || s.sheet === "brief")) {
    q.set("t", `${s.twinOrigin.body},${r4(s.twinOrigin.lat)},${r4(s.twinOrigin.lon)}`);
    q.set("p", s.purpose);
  }
  if (s.mode === "twin" && s.picked) q.set("e", `${r4(s.picked.lat)},${r4(s.picked.lon)}`);
  if (s.sheet === "brief" && s.brief) {
    q.set("t", `${s.brief.body},${r4(s.brief.lat)},${r4(s.brief.lon)}`);
    q.set("p", s.brief.purpose);
    q.set("e", `${r4(s.brief.earth_lat)},${r4(s.brief.earth_lon)}`);
  }
  if ((s.mode === "explore" || s.mode === "mission") && s.selection && s.selection.body === s.body) q.set("s", `${r4(s.selection.lat)},${r4(s.selection.lon)}`);
  if (s.mode === "mission" || s.sheet === "scenarios") {
    q.set("mi", s.missionId);
    const w = s.rawWeights[s.missionId];
    if (w) q.set("w", encW(w));
    q.set("l", (s.limitsOn[s.missionId] ?? []).join(",") || "-");
    if (s.sheet === "scenarios" && s.scenarioB && s.scenarioB.mission === s.missionId) {
      q.set("wb", encW(s.scenarioB.weights));
      q.set("lb", s.scenarioB.limits.join(",") || "-");
    }
  }
  if (s.mode === "near") {
    q.set("nr", String(s.nearRadius));
    q.set("nm", s.nearMode);
    if (s.nearDocOnly) q.set("nd", "1");
  }
  if (s.sheet && s.sheet !== "intro") q.set("sh", s.sheet);
  return `${location.origin}${location.pathname}#${q.toString()}`;
}

/** Keep the address bar in sync (replaceState: no history spam). Returns an unsubscribe function. */
export function startLinkSync() {
  let t = 0;
  const unsub = useStore.subscribe(() => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      const link = currentLink();
      if (link !== location.href) history.replaceState(null, "", link);
    }, 350);
  });
  return () => { clearTimeout(t); unsub(); };
}
