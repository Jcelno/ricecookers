import { StepRail } from "@/components/flow/Steps";
import { ArrowLeftRight, Bookmark, Columns2, Download, ExternalLink, FileText, Home, LocateFixed, MapPin, Minus, Plus, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EarthMap, LABEL_ATTRIBUTION } from "@/components/map/LazyEarthMap";
import type { GlobeHandle, SiteMarker, ViewState } from "@/components/map/GlobeView";
import { Tapes, type TapesHandle } from "@/components/map/Tapes";
import { Button, cx, GradeTile, IconButton, Notice, Segmented, Spinner, Switch } from "@/components/ui/primitives";
import { formatCoord, GRADE_HEX, GRADE_MEANING } from "@/lib/format";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { Grade, NearbyDocumented, NearbyRegion, Planet, SearchHit } from "@/lib/types";
import { targetLabel, useStore } from "@/store";

const KM_PER_MI = 1.609344;
// Round numbers in whichever unit is shown; the request always carries kilometres.
const RADII = { km: [250, 500, 1000, 1500, 3000, 6000, 20015], mi: [150, 300, 600, 1000, 2000, 4000].map((m) => Math.round(m * 1.609344)).concat(20015) };

type Item = (NearbyDocumented | NearbyRegion) & { key: string; n: number };

export function distText(km: number, units: "km" | "mi") {
  const v = units === "mi" ? km / KM_PER_MI : km;
  return `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")} ${units}`;
}
const radiusText = (km: number, units: "km" | "mi") => (km >= 20000 ? "Whole Earth" : `${Math.round(units === "mi" ? km / KM_PER_MI : km).toLocaleString("en-US")} ${units}`);
const itemName = (it: Item) => (it.kind === "documented" ? it.name : it.place);

