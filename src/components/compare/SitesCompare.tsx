import { ArrowLeftRight, Download, MapPin, Rocket, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { OrbitalTile } from "@/components/panels/OrbitalTile";
import { Button, cx, Notice, Segmented, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { formatValue, inUnit } from "@/lib/format";
import type { Body, CellInfo, Measure, Planet } from "@/lib/types";
import { type SiteRef, useStore } from "@/store";

type Dir = -1 | 0 | 1; // lower is better, neutral, higher is better
type Preset = { id: string; label: string; blurb: string; rows: [string, Dir][] };
const PRESETS: Preset[] = [
  { id: "landing", label: "Landing", blurb: "Smooth, gentle ground; on Mars also low elevation (more air to slow down) and clear skies.",
    rows: [["flat_frac", 1], ["slope_med", -1], ["slope_p90", -1], ["rough_iqr", -1], ["elev_mean", 0], ["ps_mean", 1], ["dust_tau", -1]] },
  { id: "rover", label: "Rover", blurb: "Traversable terrain and power for driving.",
    rows: [["slope_med", -1], ["slope_p90", -1], ["rough_iqr", -1], ["flat_frac", 1], ["illum_frac", 1], ["solar_flux", 1]] },
  { id: "habitat", label: "Habitat", blurb: "Power, contact with Earth, milder temperatures and possible water.",
    rows: [["illum_frac", 1], ["earth_vis", 1], ["tmax", 0], ["tmin", 0], ["h_ppm", 1], ["weh_wt", 1], ["dist_psr_km", -1], ["flat_frac", 1]] },
  { id: "science", label: "Science", blurb: "Composition and surface properties. Differences, not better or worse.",
    rows: [["feo_wt", 0], ["tio2_wt", 0], ["th_ppm", 0], ["fe_wt", 0], ["si_wt", 0], ["cl_wt", 0], ["thermal_inertia", 0], ["albedo", 0], ["lith", 0]] },
  { id: "all", label: "All shared", blurb: "Every measurement the selected places have in common.", rows: [] },
];
const WORLD: Record<Body, string> = { moon: "Moon", mars: "Mars", earth: "Earth" };

const cache = new Map<string, Promise<CellInfo>>();
const keyOf = (s: SiteRef) => `${s.body}:${s.lat.toFixed(4)},${s.lon.toFixed(4)}`;
function loadCell(s: SiteRef) {
  const k = keyOf(s);
  if (!cache.has(k)) cache.set(k, api.cell(s.body, s.lat, s.lon).catch((e) => { cache.delete(k); throw e; }));
  return cache.get(k)!;
}

export function SitesCompare() {
  const meta = useStore((s) => s.meta)!;
  const list = useStore((s) => s.compareList);
  const temp = useStore((s) => s.tempUnit);
  const { removeCompare, clearCompare, addCompare, select, setBody, setMode, startTwin } = useStore.getState();
  const [cells, setCells] = useState<Record<string, CellInfo | string>>({});
  const [preset, setPreset] = useState("landing");

  useEffect(() => {
    let live = true;
    for (const s of list) {
      const k = keyOf(s);
      if (cells[k]) continue;
      loadCell(s).then((c) => live && setCells((x) => ({ ...x, [k]: c })), (e) => live && setCells((x) => ({ ...x, [k]: String(e.message ?? e) })));
    }
    return () => { live = false; };
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = list.map((s) => cells[keyOf(s)]).filter((c): c is CellInfo => typeof c === "object");
  const index = useMemo(() => list.map((site) => { const m = new Map<string, Measure>(); const c=cells[keyOf(site)]; if(typeof c === "object")c.groups.forEach((g) => g.items.forEach((i) => m.set(i.id, i))); return m; }), [cells, list]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = PRESETS.find((x) => x.id === preset)!;
  const rows: [string, Dir][] = useMemo(() => {
    if (p.id !== "all") return p.rows.filter(([id]) => index.some((m) => m.has(id)));
    const shared = index.length ? [...index[0].keys()].filter((id) => index.every((m) => m.has(id))) : [];
    return shared.map((id) => [id, 0 as Dir]);
  }, [p, index]);
  const bodies = new Set(list.map((s) => s.body));

  if (list.length === 0) {
    const sel = useStore.getState().cell;
    return (
      <div className="scroll grid h-full place-items-center p-6">
        <div className="max-w-lg text-center">
          <h2 className="font-serif text-[1.8rem] leading-tight font-medium tracking-[-0.03em] text-regolith-50">Compare places side by side</h2>
          <p className="mt-2 text-sm leading-relaxed text-regolith-300">Add up to four places from Explore, Earth Analogs, Near Me or your saved list with their Compare button. Or start with one of these pairs:</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {sel && <Button variant="solid" onClick={() => addCompare({ body: sel.body, lat: sel.cell.lat, lon: sel.cell.lon, label: sel.place.label })}>Add the selected place</Button>}
            <Button variant="outline" onClick={() => { addCompare({ body: "moon", lat: -89.45, lon: -137.31, label: "Ridge beside Shackleton" }); addCompare({ body: "moon", lat: -84.6, lon: 31.0, label: "Mons Mouton" }); }}>Two lunar south-pole sites</Button>
            <Button variant="outline" onClick={() => { addCompare({ body: "mars", lat: 18.44, lon: 77.45, label: "Jezero crater" }); addCompare({ body: "mars", lat: -4.59, lon: 137.44, label: "Gale crater" }); }}>Jezero and Gale on Mars</Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- evidence statements: only from measured differences big enough to matter
  const statements = list.map((_, si) => {
    const why: string[] = [], whyNot: string[] = [];
    for (const [id, dir] of rows) {
      const vals = index.map((m) => m.get(id)?.value ?? null);
      const mine = vals[si];
      const label = index.find((m) => m.get(id))?.get(id)?.label ?? id;
      if (mine === null || mine === undefined) { if (index[si]) whyNot.push(`No ${label.toLowerCase()} data`); continue; }
      const others = vals.filter((v, k) => k !== si && v !== null) as number[];
      if (!others.length || dir === 0) continue;
      const lo = Math.min(mine, ...others), hi = Math.max(mine, ...others);
      if (hi - lo <= Math.max(Math.abs(hi), Math.abs(lo)) * 0.1) continue; // less than 10 % apart: no claim
      const best = dir < 0 ? lo : hi, worst = dir < 0 ? hi : lo;
      const m0 = index[si].get(id)!;
      const show = (v: number) => (m0.fmt === "percent" ? `${Math.round(v * 100)}%` : `${formatValue(v, m0.dec)}${m0.unit ? ` ${m0.unit}` : ""}`);
      if (mine === best) why.push(`${dir < 0 ? "Lowest" : "Highest"} ${label.toLowerCase()} (${show(mine)})`);
      else if (mine === worst) whyNot.push(`${dir < 0 ? "Highest" : "Lowest"} ${label.toLowerCase()} (${show(mine)})`);
    }
    return { why, whyNot };
  });

  const exportCsv = () => downloadCsv("radium-compare.csv", ["measurement", "unit", ...list.map((s) => `${s.label} (${WORLD[s.body]} ${s.lat.toFixed(2)}, ${s.lon.toFixed(2)})`)],
    rows.map(([id]) => { const m0 = index.find((m) => m.get(id))?.get(id); return [m0?.label ?? id, m0?.unit ?? "", ...index.map((m) => m.get(id)?.value ?? null)]; }),
    ["RADIUM comparison. Values are cell averages from each world's own datasets; empty means no data."]);

  return (
    <div className="scroll h-full">
      <div className="mx-auto max-w-[1200px] px-4 pt-4 pb-10 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Comparison preset" value={preset} onChange={setPreset} options={PRESETS.map((x) => ({ value: x.id, label: x.label }))} />
          <span className="text-xs text-regolith-400">{p.blurb}</span>
          <span className="ml-auto flex gap-1.5">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!ready.length}><Download size={13} /> CSV</Button>
            <Button size="sm" onClick={clearCompare}>Clear all</Button>
          </span>
        </div>
        {bodies.size > 1 && <div className="mt-3"><Notice tone="info">These places are on different worlds. Values with the same name are measured by different instruments on different grids (cell sizes shown on each card); terrain uses the same method everywhere, other rows are for orientation only.</Notice></div>}

        <div className="comparison-cards mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(240px, 1fr))`, overflowX: "auto" }}>
          {list.map((s, si) => {
            const c = cells[keyOf(s)];
            const base = s.body === "earth" ? meta.layers.earth.tiles[0] : meta.layers[s.body].tiles.find((t) => t.group === "imagery") ?? meta.layers[s.body].tiles[0];
            return (
              <section key={keyOf(s)} className="min-w-0 rounded-md bg-basalt-900/70 p-3 ring-1 ring-[var(--hair)]">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-2xs text-regolith-400">{WORLD[s.body]}</div>
                    <h3 className="placename text-lg leading-tight text-regolith-50 [overflow-wrap:anywhere]">{typeof c === "object" ? c.place.label : s.label}</h3>
                    <p className="tnum text-2xs text-regolith-400">{s.lat.toFixed(2)}, {s.lon.toFixed(2)}{typeof c === "object" ? `, ${Math.round(c.cell.size_km[0])} km cell` : ""}</p>
                  </div>
                  <button type="button" className="ctl grid size-7 place-items-center rounded-sm text-regolith-300" aria-label={`Remove ${s.label}`} onClick={() => removeCompare(si)}><X size={14} /></button>
                </div>
                <div className="mt-2"><OrbitalTile body={s.body} lat={s.lat} lon={s.lon} layer={base} /></div>
                {typeof c === "string" && <Notice tone="error">{c}</Notice>}
                {typeof c === "object" && (
                  <div className="mt-2 grid gap-2 text-xs">
                    <div><div className="font-semibold text-grade-b">Why this site</div>{statements[si].why.length ? <ul className="mt-0.5 space-y-0.5 text-regolith-200">{statements[si].why.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="text-regolith-500">No clear measured advantage for this preset.</p>}</div>
                    <div><div className="font-semibold text-alert">Why not</div>{statements[si].whyNot.length ? <ul className="mt-0.5 space-y-0.5 text-regolith-200">{statements[si].whyNot.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="text-regolith-500">No clear measured drawback for this preset.</p>}</div>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button size="sm" onClick={() => { setBody(s.body); setMode("explore"); void select(s.body, s.lat, s.lon, { fly: true, spanKm: s.body === "earth" ? 900 : 500 }); }}><MapPin size={12} /> Explore</Button>
                  {s.body !== "earth" && <Button size="sm" onClick={() => startTwin({ body: s.body as Planet, lat: s.lat, lon: s.lon })}><ArrowLeftRight size={12} /> Earth twins</Button>}
                  {s.body !== "earth" && <Button size="sm" onClick={() => { const st = useStore.getState(); const m = meta.missions.find((x) => x.body === s.body); if (m) st.setMission(m.id); st.setMode("mission"); void st.select(s.body, s.lat, s.lon, { fly: true, spanKm: 500 }); }}><Rocket size={12} /> Mission</Button>}
                </div>
              </section>
            );
          })}
        </div>

        <section className="mt-5 rounded-md bg-basalt-900/70 p-4 ring-1 ring-[var(--hair)]">
          <h3 className="text-sm font-semibold text-regolith-50">Measurements</h3>
          {ready.length < list.length && <div className="mt-2"><Spinner label="Reading the grids for each place" /></div>}
          {rows.length === 0 ? <p className="mt-2 text-sm text-regolith-400">None of this preset's measurements exist for these places. Try another preset or All shared.</p> : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] table-fixed text-xs">
                <thead><tr className="text-left text-regolith-400"><th className="w-[26%] py-1 font-medium">Measurement</th>{list.map((s, k) => <th key={k} className="py-1 pl-2 font-medium [overflow-wrap:anywhere]">{s.label}</th>)}</tr></thead>
                <tbody>
                  {rows.map(([id, dir]) => {
                    const ms = index.map((m) => m.get(id));
                    const m0 = ms.find(Boolean)!;
                    const vals = ms.map((m) => (m ? inUnit(m, temp) : undefined));
                    const nums = vals.map((v) => v?.value).filter((v): v is number => v !== null && v !== undefined);
                    const lo = Math.min(...nums), hi = Math.max(...nums);
                    return (
                      <tr key={id} className="border-t border-[var(--hair)] align-top">
                        <td className="py-1.5 pr-2 text-regolith-200">{m0.label}{dir !== 0 && <span className="block text-2xs text-regolith-500">{dir < 0 ? "lower is better here" : "higher is better here"}</span>}</td>
                        {vals.map((v, k) => {
                          const val = v?.value;
                          const text = v === undefined ? "not measured" : val === null || val === undefined ? "no data" : v.fmt === "percent" ? `${Math.round(val * 100)}%` : v.text ?? `${formatValue(val, v.dec)}${v.unit ? ` ${v.unit}` : ""}`;
                          const frac = val === null || val === undefined || hi === lo ? null : (val - lo) / (hi - lo);
                          const good = dir !== 0 && frac !== null && ((dir < 0 && val === lo) || (dir > 0 && val === hi));
                          return (
                            <td key={k} className="py-1.5 pl-2">
                              <span className={cx("tnum", val === null || val === undefined ? "text-regolith-500 italic" : good ? "font-semibold text-regolith-50" : "text-regolith-200")}>{text}{good && " ✓"}</span>
                              {frac !== null && <span className="mt-1 block h-1 rounded-full bg-basalt-700"><span className="block h-1 rounded-full" style={{ width: `${Math.max(4, frac * 100)}%`, background: good ? "var(--color-grade-b)" : "var(--color-regolith-400)" }} /></span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-2xs leading-snug text-regolith-500">Bars run from the lowest to the highest value among these places. A tick marks the best value where the preset says which direction is better. Statements above appear only where values differ by more than 10%; missing data is listed as a drawback, never as zero. This is a screening comparison of cell averages, not a landing or construction assessment.</p>
        </section>
      </div>
    </div>
  );
}
