// Versioned share state. User/device Near Me positions are deliberately never encoded.
import { ALL_GRADES, useStore, type ColorBy, type Mode, type SiteRef } from "@/store";
import type { Body, Planet } from "./types";
import { validSite } from "./persistence";

const MODES: Mode[] = ["explore", "mission", "twin", "near", "compare", "saved"];
const BODIES: Body[] = ["moon", "mars", "earth"];
const COLORS: ColorBy[] = ["grade", "environment", "application"];
const position = (v: string | null): { lat: number; lon: number } | null => {
  if (!v) return null;
  const parts = v.split(",");
  if (parts.length !== 2 || parts.some((x) => !x.trim())) return null;
  const [lat, lon] = parts.map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
};
const weights = (v: string | null, allowed: string[]): Record<string, number> | null => {
  if (!v) return null;
  const out: Record<string, number> = {};
  for (const part of v.split(";")) {
    const pieces = part.split(":");
    if (pieces.length !== 2 || !pieces[1].trim()) continue;
    const [k, raw] = pieces;
    const n = Number(raw);
    if (allowed.includes(k) && Number.isFinite(n) && n >= 0 && n <= 100) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
};
const encWeights = (w: Record<string, number>) => Object.entries(w).map(([k, v]) => `${k}:${v}`).join(";");
const coords = (p: { lat: number; lon: number }) => `${p.lat},${p.lon}`;

/** Accept historical hashes as well as v2 links; ignore malformed input rather than requesting invalid coordinates. */
export function applyLink(hash: string) {
  if (hash.length > 16000) return;
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  if (!q.toString()) return;
  const st = useStore.getState();
  const meta = st.meta;
  if (!meta) return;
  const mode = MODES.includes(q.get("m") as Mode) ? q.get("m") as Mode : "explore";
  const body = BODIES.includes(q.get("b") as Body) ? q.get("b") as Body : "moon";
  const rawTarget = q.get("t")?.split(",") ?? [];
  const targetBody = rawTarget[0] as Planet;
  const targetPos = position(rawTarget.slice(1).join(","));
  const target = (targetBody === "moon" || targetBody === "mars") && targetPos ? { body: targetBody, ...targetPos } : null;
  const purpose = target && meta.purposes[target.body].some((p) => p.id === q.get("p")) ? q.get("p")! : "general";
  const twinWeights = weights(q.get("tw"), Object.keys(meta.dimensions));
  const selection = position(q.get("s"));
  const earth = position(q.get("e"));
  let list: SiteRef[] = [];
  if (q.has("cl2")) {
    try {
      const v = JSON.parse(q.get("cl2")!);
      if (Array.isArray(v)) list = v.filter(validSite).slice(0, 4).map(({ body, lat, lon, label, newLead }) => ({ body, lat, lon, label: label.slice(0, 160), ...(body === "earth" && newLead === true ? { newLead: true } : {}) }));
    } catch { /* damaged comparison list */ }
  } else if (q.get("cl")) {
    list = q.get("cl")!.split(";").flatMap((part) => {
      const [b, la, lo, ...rest] = part.split(",");
      const p = position(`${la},${lo}`);
      return BODIES.includes(b as Body) && p ? [{ body: b as Body, ...p, label: rest.join(",").slice(0, 160) || `${b} ${la}, ${lo}` }] : [];
    }).slice(0, 4);
  }
  list = list.filter((x, i, all) => all.findIndex((a) => a.body === x.body && a.lat === x.lat && a.lon === x.lon) === i);
  const mission = meta.missions.find((m) => m.id === q.get("mi")) ?? (mode === "mission" ? meta.missions.find((m) => m.body === (body === "earth" ? "moon" : body)) : undefined);
  st.clearSelection(); st.clearPick();
  useStore.setState({ mode: "explore", body, twinOrigin: target, purpose, twinWeights, twin: null, twinStatus: "idle", sheet: null, scenarioB: null,
    compareList: list, compareTab: q.get("ct") === "sites" ? "sites" : q.get("ct") === "pair" || target && earth && !list.length ? "pair" : "sites",
    colorBy: COLORS.includes(q.get("c") as ColorBy) ? q.get("c") as ColorBy : "grade", gradeFilter: q.has("gf") ? ALL_GRADES.filter((g) => q.get("gf")!.split(",").includes(g)) : [...ALL_GRADES],
    showDocumented: q.get("doc") !== "0", showModelled: q.get("mod") !== "0", catFilter: q.get("cat") ? q.get("cat")!.split(",").slice(0, 12) : null,
    advanced: q.get("adv") === "1", units: q.get("u") === "km" ? "km" : q.get("u") === "mi" ? "mi" : st.units,
    tempUnit: q.get("temp") === "C" ? "C" : "K" });
  // Only accept a layer that exists for this body; never interpret a link as an arbitrary tile URL.
  const base = q.get("base");
  const overlayId = q.get("ov");
  const kind = q.get("ok");
  const available = meta.layers[body];
  const validOverlay = kind === "grid" ? available.grid.some((l) => l.id === overlayId) : kind === "tiles" && available.tiles.some((l) => l.id === overlayId);
  const opacity = Number(q.get("op"));
  st.setLayer(body, { ...(base && available.tiles.some((l) => l.id === base) ? { base } : {}), overlay: validOverlay && overlayId ? { id: overlayId, kind: kind as "tiles" | "grid" } : null,
    ...(q.has("op") && Number.isFinite(opacity) && opacity >= 0 && opacity <= 1 ? { opacity } : {}), labels: q.get("labels") !== "0",
    ...(q.has("pins") ? { pins: { landing: q.get("pins")!.includes("l"), feature: q.get("pins")!.includes("f"), analog: q.get("pins")!.includes("a") } } : {}) });
  if (mission) {
    const allowed = mission.criteria.map((c) => c.id);
    const defaultWeights = Object.fromEntries(mission.criteria.map((c) => [c.id, Math.round(c.weight * 100)]));
    const allowedLimits = mission.limits.map((l) => l.id);
    const selectedWeights = { ...defaultWeights, ...weights(q.get("w"), allowed) };
    const selectedLimits = q.has("l") ? q.get("l")!.split(",").filter((l) => allowedLimits.includes(l)) : allowedLimits;
    useStore.setState((s) => ({ missionId: mission.id, rawWeights: { ...s.rawWeights, [mission.id]: selectedWeights }, limitsOn: { ...s.limitsOn, [mission.id]: selectedLimits },
      ...(mode === "mission" ? { body: mission.body } : {}) }));
    if (q.has("wb") || q.has("lb")) useStore.setState({ scenarioB: { mission: mission.id, weights: { ...selectedWeights, ...weights(q.get("wb"), allowed) }, limits: q.has("lb") ? q.get("lb")!.split(",").filter((l) => allowedLimits.includes(l)) : allowedLimits } });
  }
  if ((mode === "twin" || mode === "compare") && target) {
    st.startTwin(target);
    if (earth) void useStore.getState().pickEarth(earth.lat, earth.lon, true);
    if (mode === "compare") useStore.getState().setMode("compare");
    if (q.get("ct") === "sites") useStore.setState({ compareTab: "sites" });
  } else if (mode === "near") {
    const radius = Number(q.get("nr"));
    useStore.setState({ nearMode: q.get("nm") === "best" && target ? "best" : "nearest", nearDocOnly: q.get("nd") === "1",
      ...(Number.isFinite(radius) && radius >= 10 && radius <= 20015 ? { nearRadius: radius } : {}) });
    st.setMode("near");
  } else {
    st.setMode(mode);
    if ((mode === "explore" || mode === "mission") && selection) void useStore.getState().select(useStore.getState().body, selection.lat, selection.lon, { fly: true, spanKm: body === "earth" ? 1200 : 600 });
  }
  const sheet = q.get("sh");
  if (sheet === "brief" && target && earth) useStore.getState().openBrief(earth);
  else if ((sheet === "scenarios" || sheet === "report") && mission) st.setSheet(sheet);
  else if (sheet === "methodology" || sheet === "sources") st.setSheet(sheet);
}

/** Full precision preserves the requested site, separate from its coarser scientific analysis cell. */
export function currentLink(): string {
  const s = useStore.getState();
  const q = new URLSearchParams({ v: "2", m: s.mode, b: s.body });
  if (s.colorBy !== "grade") q.set("c", s.colorBy);
  if (s.gradeFilter.length !== ALL_GRADES.length) q.set("gf", s.gradeFilter.join(","));
  if (!s.showDocumented) q.set("doc", "0");
  if (!s.showModelled) q.set("mod", "0");
  if (s.catFilter?.length) q.set("cat", s.catFilter.join(","));
  if (s.advanced) q.set("adv", "1");
  q.set("u", s.units);
  if (s.tempUnit === "C") q.set("temp", "C");
  const layer = s.layers[s.body];
  q.set("base", layer.base);
  if (layer.overlay) { q.set("ov", layer.overlay.id); q.set("ok", layer.overlay.kind); }
  q.set("op", String(layer.opacity));
  if (!layer.labels) q.set("labels", "0");
  q.set("pins", `${layer.pins.landing ? "l" : ""}${layer.pins.feature ? "f" : ""}${layer.pins.analog ? "a" : ""}`);
  if (s.twinOrigin) { q.set("t", `${s.twinOrigin.body},${coords(s.twinOrigin)}`); q.set("p", s.purpose); }
  if (s.twinWeights) q.set("tw", encWeights(s.twinWeights));
  if ((s.mode === "twin" || s.mode === "compare") && s.picked) q.set("e", coords(s.picked));
  if (s.mode === "compare") q.set("ct", s.compareTab);
  if (s.sheet === "brief" && s.brief) { q.set("t", `${s.brief.body},${coords(s.brief)}`); q.set("p", s.brief.purpose); q.set("e", `${s.brief.earth_lat},${s.brief.earth_lon}`); }
  if ((s.mode === "explore" || s.mode === "mission") && s.selection?.body === s.body) q.set("s", coords(s.selection));
  if (s.mode === "mission" || s.sheet === "scenarios" || s.sheet === "report") {
    q.set("mi", s.missionId);
    if (s.rawWeights[s.missionId]) q.set("w", encWeights(s.rawWeights[s.missionId]));
    q.set("l", (s.limitsOn[s.missionId] ?? []).join(",") || "-");
    if (s.sheet === "scenarios" && s.scenarioB?.mission === s.missionId) { q.set("wb", encWeights(s.scenarioB.weights)); q.set("lb", s.scenarioB.limits.join(",") || "-"); }
  }
  if (s.mode === "near") { q.set("nr", String(s.nearRadius)); q.set("nm", s.nearMode); if (s.nearDocOnly) q.set("nd", "1"); }
  if (s.compareList.length) q.set("cl2", JSON.stringify(s.compareList.map(({ body, lat, lon, label, newLead }) => ({ body, lat, lon, label: label.slice(0, 160), ...(body === "earth" && newLead === true ? { newLead: true } : {}) }))));
  if (s.sheet && s.sheet !== "intro") q.set("sh", s.sheet);
  return `${location.origin}${location.pathname}${location.search}#${q}`;
}

export function startLinkSync() {
  let timer = 0;
  let restoring = false;
  const unsub = useStore.subscribe(() => {
    if (restoring) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const url = currentLink();
      if (url !== location.href) { try { history.replaceState(null, "", url); } catch { /* Copy View Link still works in restricted embeds. */ } }
    }, 350);
  });
  const restore = () => { clearTimeout(timer); restoring = true; try { applyLink(location.hash); } finally { restoring = false; } };
  window.addEventListener("hashchange", restore);
  return () => { clearTimeout(timer); unsub(); window.removeEventListener("hashchange", restore); };
}
