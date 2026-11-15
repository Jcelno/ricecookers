import {
  ArrowLeftRight, Bookmark, BookmarkCheck, Columns2, Droplets, ExternalLink, Mountain, Navigation, Radio, Rocket, Sun, Thermometer, Wind, X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { SiteEvidence } from "@/components/catalog/SiteCatalog";
import { CellDetails, SuitabilityBlock } from "@/components/panels/LocationPanel";
import { OrbitalTile } from "@/components/panels/OrbitalTile";
import { ProfileChart } from "@/components/panels/ProfileChart";
import { TimelineChart } from "@/components/panels/TimelineChart";
import { Photos } from "@/components/ui/Photos";
import { AssessmentChips, AssessmentGrade, DecisionCards } from "@/components/ui/Assessment";
import { Button, cx, EvidenceGlyph, EvidenceTag, GradeTile, IconButton, Notice, Segmented, Spinner } from "@/components/ui/primitives";
import { emitTour } from "@/lib/tour/events";
import { api } from "@/lib/api";
import { formatKm, formatValue, GRADE_HEX, GRADE_MEANING, inUnit } from "@/lib/format";
import { photoKey, photosFor } from "@/lib/photos";
import type { Body, CellInfo, Measure, Planet, Suitability, TwinResult } from "@/lib/types";
import { type SiteRef, useStore } from "@/store";

/* --------------------------------------------------------------- metrics */
const ICON: Record<string, ReactNode> = {
  terrain: <Mountain size={15} />, thermal: <Thermometer size={15} />, energy: <Sun size={15} />, comm: <Radio size={15} />,
  water: <Droplets size={15} />, atmos: <Wind size={15} />, geology: <Mountain size={15} />, surface: <Sun size={15} />,
};
// The headline measurements per world, in reading order. Anything missing is simply left out of the card grid.
const KEY: Record<Body, string[]> = {
  moon: ["elev_mean", "slope_med", "slope_p90", "rough_iqr", "flat_frac", "tmax", "tmin", "tmax_coldest", "illum_frac", "earth_vis", "psr_frac", "h_ppm"],
  mars: ["elev_mean", "slope_med", "slope_p90", "rough_iqr", "tmax", "tmin", "solar_flux", "dust_tau", "ps_mean", "weh_wt"],
  earth: ["elev_mean", "slope_med", "rough_iqr", "tmax", "tmin", "precip_mm_yr", "ndvi_max", "barren_frac", "ice_frac"],
};
// Slope limits where the suitability model's terrain criterion gives no credit (backend/suitability.py).
const STEEP = { moon: { med: 12, p90: 20 }, mars: { med: 6, p90: 15 }, earth: { med: 6, p90: 15 } } as const;

function interpret(id: string, v: number, body: Body): string {
  const pct = Math.round(v * 100);
  switch (id) {
    case "slope_med": return v < 2 ? "Gentle at this regional scale." : v < (body === "moon" ? 8 : 4) ? "Moderate regional slopes; local terrain may vary." : "Steep at regional scale; terrain likely constrains operations.";
    case "slope_p90": return v < (body === "moon" ? 10 : 6) ? "Even the steeper tenth of the cell is fairly gentle." : v < STEEP[body].p90 ? "The steeper parts of the cell need closer study." : "A tenth of the cell is steeper than the model's terrain limit.";
    case "rough_iqr": return "Spread of small-scale relief; higher means bumpier ground at about 2 km scale.";
    case "elev_mean": return body === "mars" ? (v < -2000 ? "Low-lying: more atmosphere above for landing." : v > 1000 ? "High ground: thin air makes landing harder." : "Mid elevation.") : body === "earth" ? "Height above mean sea level." : "Height relative to the reference sphere.";
    case "flat_frac": return pct >= 40 ? `${pct}% of the cell is gentle (10° or less) at 480 m scale.` : `Only ${pct}% of the cell is gentle at 480 m scale.`;
    case "illum_frac": return pct >= 70 ? "Sunlit most of the time." : pct <= 30 ? "Dark much of the time." : "Sunlit part of the time.";
    case "earth_vis": return pct >= 90 ? "Earth is almost always above the horizon." : pct <= 20 ? "Earth is rarely in view: relay needed." : "Earth is in view part of the time.";
    case "psr_frac": return pct > 0 ? `${pct}% of the cell never sees the Sun.` : "No permanent shadow in this cell.";
    case "h_ppm": return v >= 100 ? "Elevated hydrogen: a possible ice indicator, not a detection." : "Hydrogen near typical levels.";
    case "weh_wt": return v >= 5 ? "Elevated hydrogen in the top metre: hydrated minerals or, where cold enough, ground ice." : "Little hydrogen in the top metre.";
    case "dust_tau": return v >= 0.5 ? "Dusty on average: less sunlight for panels." : "Relatively clear skies on average.";
    case "ps_mean": return "Average surface pressure, a guide to how much air helps a landing.";
    case "solar_flux": return "Average sunlight reaching the ground over a year.";
    case "precip_mm_yr": return v < 100 ? "Hyperarid to arid." : v < 400 ? "Semi-arid." : "Wet enough for regular vegetation.";
    case "ndvi_max": return v < 0.2 ? "Little or no vegetation." : "Vegetated for part of the year.";
    default: return "";
  }
}

function MetricCard({ m: raw, body }: { m: Measure; body: Body }) {
  const [open, setOpen] = useState(false);
  const meta = useStore((s) => s.meta)!;
  const temp = useStore((s) => s.tempUnit);
  const m = inUnit(raw, temp);
  const src = m.source ? meta.sources_index[m.source] : null;
  const value = m.value === null ? null : m.fmt === "percent" ? `${Math.round(m.value * 100)}%` : `${formatValue(m.value, m.dec, m.fmt)}${m.unit ? ` ${m.unit}` : ""}`;
  const note = raw.value === null ? "Data unavailable here." : interpret(raw.id, raw.value, body);
  return (
    <li className={cx("rounded-md bg-basalt-800/70 ring-1 ring-[var(--hair)]", open && "col-span-2")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="row-ctl block w-full rounded-md p-2.5 text-left">
        <span className="flex items-center gap-1.5 text-2xs text-regolith-400">
          <span className="text-world">{ICON[raw.id.startsWith("t") && raw.unit === "K" ? "thermal" : catOf(raw.id)] ?? ICON.terrain}</span>
          <span className="line-clamp-2 leading-tight">{m.label}</span>
          <span className="ml-auto shrink-0 text-regolith-500"><EvidenceGlyph kind={m.evidence} size={9} /></span>
        </span>
        <span className={cx("tnum mt-1 block text-lg leading-tight font-semibold", value ? "text-regolith-50" : "text-regolith-500 italic text-sm")}>{value ?? "Data unavailable"}</span>
        <span className="mt-0.5 block text-2xs leading-snug text-regolith-300">{note}</span>
      </button>
      {open && (
        <div className="anim-fade border-t border-[var(--hair)] px-2.5 pt-2 pb-2.5 text-2xs leading-relaxed text-regolith-300">
          <p>{m.desc}</p>
          {m.caveat && <p className="mt-1 text-regolith-400">Limits: {m.caveat}</p>}
          <p className="mt-1"><EvidenceTag kind={m.evidence} /> {meta.evidence[m.evidence].desc}</p>
          <p className="mt-1">Resolution: {m.res}.</p>
          {m.sigma !== null && <p className="mt-1">Uncertainty: ± {formatValue(m.sigma, Math.max(m.dec, 1))} {raw.unit === "K" ? "K" : m.unit} (one sigma, from the source).</p>}
          <p className="mt-1">Source: {src ? <a className="link" href={src.url} target="_blank" rel="noreferrer">{src.name} <ExternalLink size={9} className="inline" /></a> : "Calculated by RADIUM from the measurements shown."}</p>
        </div>
      )}
    </li>
  );
}
const CAT_OF: Record<string, string> = {};
function catOf(id: string) { return CAT_OF[id] ?? "terrain"; }

/* ---------------------------------------------------------- assessment */
function assess(cell: CellInfo): { label: string; tone: "good" | "warn" | "info"; why: string } {
  const all = new Map<string, Measure>();
  cell.groups.forEach((g) => g.items.forEach((i) => all.set(i.id, i)));
  const keys = KEY[cell.body].filter((k) => all.has(k));
  const have = keys.filter((k) => all.get(k)!.value !== null).length;
  if (keys.length === 0 || have / keys.length < 0.5) return { label: "Limited data available", tone: "info", why: `Only ${have} of ${keys.length} headline measurements have data here.` };
  const med = all.get("slope_med")?.value, p90 = all.get("slope_p90")?.value;
  const lim = STEEP[cell.body];
  const steep = (med !== null && med !== undefined && med > lim.med) || (p90 !== null && p90 !== undefined && p90 > lim.p90);
  // Near the lunar poles the model weights gentle 480 m ground (flat_frac) above regional slope, so do the same here.
  const flat = all.get("flat_frac")?.value;
  if (steep && flat !== null && flat !== undefined && flat >= 0.3) {
    return { label: "Mixed terrain: steep regionally, gentle patches", tone: "info", why: `Regional slopes exceed RADIUM's terrain limit (${lim.med}° typical, ${lim.p90}° steep), but ${Math.round(flat * 100)}% of the cell is gentle (10° or less) at 480 m scale, which the polar terrain criterion weights most.` };
  }
  if (steep) {
    return { label: "Potential terrain concerns", tone: "warn", why: `Typical or steep-ground slope exceeds the level (${lim.med}° typical, ${lim.p90}° steep) at which RADIUM's terrain criterion gives no credit.` };
  }
  const s = cell.suitability;
  if (s && !s.excluded && (s.grade === "A" || s.grade === "B")) return { label: "Promising for further investigation", tone: "good", why: `Graded ${s.grade} for the selected mission, with no hard limit failed.` };
  if (s && s.excluded) return { label: "Ruled out for this mission", tone: "warn", why: s.failed_limits.map((l) => l.label).join("; ") };
  return { label: "Additional analysis required", tone: "info", why: "No measured terrain concern, but the cell has not been graded favourably for a mission yet. Use the Mission tab to evaluate it." };
}

function summary(cell: CellInfo, temp: "K" | "C"): string {
  const v = (id: string) => { for (const g of cell.groups) for (const i of g.items) if (i.id === id) return i.value; return null; };
  const parts: string[] = [];
  const med = v("slope_med");
  if (med !== null) parts.push(med < 2 ? "gentle regional slopes" : med < (cell.body === "moon" ? 8 : 4) ? "moderate regional slopes" : "steep regional slopes");
  const hi = v("tmax"), lo = v("tmin");
  if (hi !== null && lo !== null) parts.push(`a temperature range of about ${Math.round(hi - lo)} K (${temp === "C" ? `${Math.round(lo - 273.15)} to ${Math.round(hi - 273.15)} °C` : `${Math.round(lo)} to ${Math.round(hi)} K`})`);
  const il = v("illum_frac");
  if (il !== null) parts.push(`sunlight ${Math.round(il * 100)}% of the time`);
  const h = v("h_ppm") ?? v("weh_wt");
  if (h !== null && cell.body === "moon" && h >= 100) parts.push("elevated hydrogen (a possible ice indicator, not a detection)");
  if (h !== null && cell.body === "mars" && h >= 5) parts.push("elevated hydrogen (hydrated minerals or, where cold enough, ground ice)");
  const pr = v("precip_mm_yr");
  if (pr !== null) parts.push(pr < 100 ? "very little rain" : `about ${Math.round(pr)} mm of rain a year`);
  if (!parts.length) return "Few measurements are available for this cell.";
  const [ns] = cell.cell.size_km;
  return `This ${formatKm(ns)} cell has ${parts.join(", ")}. Values are cell averages: finer hazards such as boulders or small craters are not resolved, so higher-resolution data would be needed before judging landing or construction.`;
}

/* --------------------------------------------------------------- tabs */
type Tab = "overview" | "terrain" | "twins" | "mission" | "data";

function TwinTeaser({ cell }: { cell: CellInfo }) {
  const [res, setRes] = useState<TwinResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { startTwin, setTarget, setMode, pickEarth } = useStore.getState();
  const body = cell.body as Planet;
  useEffect(() => {
    const ac = new AbortController();
    setRes(null); setErr(null);
    api.twin({ body, lat: cell.cell.lat, lon: cell.cell.lon, purpose: "general", n: 5 }, ac.signal).then(setRes, (e) => { if (e?.name !== "AbortError") setErr(e.message); });
    return () => ac.abort();
  }, [body, cell.cell.lat, cell.cell.lon]);
  const origin = { body, lat: cell.cell.lat, lon: cell.cell.lon };
  return (
    <div className="px-4 pt-3 pb-4">
      <p className="text-xs leading-snug text-regolith-300">The Earth places most like this cell overall (general analog purpose), compared with all {res ? res.distribution.cells.toLocaleString("en-US") : "341,042"} land cells. Letters are calculated similarity grades, using the same scale as the map.</p>
      {err ? <Notice tone="error">{err}</Notice> : !res ? <div className="mt-3"><Spinner label="Comparing with Earth" /></div> : (
        <ol className="mt-2 divide-y divide-[var(--hair)]">
          {res.candidates.map((c, k) => (
            <li key={c.id}>
              <button type="button" className="row-ctl flex w-full items-center gap-2.5 py-2 text-left" onClick={() => { startTwin(origin); void pickEarth(c.lat, c.lon, true); }}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-basalt-950 text-[11px] font-bold text-basalt-950" style={{ background: c.grade ? GRADE_HEX[c.grade] : "#7b8fa1" }}>{c.grade ?? "·"}</span>
                <span className="min-w-0 flex-1"><span className="placename block truncate text-md text-regolith-50">{c.place.label}</span><span className="block truncate text-2xs text-regolith-400">{c.why}</span><span className="mt-1 block"><AssessmentChips coverage={c.coverage} /></span></span>
                <AssessmentGrade grade={c.grade} coverage={c.coverage} model="similarity" size="sm" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant="solid" onClick={() => startTwin(origin)}><ArrowLeftRight size={13} /> Open Earth Analogs</Button>
        <Button size="sm" variant="outline" onClick={() => { setTarget(origin); setMode("near"); }}><Navigation size={13} /> Find similar near me</Button>
      </div>
    </div>
  );
}

function MissionTab({ cell }: { cell: CellInfo }) {
  const meta = useStore((s) => s.meta)!;
  const st = useStore();
  const missions = meta.missions.filter((m) => m.body === cell.body);
  const [mid, setMid] = useState(st.mode === "mission" && missions.some((m) => m.id === st.missionId) ? st.missionId : missions[0]?.id);
  const [s, setS] = useState<Suitability | null>(cell.suitability && cell.suitability.mission === mid ? cell.suitability : null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!mid) return;
    if (cell.suitability && cell.suitability.mission === mid) { setS(cell.suitability); return; }
    const ac = new AbortController();
    setS(null); setErr(null);
    api.cell(cell.body, cell.cell.lat, cell.cell.lon, { mission: mid, weights: st.rawWeights[mid], limits: st.limitsOn[mid] }, ac.signal).then((c) => setS(c.suitability), (e) => { if (e?.name !== "AbortError") setErr(e.message); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid, cell]);
  const open = () => {
    if (mid) st.setMission(mid);
    st.setMode("mission");
    void st.select(cell.body, cell.cell.lat, cell.cell.lon, { fly: true, spanKm: 600 });
  };
  return (
    <div className="pt-3">
      <div className="px-4"><Segmented size="sm" label="Mission" value={mid} onChange={setMid} options={missions.map((m) => ({ value: m.id, label: m.label }))} /></div>
      {err ? <div className="p-4"><Notice tone="error">{err}</Notice></div> : s ? <SuitabilityBlock s={s} /> : <div className="p-4"><Spinner label="Grading this cell" /></div>}
      <div className="px-4 pb-4"><Button size="sm" variant="solid" onClick={open}><Rocket size={13} /> Plan a mission here</Button></div>
    </div>
  );
}

/* ---------------------------------------------------------------- card */
export function SiteCard({ cell }: { cell: CellInfo }) {
  const meta = useStore((s) => s.meta)!;
  const st = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => { if (cell.body === "earth" && (tab === "twins" || tab === "mission")) setTab("overview"); }, [cell.body, tab]);
  const all = useMemo(() => {
    const m = new Map<string, Measure>();
    cell.groups.forEach((g) => g.items.forEach((i) => { m.set(i.id, i); CAT_OF[i.id] = g.id; }));
    return m;
  }, [cell]);
  const key = KEY[cell.body].map((k) => all.get(k)).filter((x): x is Measure => !!x).slice(0, 8);
  const a = assess(cell);
  const selected = st.selection?.body === cell.body ? st.selection : null;
  const catalogSite = selected ? st.pins[cell.body].find(p => Math.abs(p.lat-selected.lat)<0.001 && Math.abs(p.lon-selected.lon)<0.001) : undefined;
  const ref: SiteRef = { body: cell.body, lat: selected?.lat ?? cell.cell.lat, lon: selected?.lon ?? cell.cell.lon, label: catalogSite?.name ?? cell.place.label };
  const saved = st.saved.sites.some((x) => x.body === ref.body && Math.abs(x.lat - ref.lat) < 1e-4 && Math.abs(x.lon - ref.lon) < 1e-4);
  const inCompare = st.compareList.some((x) => x.body === ref.body && Math.abs(x.lat - ref.lat) < 1e-4 && Math.abs(x.lon - ref.lon) < 1e-4);
  const layers = st.layers[cell.body];
  const baseLayer = cell.body === "earth" ? meta.layers.earth.tiles.find((b) => b.id === layers.base) ?? meta.layers.earth.tiles[0] : meta.layers[cell.body].tiles.find((t) => t.id === layers.base) ?? meta.layers[cell.body].tiles[0];
  const hasTemp = [...all.values()].some((m) => m.unit === "K");
  const [ns, ew] = cell.cell.size_km;
  const world = cell.body === "moon" ? "Moon" : cell.body === "mars" ? "Mars" : "Earth";
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" }, { id: "terrain", label: "Terrain" },
    ...(cell.body !== "earth" ? [{ id: "twins" as Tab, label: "Earth twins" }, { id: "mission" as Tab, label: "Mission" }] : []),
    { id: "data", label: "All data" },
  ];

  return (
    <div>
      <header className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-2xs text-regolith-400">{world}{cell.cell.kind === "polar" ? ", polar grid" : ""}</div>
            <h2 className="placename placename-lg text-regolith-50 [overflow-wrap:anywhere]">{catalogSite?.name ?? cell.place.label}</h2>
            <div className="tnum mt-0.5 text-sm text-regolith-300">{cell.coords} <span className="text-regolith-500">· cell {Math.abs(ns - ew) < 0.3 ? formatKm(ns) : `${formatKm(ns)} × ${formatKm(ew)}`}</span></div>
          </div>
          <IconButton label="Clear the selection" onClick={st.clearSelection} className="-mt-1 -mr-2"><X size={16} /></IconButton>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {cell.body !== "earth" && <Button size="sm" variant="solid" className="justify-center" data-tour="find-twin" onClick={() => st.startTwin({ body: cell.body as Planet, lat: ref.lat, lon: ref.lon })}><ArrowLeftRight size={13} /> Find Earth twins</Button>}
          {cell.body !== "earth" && <Button size="sm" variant="outline" className="justify-center" onClick={() => { st.setTarget({ body: cell.body as Planet, lat: ref.lat, lon: ref.lon }); st.setMode("near"); }}><Navigation size={13} /> Similar near me</Button>}
          <Button size="sm" variant="outline" className="justify-center" aria-pressed={inCompare} onClick={() => { st.addCompare(ref); st.setMode("compare"); }}><Columns2 size={13} /> {inCompare ? "In Compare" : "Compare"}</Button>
          <Button size="sm" variant="outline" className="justify-center" data-tour="save-place" aria-pressed={saved} onClick={() => st.saveSite(ref)} disabled={saved}>{saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />} {saved ? "Saved" : "Save"}</Button>
          {cell.body !== "earth" && <Button size="sm" variant="outline" className="col-span-2 justify-center" onClick={() => setTab("mission")}><Rocket size={13} /> Plan mission</Button>}
        </div>
      </header>

      <div role="tablist" data-tour="site-details" aria-label="Site details" className="no-scrollbar hair-t hair-b flex gap-0.5 overflow-x-auto px-2 py-1.5">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); emitTour("locationTab:changed", { tab: t.id }); }} className="ctl h-7 shrink-0 rounded-sm px-2.5 text-xs font-medium text-regolith-300">{t.label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="anim-fade">
          {cell.suitability && <section className="space-y-3 px-4 pt-4" aria-label="Mission decision support">
            <div className="flex items-center gap-3"><AssessmentGrade grade={cell.suitability.grade} coverage={cell.suitability.coverage} minCoverage={cell.suitability.min_coverage} excluded={cell.suitability.excluded} size="lg" /><div className="min-w-0"><p className="text-xs font-medium text-regolith-100">{meta.missions.find(m => m.id === cell.suitability!.mission)?.label}</p><p className="mb-1 text-xs text-regolith-400">{cell.suitability.excluded ? "Ruled out by a hard limit" : "Computed mission suitability"}</p><AssessmentChips coverage={cell.suitability.coverage} factors={cell.suitability.factors} /></div></div>
            <DecisionCards factors={cell.suitability.factors} />
          </section>}
          {catalogSite && <section className="m-4 rounded-lg bg-basalt-800 p-3 ring-1 ring-[var(--hair)]"><SiteEvidence site={catalogSite} /></section>}
          <section className="px-4 pt-3">
            <div className={cx("rounded-md px-3 py-2.5 ring-1", a.tone === "good" ? "bg-[color-mix(in_srgb,var(--color-grade-b)_14%,transparent)] ring-[var(--color-grade-b)]/40" : a.tone === "warn" ? "bg-[color-mix(in_srgb,var(--color-grade-d)_14%,transparent)] ring-[var(--color-grade-d)]/40" : "bg-basalt-800 ring-[var(--hair)]")}>
              <div className="text-2xs text-regolith-400">Site assessment</div>
              <div className="text-md font-semibold text-regolith-50">{a.label}</div>
              <p className="mt-0.5 text-2xs leading-snug text-regolith-300">{a.why}</p>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-regolith-200">{summary(cell, st.tempUnit)}</p>
          </section>
          {cell.note && <div className="px-4 pt-2"><Notice tone="info">{cell.note}</Notice></div>}
          <section className="px-4 pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-regolith-100">Key measurements</h3>
              {hasTemp && <Segmented size="sm" label="Temperature unit" value={st.tempUnit} onChange={(v) => useStore.setState({ tempUnit: v })} options={[{ value: "K", label: "K" }, { value: "C", label: "°C" }]} />}
            </div>
            <ul className="grid grid-cols-2 gap-1.5">{key.map((m) => <MetricCard key={m.id} m={m} body={cell.body} />)}</ul>
            <p className="mt-1.5 text-2xs text-regolith-500">Select a card for its definition, source, resolution and limits. Every measurement is under All data.</p>
          </section>
          <section className="pt-4">
            <h3 className="mb-1.5 px-4 text-xs font-semibold text-regolith-100">{cell.body === "moon" ? "Through the lunar day" : "Through the year"}</h3>
            <TimelineChart body={cell.body} lat={cell.cell.lat} lon={cell.cell.lon} />
          </section>
          <section className="px-4 pt-4">
            <h3 className="mb-1.5 text-xs font-semibold text-regolith-100">Imagery</h3>
            <OrbitalTile body={cell.body} lat={cell.cell.lat} lon={cell.cell.lon} layer={baseLayer} />
          </section>
          <section className="pt-3">
            <h3 className="mb-1.5 px-4 text-xs font-semibold text-regolith-100">Photographs</h3>
            <Photos id={photoKey(cell)} load={() => photosFor(cell)} compact />
          </section>
        </div>
      )}
      {tab === "terrain" && (
        <div className="anim-fade pt-3">
          <ProfileChart body={cell.body} lat={cell.cell.lat} lon={cell.cell.lon} />
          <ul className="grid grid-cols-2 gap-1.5 px-4 pb-4">
            {(cell.groups.find((g) => g.id === "terrain")?.items ?? []).map((m) => <MetricCard key={m.id} m={m} body={cell.body} />)}
          </ul>
          <p className="px-4 pb-4 text-2xs leading-snug text-regolith-500">Use the swipe control on the map to compare imagery with a terrain layer.</p>
        </div>
      )}
      {tab === "twins" && cell.body !== "earth" && <TwinTeaser cell={cell} />}
      {tab === "mission" && cell.body !== "earth" && <MissionTab cell={cell} />}
      {tab === "data" && <div className="anim-fade pt-2"><CellDetails cell={cell} /></div>}
      {cell.suitability && tab === "overview" && st.mode === "mission" && (
        <div className="pt-3"><div className="px-4 text-xs font-semibold text-regolith-100">For {meta.missions.find((m) => m.id === cell.suitability!.mission)?.label}</div><SuitabilityBlock s={cell.suitability} /></div>
      )}
      <div className="h-6" />
    </div>
  );
}

export { GRADE_MEANING };