/* --------------------------------------------------------------- controls */
/** Place search over RADIUM's own name lists (Natural Earth places, states, countries, regions). No third-party geocoder. */
function PlaceSearch({ onPick }: { onPick: (h: SearchHit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "none" | "error">("idle");
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); setState("idle"); return; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      setState("loading");
      api.search("earth", q.trim(), ac.signal).then(
        (r) => { setHits(r.slice(0, 7)); setState(r.length ? "idle" : "none"); },
        (e) => { if (e?.name !== "AbortError") setState("error"); },
      );
    }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [q]);
  return (
    <div className="relative mt-2.5">
      <label className="text-2xs text-regolith-400">Search for a place
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="City, region or country" className="field mt-0.5" role="combobox" aria-expanded={hits.length > 0} aria-controls="near-place-hits" autoComplete="off" />
      </label>
      {hits.length > 0 && (
        <ul id="near-place-hits" role="listbox" className="surface-float absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-md p-1 ring-1 ring-[var(--hair)]">
          {hits.map((h) => (
            <li key={`${h.name}${h.lat}${h.lon}`}>
              <button type="button" role="option" aria-selected={false} onClick={() => { onPick(h); setQ(""); setHits([]); }} className="row-ctl block w-full rounded-sm px-2 py-1.5 text-left">
                <span className="block truncate text-sm text-regolith-50">{h.name}</span>
                <span className="block text-2xs text-regolith-400">{h.type === "place" ? "City or town" : h.type === "country" ? "Country" : h.type === "state" ? "State or province" : h.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {state === "none" && <p className="mt-1 text-2xs text-regolith-400">No match. Try another spelling, or enter coordinates.</p>}
      {state === "error" && <p className="mt-1 text-2xs text-alert">Search is unavailable right now. Enter coordinates or click the map instead.</p>}
    </div>
  );
}

function Location() {
  const nearLoc = useStore((s) => s.nearLoc);
  const setNear = useStore((s) => s.setNear);
  const flyTo = useStore((s) => s.flyTo);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const locate = () => {
    if (!("geolocation" in navigator)) return setMsg("This browser cannot share its location. Enter coordinates instead.");
    setBusy(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        const loc = { lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), source: "device" as const };
        setNear({ nearLoc: loc });
        flyTo("earth", loc.lat, loc.lon, 2500);
      },
      (e) => {
        setBusy(false);
        setMsg(
          e.code === e.PERMISSION_DENIED ? "Location permission was declined. Enter coordinates or click the map instead."
            : e.code === e.TIMEOUT ? "Finding your location took too long. Try again, or enter coordinates."
              : "Your location is unavailable right now. Enter coordinates or click the map instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const la = Number(lat.trim());
    const lo = Number(lon.trim());
    if (lat.trim() === "" || lon.trim() === "" || !Number.isFinite(la) || !Number.isFinite(lo)) return setMsg("Enter latitude and longitude as decimal degrees, for example 36.1 and -115.2.");
    if (la < -90 || la > 90) return setMsg("Latitude must be between -90 (south pole) and 90 (north pole).");
    if (lo < -180 || lo > 180) return setMsg("Longitude must be between -180 and 180. West is negative.");
    setMsg(null);
    setNear({ nearLoc: { lat: la, lon: lo, source: "manual" } });
    flyTo("earth", la, lo, 2500);
  };

  return (
    <section className="px-4 pt-3 pb-4">
      <h3 id="near-step-1" className="text-sm font-semibold text-regolith-50">Your starting point</h3>
      {nearLoc ? (
        <div className="mt-2 flex items-center gap-2 rounded-sm bg-basalt-800 px-3 py-2 text-sm">
          <MapPin size={15} className="shrink-0 text-world" />
          <span className="tnum min-w-0 flex-1 text-regolith-100">
            {Math.abs(nearLoc.lat).toFixed(2)}°{nearLoc.lat >= 0 ? "N" : "S"}, {Math.abs(nearLoc.lon).toFixed(2)}°{nearLoc.lon >= 0 ? "E" : "W"}
            <span className="block text-2xs text-regolith-400">{nearLoc.source === "device" ? "From this device" : nearLoc.source === "map" ? "Picked on the map" : nearLoc.source === "search" ? nearLoc.label : "Entered by hand"}</span>
          </span>
          <IconButton label="Forget this location" onClick={() => setNear({ nearLoc: null })} className="size-7"><X size={14} /></IconButton>
        </div>
      ) : (
        <p className="mt-1 text-xs leading-snug text-regolith-400">Use your device's location, search for a place, type coordinates, or click anywhere on the map.</p>
      )}
      <Button variant="solid" size="sm" className="mt-2.5 w-full justify-center" onClick={locate} disabled={busy}>
        <LocateFixed size={14} /> {busy ? "Finding your location…" : "Use my location"}
      </Button>
      <PlaceSearch onPick={(h) => { setNear({ nearLoc: { lat: h.lat, lon: h.lon, source: "search", label: h.name } }); flyTo("earth", h.lat, h.lon, 2500); }} />
      <form onSubmit={submit} className="mt-2.5 grid grid-cols-[1fr_1fr_auto] items-end gap-1.5" aria-label="Enter coordinates">
        <label className="text-2xs text-regolith-400">Latitude<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="36.10 (N +, S −)" className="field mt-0.5" /></label>
        <label className="text-2xs text-regolith-400">Longitude<input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-115.20 (E +, W −)" className="field mt-0.5" /></label>
        <Button size="sm" variant="outline" type="submit">Set</Button>
      </form>
      {msg && <p className="mt-2 text-xs leading-snug text-alert" role="alert">{msg}</p>}
      <p className="mt-2.5 text-2xs leading-snug text-regolith-500">Your location stays in this browser tab. It is sent only to RADIUM's own service to compute distances, is not stored, and is never added to share links. Place search uses RADIUM's built-in Natural Earth name lists, not an outside service.</p>
    </section>
  );
}

function Target() {
  const meta = useStore((s) => s.meta)!;
  const target = useStore((s) => s.twinOrigin);
  const purpose = useStore((s) => s.purpose);
  const { setTarget, setPurpose } = useStore.getState();
  const pins = useStore(s=>s.pins);
  const targets = (["moon","mars"] as Planet[]).flatMap(body=>pins[body].map(p=>({...p,body})));
  const label = target ? targets.find((t) => t.body === target.body && Math.abs(t.lat - target.lat) < 0.05 && Math.abs(t.lon - target.lon) < 0.05)?.name : null;
  return (
    <section className="hair-t px-4 pt-3 pb-4">
      <h3 id="near-step-2" className="text-sm font-semibold text-regolith-50">Moon or Mars site (optional)</h3>
      <p className="mt-1 text-xs leading-snug text-regolith-400">Optional. With a target, each place also gets its Earth Twin similarity grade for the chosen purpose.</p>
      {target ? (
        <div className="mt-2 rounded-sm bg-basalt-800 px-3 py-2">
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-sm">
              <span className="placename block text-md text-regolith-50">{label ?? (target.body === "moon" ? "Moon site" : "Mars site")}</span>
              <span className="tnum text-2xs text-regolith-400">{target.body === "moon" ? "Moon" : "Mars"}, {Math.abs(target.lat).toFixed(2)}°{target.lat >= 0 ? "N" : "S"}, {Math.abs(target.lon).toFixed(2)}°{target.lon >= 0 ? "E" : "W"}</span>
            </span>
            <IconButton label="Remove the target" onClick={() => setTarget(null)} className="size-7"><X size={14} /></IconButton>
          </div>
          <label className="mt-2 block text-2xs text-regolith-400">
            Research purpose
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="field mt-0.5">
              {meta.purposes[target.body].map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <ul className="mt-1.5">
          {targets.slice(0,6).map((t) => (
            <li key={t.name}>
              <button type="button" onClick={() => setTarget({ body: t.body, lat: t.lat, lon: t.lon })} className="row-ctl -mx-2 flex w-[calc(100%+16px)] items-baseline justify-between gap-2 rounded-sm px-2 py-1.5 text-left">
                <span className="placename text-md text-regolith-50">{t.name}</span>
                <span className="text-2xs text-regolith-400">{t.body === "moon" ? "Moon" : "Mars"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Ranking() {
  const s = useStore();
  const hasTarget = !!s.twinOrigin;
  return (
    <section className="hair-t px-4 pt-3 pb-4">
      <h3 className="text-sm font-semibold text-regolith-50">Rank by</h3>
      <div className="mt-2">
        <Segmented label="Ranking" value={s.nearMode} onChange={(v) => s.setNear({ nearMode: v })} options={[
          { value: "nearest", label: "Distance" },
          { value: "best", label: "Similarity", disabled: !hasTarget, title: hasTarget ? undefined : "Choose a Moon or Mars target first" },
        ]} />
      </div>
      <p className="mt-1.5 text-xs leading-snug text-regolith-400">
        {s.nearMode === "nearest"
          ? "Documented analog sites, nearest first. Being close says nothing about how good an analog a place is."
          : "The best Earth Twin matches inside the radius. Distance is shown, but never changes a grade."}
      </p>
      <div className="mt-3 text-2xs text-regolith-400">Search radius</div>
      <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Search radius">
        {RADII[s.units].map((r) => (
          <button key={r} type="button" aria-pressed={s.nearRadius === r} onClick={() => s.setNear({ nearRadius: r })}
            className={cx("ctl rounded-sm px-2 py-1 text-xs ring-1 ring-[var(--hair)]", s.nearRadius === r ? "bg-world text-world-ink" : "text-regolith-200")}>
            {radiusText(r, s.units)}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-0.5">
        {s.nearMode === "best" && <Switch checked={s.nearDocOnly} onChange={(v) => s.setNear({ nearDocOnly: v })} label="Documented sites only" hint="Leave out modelled regions found by the data alone." />}
        <div className="flex items-center justify-between px-2 pt-1">
          <span className="text-sm text-regolith-200">Units</span>
          <Segmented size="sm" label="Distance units" value={s.units} onChange={(v) => s.setNear({ units: v })} options={[{ value: "km", label: "km" }, { value: "mi", label: "miles" }]} />
        </div>
      </div>
    </section>
  );
}

function Controls() {
  return (<><Location /><Target /><Ranking /></>);
}

/* ---------------------------------------------------------------- results */
function Scatter({ items, active, onPick, units }: { items: Item[]; active: string | null; onPick: (it: Item) => void; units: "km" | "mi" }) {
  const pts = items.filter((it) => it.similarity && it.similarity.score !== null);
  if (pts.length < 2) return null;
  const W = 360, H = 170, L = 34, B = 26, T = 8, R = 10;
  const maxD = Math.max(...pts.map((p) => p.distance_km)) * 1.05 || 1;
  const x = (d: number) => L + (d / maxD) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const conv = units === "mi" ? 1 / KM_PER_MI : 1;
  const ticks = [0, 0.5, 1].map((f) => f * maxD);
  return (
    <figure className="px-4 pt-1 pb-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Distance against similarity for each result">
        {[0.35, 0.5, 0.65, 0.8].map((g) => <line key={g} x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--hair)" />)}
        {[["A", 0.9], ["B", 0.72], ["C", 0.57], ["D", 0.42], ["F", 0.17]].map(([g, v]) => (
          <text key={g as string} x={L - 8} y={y(v as number) + 3} textAnchor="end" className="fill-regolith-400 text-[9px]">{g}</text>
        ))}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--hair-strong)" />
        {ticks.map((t) => <text key={t} x={x(t)} y={H - B + 13} textAnchor="middle" className="tnum fill-regolith-400 text-[9px]">{Math.round(t * conv).toLocaleString("en-US")}</text>)}
        <text x={(W + L) / 2} y={H - 2} textAnchor="middle" className="fill-regolith-500 text-[9px]">Straight-line distance ({units})</text>
        {pts.map((p) => {
          const g = p.similarity!.grade as Grade;
          const on = active === p.key;
          const cx_ = x(p.distance_km), cy_ = y(p.similarity!.score!);
          return (
            <g key={p.key} onClick={() => onPick(p)} className="cursor-pointer" role="button" tabIndex={0} aria-label={`${itemName(p)}, grade ${g}, ${distText(p.distance_km, units)}`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(p)}>
              {p.kind === "documented"
                ? <rect x={cx_ - 5} y={cy_ - 5} width={10} height={10} transform={`rotate(45 ${cx_} ${cy_})`} fill={GRADE_HEX[g]} stroke={on ? "#f6f2e9" : "#101216"} strokeWidth={on ? 2 : 1.2} />
                : <circle cx={cx_} cy={cy_} r={on ? 7 : 5.5} fill={GRADE_HEX[g]} stroke={on ? "#f6f2e9" : "#101216"} strokeWidth={on ? 2 : 1.2} />}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-2xs leading-snug text-regolith-500">Up is a closer match, left is nearer. Select a point to select that result. Documented sites and modelled regions are labelled separately. A decision aid only: distance never changes a grade.</figcaption>
    </figure>
  );
}

function ResultRow({ it, active, units, hasTarget }: { it: Item; active: boolean; units: "km" | "mi"; hasTarget: boolean }) {
  const { setNear, flyTo, startTwin, pickEarth, openBrief } = useStore.getState();
  const target = useStore((s) => s.twinOrigin);
  const sim = it.similarity;
  const tags = it.kind === "documented" ? it.tags.environment.filter((t) => t.id !== "other").map((t) => t.label) : [];
  const open = () => { setNear({ nearActive: it.key }); flyTo("earth", it.lat, it.lon, 900); };
  return (
    <li id={`near-${it.key}`} className={cx("border-t border-[var(--hair)] first:border-t-0", active && "bg-basalt-800/70")}>
      <button type="button" onClick={open} aria-expanded={active} className="row-ctl grid w-full grid-cols-[22px_28px_1fr_auto] items-center gap-x-2.5 px-4 py-2.5 text-left">
        <span className="tnum text-xs text-regolith-400" aria-label={`Result ${it.n}`}>#{it.n}</span>
        {hasTarget ? <GradeTile grade={sim?.grade ?? null} size="sm" title={sim?.grade ? `${GRADE_MEANING[sim.grade]} match` : "Not graded: too little comparable data"} />
          : <span className="grid size-6 place-items-center"><span className="block size-2.5 rotate-45 rounded-[2px] border-[1.5px] border-regolith-100" /></span>}
        <span className="min-w-0">
          <span className={cx("block truncate text-sm text-regolith-50", it.kind === "documented" && "placename text-md")}>{itemName(it)}</span>
          <span className="block truncate text-2xs text-regolith-400">
            {it.kind === "documented" ? `Documented site${tags.length ? `, ${tags.join(", ").toLowerCase()}` : ""}` : `Modelled region, ${Math.round(it.cell_km[0])} km cell`}
          </span>
        </span>
        <span className="tnum text-right text-xs text-regolith-200">{distText(it.distance_km, units)}</span>
      </button>
      {active && (
        <div className="anim-fade px-4 pb-3 pl-[64px] text-xs leading-snug text-regolith-300">
          <p className="tnum text-regolith-400">{it.coords}</p>
          {it.kind === "documented" && <p className="mt-1">{it.theme}. <span className="text-regolith-500">{it.source}</span></p>}
          {it.kind === "modelled_region" && <p className="mt-1">{it.documented_nearby ? `${it.documented_nearby.name} is ${distText(it.documented_nearby.distance_km, units)} away.` : "Found by the data alone; not in RADIUM's reference list of documented sites. It would need field verification."}</p>}
          {sim && (sim.strong.length > 0 || sim.weak.length > 0) && (
            <p className="mt-1">{sim.strong.length > 0 && <>Matches well on {sim.strong.join(", ").toLowerCase()}. </>}{sim.weak.length > 0 && <>Weak on {sim.weak.join(", ").toLowerCase()}.</>}</p>
          )}
          {hasTarget && sim?.score === null && <p className="mt-1 text-regolith-400">Not graded: too little comparable data at this place.</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => useStore.getState().addCompare({ body: "earth", lat: it.lat, lon: it.lon, label: itemName(it) })}><Columns2 size={13} /> Add to Compare</Button>
            <Button size="sm" variant="outline" onClick={() => useStore.getState().saveSite({ body: "earth", lat: it.lat, lon: it.lon, label: itemName(it) })}><Bookmark size={13} /> Save</Button>
            <a className="ctl inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-regolith-200 ring-1 ring-[var(--hair-strong)]" href={`https://www.openstreetmap.org/?mlat=${it.lat.toFixed(4)}&mlon=${it.lon.toFixed(4)}#map=9/${it.lat.toFixed(4)}/${it.lon.toFixed(4)}`} target="_blank" rel="noreferrer" title="Opens OpenStreetMap in a new tab. Roads and access are not checked by RADIUM.">
              <ExternalLink size={12} /> Open map
            </a>
            {target && (
              <>
                <Button size="sm" variant="solid" onClick={() => { startTwin(target); void pickEarth(it.lat, it.lon, true); }}><ArrowLeftRight size={13} /> Compare</Button>
                <Button size="sm" variant="outline" onClick={() => openBrief({ lat: it.lat, lon: it.lon })}><FileText size={13} /> Build a test plan</Button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Results() {
  const s = useStore();
  const r = s.nearResult;
  const items: Item[] = useMemo(() => {
    if (!r) return [];
    const docs = r.documented.map((d) => ({ ...d, key: `d:${d.name}` }));
    const regs = r.regions.map((g) => ({ ...g, key: `r:${g.lat},${g.lon}` }));
    const all = r.query.mode === "best"
      ? [...docs, ...regs].sort((a, b) => (b.similarity?.score ?? -1) - (a.similarity?.score ?? -1) || a.distance_km - b.distance_km)
      : docs;
    return all.map((it, k) => ({ ...it, n: k + 1 }));
  }, [r]);
  const pick = (it: Item) => { s.setNear({ nearActive: it.key }); s.flyTo("earth", it.lat, it.lon, 900); };

  if (!s.nearLoc) {
    return (
      <div className="anim-rise p-5">
        <h2 className="placename placename-lg text-regolith-50">Find an analog near you</h2>
        <p className="mt-2 text-sm leading-relaxed text-regolith-300">Set a starting point to list documented Moon and Mars analog sites by straight-line distance. Add a Moon or Mars target to rank nearby places by how closely they match it.</p>
        <p className="mt-3 text-xs leading-relaxed text-regolith-400">Distances are measured along Earth's surface in a straight line. They do not account for roads, borders, permits or whether a site can be visited.</p>
      </div>
    );
  }
  if (s.nearStatus === "error") return <div className="p-4"><Notice tone="error" title="No results" action={<Button size="sm" variant="outline" onClick={() => void s.runNearby()}>Try again</Button>}>{s.nearError}</Notice></div>;
  if (!r) return <div className="p-5"><Spinner label="Measuring distances" /></div>;
  const ctx = r.query.mode === "best" ? `Best ${r.target?.score_context ?? "matches"} within ${radiusText(r.query.radius_km, s.units)}` : `Documented analog sites within ${radiusText(r.query.radius_km, s.units)}, nearest first`;
  return (
    <div className={cx(s.nearStatus === "loading" && "opacity-70")} aria-busy={s.nearStatus === "loading"}>
      <header className="px-4 pt-4 pb-2">
        <h2 className="text-md font-semibold text-regolith-50">{items.length ? `${items.length} result${items.length === 1 ? "" : "s"}` : "Nothing within this radius"}</h2>
        <p className="mt-0.5 text-xs leading-snug text-regolith-300">{ctx}.</p>
        {items.length > 0 && (
          <Button size="sm" variant="outline" className="mt-2" onClick={() => downloadCsv(`radium-near-${r.query.mode}.csv`,
            ["rank", "type", "name", "lat", "lon", "distance_km", "similarity_score", "similarity_grade", "similarity_coverage", "score_context", "source"],
            items.map((it) => [it.n, it.kind === "documented" ? "documented_site" : "modelled_region", itemName(it), it.lat, it.lon, it.distance_km,
              it.similarity?.score ?? null, it.similarity?.grade ?? null, it.similarity?.coverage ?? null, r.target?.score_context ?? null,
              it.kind === "documented" ? it.source : "RADIUM Earth Twin grid cell (0.25 deg)"]),
            [`RADIUM Near Me export. Mode: ${r.query.mode}. Radius ${r.query.radius_km} km.`, "distance_km is great-circle distance on Earth's surface; it says nothing about access.",
              "similarity_* is Earth Twin similarity to the stated target (RADIUM's own scale, not a NASA rating); empty means not graded.", "The starting location is not included."])}>
            <Download size={13} /> Download CSV
          </Button>
        )}
        {r.target && <p className="mt-1 text-2xs leading-snug text-regolith-500">Grades are Earth Twin similarity to the {r.target.body === "moon" ? "Moon" : "Mars"} target ({r.target.purpose_label.toLowerCase()}), on RADIUM's own A–F scale. They are not mission suitability and not NASA ratings.</p>}
      </header>
      {items.length === 0 ? (
        <div className="px-4 pb-4">
          <p className="text-sm leading-relaxed text-regolith-300">
            {r.query.mode === "best" ? "No land cell or documented site inside this radius has enough comparable data to grade." : `None of RADIUM's ${r.catalogue_size} documented analog sites lies within this radius.`}
          </p>
          {r.query.radius_km < 20000 && <Button size="sm" variant="outline" className="mt-2" onClick={() => s.setNear({ nearRadius: RADII[s.units].find((x) => x > r.query.radius_km) ?? 20015 })}>Widen the search</Button>}
        </div>
      ) : (
        <>
          {r.query.mode === "best" && <Scatter items={items} active={s.nearActive} onPick={pick} units={s.units} />}
          <ul className="pb-2">{items.map((it) => <ResultRow key={it.key} it={it} active={s.nearActive === it.key} units={s.units} hasTarget={!!r.target} />)}</ul>
        </>
      )}
      <ul className="hair-t space-y-1 px-4 py-3 text-2xs leading-snug text-regolith-500">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}

/* ------------------------------------------------------------------- view */
/** The same three-step rail as the other paths. Step 2 is optional: without a Moon or Mars site, places are listed by distance. */
function NearRail() {
  const loc = useStore((s) => s.nearLoc);
  const target = useStore((s) => s.twinOrigin);
  const result = useStore((s) => s.nearResult);
  const status = useStore((s) => s.nearStatus);
  const pins = useStore((s) => s.pins);
  const found = result ? result.documented.length + result.regions.length : 0;
  const jump = (id: string) => () => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  return (
    <StepRail label="Near Me steps" steps={[
      { title: "Where you are", state: loc ? "done" : "open", onOpen: jump("near-step-1"), summary: loc ? <><span className="placename">{loc.label ?? "Your place"}</span><span className="mono">{formatCoord(loc.lat, loc.lon)}</span></> : "Use your location, type a city or click the map" },
      { title: "What to match (optional)", state: target ? "done" : loc ? "open" : "todo", onOpen: jump("near-step-2"), summary: target ? <span className="placename">{targetLabel({ pins }, target, formatCoord(target.lat, target.lon))}</span> : "Pick a Moon or Mars site to rank the places near you" },
      { title: "Nearby places", state: loc && status === "ready" ? "open" : "todo", summary: loc && status === "ready" ? `${found} ${found === 1 ? "place" : "places"} found` : "Listed on the right" },
    ]} />
  );
}

export function NearView() {
  const meta = useStore((s) => s.meta)!;
  const nearLoc = useStore((s) => s.nearLoc);
  const r = useStore((s) => s.nearResult);
  const active = useStore((s) => s.nearActive);
  const focus = useStore((s) => s.focus);
  const earthLayers = useStore((s) => s.layers.earth);
  const setNear = useStore((s) => s.setNear);
  const handle = useRef<GlobeHandle>(null);
  const tapes = useRef<TapesHandle>(null);
  const basemap = meta.layers.earth.tiles.find((b) => b.id === earthLayers.base) ?? meta.layers.earth.tiles[0];

  const markers: SiteMarker[] = useMemo(() => {
    if (!r) return [];
    const docs = r.documented.map((d) => ({ key: `d:${d.name}`, ...d }));
    const regs = r.regions.map((g) => ({ key: `r:${g.lat},${g.lon}`, ...g }));
    const all = r.query.mode === "best" ? [...docs, ...regs].sort((a, b) => (b.similarity?.score ?? -1) - (a.similarity?.score ?? -1) || a.distance_km - b.distance_km) : docs;
    return all.map((it, k) => ({ id: it.key, lat: it.lat, lon: it.lon, text: it.similarity?.grade ?? "·", grade: it.similarity?.grade ?? null, active: active === it.key }));
  }, [r, active]);
  const onPick = useCallback((lat: number, lon: number) => {
    setNear({ nearLoc: { lat: +lat.toFixed(4), lon: +lon.toFixed(4), source: "map" } });
  }, [setNear]);
  const onView = useCallback((v: ViewState) => tapes.current?.draw(v), []);

  return (
    <>
      <aside className="surface hair-r scroll z-20 h-full w-[320px] shrink-0 max-lg:w-[288px] max-md:hidden" aria-label="Near Me settings">
        <div className="px-4 pt-3 pb-2"><h2 className="text-md font-semibold text-regolith-50">Near Me</h2><p className="mt-1 text-xs leading-relaxed text-regolith-400">Documented analog sites close to a place you choose, and what each is studied for.</p></div>
        <NearRail />
        <Controls />
      </aside>
      <div className="relative h-full min-w-0 flex-1 overflow-hidden bg-void">
        <EarthMap ref={handle} basemap={basemap} labels={earthLayers.labels} overlayUrl={null} pins={[]} markers={markers}
          onMarker={(id) => { const m = markers.find((x) => x.id === id); setNear({ nearActive: id }); if (m) useStore.getState().flyTo("earth", m.lat, m.lon, 900); document.getElementById(`near-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}
          selection={nearLoc ? { lat: nearLoc.lat, lon: nearLoc.lon } : null} focus={focus} onPick={onPick} onView={onView} />
        <Tapes ref={tapes} />
        <div className="surface-float absolute top-3 right-3 z-20 flex flex-col rounded-md ring-1 ring-[var(--hair)]">
          <IconButton label="Zoom in" onClick={() => handle.current?.zoom(0.5)}><Plus size={16} /></IconButton>
          <IconButton label="Zoom out" onClick={() => handle.current?.zoom(2)}><Minus size={16} /></IconButton>
          <IconButton label="Reset the view" onClick={() => handle.current?.home()}><Home size={15} /></IconButton>
        </div>
        <div className="pointer-events-none absolute bottom-11 left-[72px] z-20 max-sm:left-3">
          <div className="surface-float pointer-events-auto w-[248px] rounded-md p-3 text-2xs leading-snug text-regolith-300 ring-1 ring-[var(--hair)]">
            <div className="text-sm font-semibold text-regolith-50">Near Me</div>
            <p className="mt-0.5">The white dot is your starting point; click the map to move it. Letters and their colours show calculated similarity grades; grey circles are not scored{r?.target ? ", coloured by similarity grade (grey: not graded)" : ""}.</p>
          </div>
        </div>
        <div className="pointer-events-none absolute right-3 bottom-9 z-20 max-w-[54%] text-right text-[10px] leading-tight text-regolith-400 [text-shadow:0_1px_2px_#000]">{basemap.attribution}. {LABEL_ATTRIBUTION}.</div>
      </div>
      <aside className="surface hair-l scroll z-20 h-full w-[400px] shrink-0 max-xl:w-[360px] max-lg:absolute max-lg:top-0 max-lg:right-0 max-lg:bottom-0 max-lg:shadow-[var(--shadow-float)] max-sm:top-auto max-sm:h-[62%] max-sm:w-full" aria-label="Nearby analogs">
        <div className="md:hidden"><Controls /></div>
        <div className="max-md:border-t max-md:border-[var(--hair)]"><Results /></div>
      </aside>
    </>
  );
}
