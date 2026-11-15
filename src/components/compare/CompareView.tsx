import { RegistrySelect, SiteEvidence } from "@/components/catalog/SiteCatalog";
import { ArrowLeft, Bookmark, BookOpen, FileText, Navigation } from "lucide-react";
import { SitesCompare } from "@/components/compare/SitesCompare";
import { useMemo, useState } from "react";

import { EarthMap } from "@/components/map/LazyEarthMap";
import { GlobeView } from "@/components/map/GlobeView";
import { Photos } from "@/components/ui/Photos";
import { Button, cx, GradeTile, Notice, Spinner } from "@/components/ui/primitives";
import { AssessmentChips, AssessmentGrade } from "@/components/ui/Assessment";
import { similarityFactors } from "@/lib/assessment";
import { GRADE_HEX, GRADE_MEANING, pct } from "@/lib/format";
import { photoKey, photosFor } from "@/lib/photos";
import type { CellInfo, DimDetail, Pair, Planet } from "@/lib/types";
import { useStore } from "@/store";

const fmt = (v: number | null, dec: number, text?: string) => (text ? text : v === null || v === undefined ? "no data" : v.toFixed(dec));

/** Radar of the normalised (0–1) similarity scores. Only dimensions that were actually compared are drawn. */
function Radar({ dims }: { dims: DimDetail[] }) {
  const pts = dims.filter((d) => d.weight > 0 && d.score !== null);
  if (pts.length < 3) return <p className="text-xs text-regolith-400">A radar needs at least three compared dimensions; see the bars instead.</p>;
  const S = 300, c = S / 2, R = 88;
  const ang = (k: number) => -Math.PI / 2 + (k * 2 * Math.PI) / pts.length;
  const xy = (k: number, v: number) => [c + Math.cos(ang(k)) * R * v, c + Math.sin(ang(k)) * R * v];
  const poly = pts.map((d, k) => xy(k, d.score!).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[300px]" role="img" aria-label={`Similarity by dimension: ${pts.map((d) => `${d.label} ${d.grade}`).join(", ")}`}>
      {[0.35, 0.5, 0.65, 0.8, 1].map((g) => (
        <polygon key={g} points={pts.map((_, k) => xy(k, g).join(",")).join(" ")} fill="none" stroke={g === 1 ? "var(--hair-strong)" : "var(--hair)"} />
      ))}
      {pts.map((_, k) => { const [x, y] = xy(k, 1); return <line key={k} x1={c} y1={c} x2={x} y2={y} stroke="var(--hair)" />; })}
      <polygon points={poly} fill="color-mix(in srgb, var(--world) 22%, transparent)" stroke="var(--world)" strokeWidth={1.6} />
      {pts.map((d, k) => {
        const [x, y] = xy(k, d.score!);
        const [lx, ly] = xy(k, 1.14);
        const cs = Math.cos(ang(k));
        const anchor = cs > 0.3 ? "start" : cs < -0.3 ? "end" : "middle";
        return (
          <g key={d.id}>
            <circle cx={x} cy={y} r={4.5} fill={GRADE_HEX[d.grade!]} stroke="#08111f" strokeWidth={1.2} />
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="fill-regolith-200 text-[9.5px]">{d.label}</text>
            <text x={lx} y={ly + 11} textAnchor={anchor} dominantBaseline="middle" className="fill-regolith-400 text-[9px] font-semibold">{d.grade}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Pairs({ pairs, world }: { pairs: Pair[]; world: string }) {
  if (!pairs.length) return null;
  return (
    <table className="mt-1.5 w-full table-fixed text-xs">
      <thead><tr className="text-left text-regolith-500"><th className="w-[48%] py-0.5 font-normal" /><th className="py-0.5 text-right font-medium">{world}</th><th className="py-0.5 pl-2 text-right font-medium">Earth</th></tr></thead>
      <tbody>{pairs.map((p) => (
        <tr key={p.label} className="border-t border-[var(--hair)]">
          <td className="py-0.5 pr-2 text-regolith-300">{p.label}{p.unit ? ` (${p.unit})` : ""}</td>
          <td className="tnum py-0.5 text-right text-regolith-100">{fmt(p.planet, p.dec, p.planet_text)}</td>
          <td className="tnum py-0.5 pl-2 text-right text-regolith-100">{fmt(p.earth, p.dec, p.earth_text)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function Side({ cell, title, world }: { cell: CellInfo; title: string; world: "moon" | "mars" | "earth" }) {
  const meta = useStore((s) => s.meta)!;
  const focus = useMemo(() => ({ body: world, lat: cell.cell.lat, lon: cell.cell.lon, spanKm: world === "earth" ? 900 : 700, nonce: 2e6 + Math.round((cell.cell.lat + 90) * 1000 + cell.cell.lon) }), [cell, world]);
  const sel = { lat: cell.cell.lat, lon: cell.cell.lon, outline: cell.cell.outline };
  const [ns, ew] = cell.cell.size_km;
  const pins=useStore(s=>s.pins[world]);
  const position=useStore(s=>world === "earth" ? s.picked : s.twinOrigin);
  const record=position?pins.find(p=>Math.abs(p.lat-position.lat)<0.001&&Math.abs(p.lon-position.lon)<0.001):undefined;
  const sources=[...new Set(cell.groups.flatMap(g=>g.items.map(m=>m.source)).filter((id):id is string=>!!id))].map(id=>meta.sources_index[id]).filter(Boolean);
  return (
    <section className="min-w-0 rounded-md bg-basalt-900/60 ring-1 ring-[var(--hair)]">
      <div className="relative h-[230px] overflow-hidden rounded-t-md bg-void">
        {world === "earth" ? (
          <EarthMap basemap={meta.layers.earth.tiles[0]} labels overlayUrl={null} pins={[]} markers={[]} selection={sel} focus={focus} />
        ) : (
          <GlobeView body={world as Planet} base={meta.layers[world as Planet].tiles.find((t) => t.group === "imagery") ?? meta.layers[world as Planet].tiles[0]} pins={[]} selection={sel} focus={focus} interactive={false} />
        )}
      </div>
      <div className="px-4 pt-3 pb-1">
        <div className="text-2xs text-regolith-400">{title}</div>
        <h2 className="placename mt-0.5 text-xl leading-tight text-regolith-50 [overflow-wrap:anywhere]">{record?.name ?? cell.place.label}</h2>
        <p className="tnum mt-1 text-xs text-regolith-300">{cell.coords}</p>
        <p className="mt-1 flex flex-wrap gap-1.5 text-2xs">
          <span className="rounded-xs bg-basalt-700 px-1.5 py-0.5 text-regolith-200" title="Values describe this whole analysis cell, not a point">Cell {Math.abs(ns - ew) < 0.3 ? `${Math.round(ns)} km` : `${Math.round(ns)} × ${Math.round(ew)} km`}</span>
          <span className="rounded-xs bg-basalt-700 px-1.5 py-0.5 text-regolith-200" title="How the grid was built">{world === "earth" ? "0.25° grid, ETOPO 2022 terrain" : world === "mars" ? "0.5° grid, MOLA terrain" : cell.cell.kind === "polar" ? "2.4 km polar grid, LOLA terrain" : "0.5° grid, LOLA terrain"}</span>
        </p>
      </div>
      <details className="mx-4 mt-3 text-xs"><summary className="cursor-pointer py-2 text-regolith-200">Site evidence and measurement sources</summary>{record&&<SiteEvidence site={record}/>}<ul className="my-3 space-y-1">{sources.map(s=><li key={`${s.url}:${s.name}`}><a className="link" href={s.url} target="_blank" rel="noreferrer">{s.name}</a></li>)}</ul></details>
      <div className="pt-2"><Photos compact id={`cmp-${photoKey(cell)}`} load={() => photosFor(cell)} /></div>
    </section>
  );
}

function PairView() {
  const meta = useStore((s) => s.meta)!;
  const c = useStore((s) => s.compare);
  const status = useStore((s) => s.compareStatus);
  const err = useStore((s) => s.compareError);
  const origin = useStore((s) => s.twinOrigin);
  const purpose = useStore((s) => s.purpose);
  const { setPurpose, setMode, openBrief, setSheet, pickEarth } = useStore.getState();

  if (!c || !origin) {
    return (
      <div className="scroll grid h-full w-full place-items-center p-6">
        <div className="max-w-md text-center">
          <h2 className="font-serif text-[1.8rem] leading-tight font-medium tracking-[-0.03em] text-regolith-50">No Earth twin pair yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-regolith-300">Choose a Moon or Mars site in Earth Analogs and open one of its Earth matches. The pair then appears here side by side.</p>
          <Button variant="solid" className="mt-4" onClick={() => setMode("twin")}>Go to Earth Analogs</Button>
        </div>
      </div>
    );
  }
  const body = origin.body;
  const world = body === "moon" ? "Moon" : "Mars";
  const m = c.match;
  const scored = m.dimensions.filter((d) => d.weight > 0);
  const strong = scored.filter((d) => d.score !== null && d.score >= 0.65);
  const weak = scored.filter((d) => d.score !== null && d.score < 0.5);
  const missing = scored.filter((d) => d.score === null);

  return (
    <div className={cx("scroll h-full w-full", status === "loading" && "opacity-75")} aria-busy={status === "loading"}>
      <div className="mx-auto max-w-[1180px] px-4 pt-4 pb-10 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setMode("twin")}><ArrowLeft size={13} /> Earth Analogs</Button>
          <label className="ml-auto flex items-center gap-2 text-xs text-regolith-300">Purpose
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="field h-8 w-auto">
              {meta.purposes[body].map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <Button size="sm" variant="solid" onClick={() => openBrief({ lat: c.earth.cell.lat, lon: c.earth.cell.lon })}><FileText size={13} /> Create a test brief</Button>
          <Button size="sm" variant="outline" onClick={() => setMode("near")}><Navigation size={13} /> Find nearer analogs</Button>
        </div>
        {status === "error" && <div className="mt-3"><Notice tone="error" title="The comparison could not be refreshed" action={<Button size="sm" variant="outline" onClick={() => void pickEarth(c.earth.cell.lat, c.earth.cell.lon)}>Try again</Button>}>{err}</Notice></div>}

        <p className="mt-4 text-xs leading-relaxed text-regolith-400">Published analog research documents a specific scientific use. The similarity grade below is independently calculated for your selected pair and purpose; it does not establish a historical research relationship between these exact places.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Side cell={c.planet} title={`${world} target`} world={body} />
          <Side cell={c.earth} title={c.documented ? `Earth place, ${Math.round(c.documented.distance_km)} km from ${c.documented.name}` : "Earth place, not in RADIUM's reference list"} world="earth" />
        </div>

        <section className="mt-5 grid gap-5 rounded-md bg-basalt-900/60 p-4 ring-1 ring-[var(--hair)] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="flex items-center gap-3.5">
              <AssessmentGrade grade={m.grade} coverage={m.coverage} model="similarity" size="xl" />
              <div>
                <div className="text-xs text-regolith-400">{meta.purposes[body].find((p) => p.id === purpose)?.label} similarity</div>
                <div className="text-lg font-semibold text-regolith-50">{m.grade ? `${GRADE_MEANING[m.grade]} analog` : "Cannot be graded"}</div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-2xs">
                  <AssessmentChips coverage={m.coverage} factors={similarityFactors(m.dimensions, c.planet, c.earth)} />
                  {c.rank_among && <span className="rounded-xs bg-basalt-700 px-1.5 py-0.5 text-regolith-200" title="Land cells on Earth with a higher score for this target and purpose">{c.rank_among.better_cells.toLocaleString("en-US")} of {c.rank_among.cells.toLocaleString("en-US")} cells match better</span>}
                  <span className="rounded-xs px-1.5 py-0.5 text-regolith-300 ring-1 ring-[var(--hair)]">RADIUM scale, not a NASA rating</span>
                </div>
              </div>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-regolith-50">Why this match?</h3>
            <p className="mt-1 text-sm leading-relaxed text-regolith-200">{c.why ?? "Too little comparable data to explain a grade."}{" "}
              <button type="button" className="link inline-flex items-center gap-1 text-xs" onClick={() => setSheet("methodology")}><BookOpen size={11} /> How similarity is scored</button>
            </p>
            <h3 className="mt-4 text-sm font-semibold text-regolith-50">Every compared dimension</h3>
            <ul className="mt-1 divide-y divide-[var(--hair)]">
              {scored.map((d) => (
                <li key={d.id} className="py-2.5">
                  <div className="flex items-center gap-2.5">
                    <GradeTile grade={d.grade} size="sm" title={d.score === null ? "Not compared: no data" : undefined} />
                    <span className="text-sm text-regolith-50">{d.label}</span>
                    <span className="relative ml-2 h-1.5 flex-1 overflow-hidden rounded-full bg-basalt-700" aria-hidden>
                      {d.score !== null && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round(d.score * 100)}%`, background: GRADE_HEX[d.grade!] }} />}
                    </span>
                    <span className="tnum w-24 text-right text-2xs text-regolith-400">{d.score === null ? "not compared" : `${Math.round(d.score * 100)} / 100`}, {pct(d.weight)}</span>
                  </div>
                  <p className="mt-1 text-2xs leading-snug text-regolith-400">{d.comparable}</p>
                  <Pairs pairs={d.pairs} world={world} />
                  {d.note && <p className="mt-1 text-2xs text-regolith-400">{d.note}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-2xs text-regolith-500">Bars are 0–100 similarity per dimension; the percentage is that dimension's share of this purpose's comparison. Missing data is shown as not compared, never as a low score.</p>
          </div>
          <aside>
            <h3 className="text-sm font-semibold text-regolith-50">Shape of the match</h3>
            <p className="mt-0.5 mb-2 text-2xs leading-snug text-regolith-400">Each axis is one similarity dimension on the same 0–1 scale. Rings mark the grade boundaries.</p>
            <Radar dims={m.dimensions} />
          </aside>
        </section>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <section className="rounded-md bg-basalt-900/60 p-4 ring-1 ring-[var(--hair)]">
            <h3 className="text-sm font-semibold text-regolith-50">Match strengths</h3>
            {strong.length ? <ul className="mt-2 space-y-1.5 text-sm">{strong.map((d) => <li key={d.id} className="flex items-center gap-2 text-regolith-200"><GradeTile grade={d.grade} size="xs" /> {d.label}</li>)}</ul>
              : <p className="mt-2 text-sm text-regolith-400">No dimension reaches grade B.</p>}
          </section>
          <section className="rounded-md bg-basalt-900/60 p-4 ring-1 ring-[var(--hair)]">
            <h3 className="text-sm font-semibold text-regolith-50">Mismatches</h3>
            {weak.length || missing.length ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {weak.map((d) => <li key={d.id} className="flex items-center gap-2 text-regolith-200"><GradeTile grade={d.grade} size="xs" /> {d.label}</li>)}
                {missing.map((d) => <li key={d.id} className="flex items-center gap-2 text-regolith-400"><GradeTile grade={null} size="xs" /> {d.label}: not compared, no data</li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-regolith-400">No compared dimension falls below grade C.</p>}
          </section>
          <section data-tour="analogy-breakdown" className="rounded-md bg-basalt-900/60 p-4 ring-1 ring-[var(--hair)]">
            <h3 className="text-sm font-semibold text-regolith-50">Cannot reproduce on Earth</h3>
            <ul className="mt-2 space-y-2">
              {m.breaks_down.map((b) => (
                <li key={b.label} className="text-xs leading-snug"><span className="font-medium text-regolith-50">{b.label}</span> <span className="tnum text-regolith-300">{b.planet} vs {b.earth}</span><span className="mt-0.5 block text-regolith-400">{b.text}</span></li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      {status === "loading" && <div className="fixed right-4 bottom-4 z-30"><Spinner label="Recomputing for this purpose" /></div>}
    </div>
  );
}

/** Compare: any saved or selected places side by side, plus the Moon/Mars-vs-Earth twin pair when one is open. */
export function CompareView() {
  const list = useStore((s) => s.compareList);
  const pair = useStore((s) => !!s.compare);
  const tab = useStore(s=>s.compareTab);
  const status = useStore(s=>s.compareStatus);
  const setTab = (compareTab: "sites" | "pair")=>useStore.setState({compareTab});
  return (
    <div className="flex h-full w-full flex-col" data-tour="comparison">
      <div className="comparison-tools">
        <RegistrySelect label={tab === "pair" ? "Earth comparison site" : "Add a comparison site"} worlds={tab === "pair" ? ["earth"] : ["moon","mars","earth"]} onSelect={(p,b)=>{const s=useStore.getState();if(tab === "pair")void s.pickEarth(p.lat,p.lon);else s.addCompare({body:b,lat:p.lat,lon:p.lon,label:p.name});}} />
        <Button data-tour="save-comparison" variant="outline" disabled={tab === "pair" ? !pair || status !== "ready" : list.length < 2} onClick={()=>useStore.getState().saveComparison(undefined,tab)}><Bookmark size={14}/>Save comparison</Button>
      </div>
      <div role="tablist" aria-label="Comparison type" className="hair-b flex shrink-0 gap-1 px-4 py-2">
        <button type="button" role="tab" aria-selected={tab === "sites"} onClick={() => setTab("sites")} className="ctl h-8 rounded-sm px-3 text-sm font-medium text-regolith-200">Sites ({list.length})</button>
        <button type="button" role="tab" aria-selected={tab === "pair"} onClick={() => setTab("pair")} className="ctl h-8 rounded-sm px-3 text-sm font-medium text-regolith-200">Earth twin pair{pair ? "" : " (none)"}</button>
      </div>
      <div className="min-h-0 flex-1">{tab === "sites" ? <SitesCompare /> : <PairView />}</div>
    </div>
  );
}
