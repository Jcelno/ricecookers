import { RegistrySelect, SiteEvidence } from "@/components/catalog/SiteCatalog";
import { ArrowLeft, Bookmark, BookOpen, Download, FileText, ImageDown, Navigation, X } from "lucide-react";
import { SitesCompare } from "@/components/compare/SitesCompare";
import { useEffect, useMemo, useState } from "react";
import { conditionChips } from "@/components/flow/CantReproduce";
import { currentLink } from "@/lib/deeplink";
import { renderShareCard } from "@/lib/sharecard";

import { EarthMap } from "@/components/map/LazyEarthMap";
import { GlobeView } from "@/components/map/GlobeView";
import { Photos } from "@/components/ui/Photos";
import { Button, cx, GradeTile, Notice, Spinner } from "@/components/ui/primitives";
import { AssessmentChips, AssessmentGrade } from "@/components/ui/Assessment";
import { similarityFactors } from "@/lib/assessment";
import { GRADE_HEX, GRADE_MEANING, formatMeasure, pct } from "@/lib/format";
import { CantReproduce } from "@/components/flow/CantReproduce";
import { ConditionBars } from "@/components/flow/ConditionBars";
import { GRADE_HELP, TwinScoreIcon } from "@/components/ui/ScoreIcons";
import { coverageText, dimensionLabel, purposeVerb } from "@/lib/plain";
import type { Measure } from "@/lib/types";
import { photoKey, photosFor } from "@/lib/photos";
import type { CellInfo, DimDetail, Pair, Planet } from "@/lib/types";
import { targetLabel, useStore } from "@/store";

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
      <polygon className="radar-shape" points={poly} fill="rgb(86 200 245 / 0.18)" stroke="#8fd9f7" strokeWidth={1.6} style={{ transformOrigin: `${c}px ${c}px` }} />
      {pts.map((d, k) => {
        const [x, y] = xy(k, d.score!);
        const [lx, ly] = xy(k, 1.14);
        const cs = Math.cos(ang(k));
        const anchor = cs > 0.3 ? "start" : cs < -0.3 ? "end" : "middle";
        return (
          <g key={d.id}>
            <circle cx={x} cy={y} r={4.5} fill={GRADE_HEX[d.grade!]} stroke="#08111f" strokeWidth={1.2} />
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="fill-regolith-200 text-[9.5px]">{dimensionLabel(d.id, d.label)}</text>
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

/** Every measurement of both places in one table. A dash means the quantity is not measured on that world. */
function Measurements({ planet, earth }: { planet: CellInfo; earth: CellInfo }) {
  const eIndex = new Map<string, Measure>();
  earth.groups.forEach((g) => g.items.forEach((m) => eIndex.set(m.id, m)));
  const pIds = new Set<string>();
  planet.groups.forEach((g) => g.items.forEach((m) => pIds.add(m.id)));
  const cats = [...new Set([...planet.groups.map((g) => g.id), ...earth.groups.map((g) => g.id)])];
  const label = (id: string) => planet.groups.find((g) => g.id === id)?.label ?? earth.groups.find((g) => g.id === id)?.label ?? id;
  const text = (m?: Measure) => (!m ? "—" : m.value === null ? "no data" : `${formatMeasure({ ...m, sigma: null })}${!m.text && m.unit && m.fmt !== "percent" ? ` ${m.unit}` : ""}`);
  return (
    <table className="w-full table-fixed text-xs">
      <thead><tr className="text-left text-regolith-500"><th className="w-[42%] py-1 font-normal" /><th className="py-1 text-right font-medium text-regolith-300">{planet.body === "moon" ? "Moon" : "Mars"}</th><th className="py-1 pl-2 text-right font-medium text-regolith-300">Earth</th></tr></thead>
      {cats.map((cid) => {
        const pg = planet.groups.find((g) => g.id === cid)?.items ?? [];
        const eg = (earth.groups.find((g) => g.id === cid)?.items ?? []).filter((m) => !pIds.has(m.id));
        return (
          <tbody key={cid}>
            <tr><td colSpan={3} className="pt-3 pb-1 text-xs font-semibold text-regolith-100">{label(cid)}</td></tr>
            {pg.map((m) => (
              <tr key={m.id} className="border-t border-[var(--hair)]"><td className="py-1 pr-2 text-regolith-300">{m.label}</td><td className="mono py-1 text-right text-regolith-100">{text(m)}</td><td className="mono py-1 pl-2 text-right text-regolith-100">{text(eIndex.get(m.id))}</td></tr>
            ))}
            {eg.map((m) => (
              <tr key={m.id} className="border-t border-[var(--hair)]"><td className="py-1 pr-2 text-regolith-300">{m.label}</td><td className="py-1 text-right text-regolith-500">—</td><td className="mono py-1 pl-2 text-right text-regolith-100">{text(m)}</td></tr>
            ))}
          </tbody>
        );
      })}
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
    <section className={cx("pair-side min-w-0 rounded-md bg-basalt-900/60 ring-1 ring-[var(--hair)]", world === "earth" ? "pair-side-earth" : "pair-side-planet")} data-pair-side={world}>
      <div className="relative h-[200px] overflow-hidden rounded-t-md bg-void">
        {world === "earth" ? (
          <EarthMap basemap={meta.layers.earth.tiles[0]} labels overlayUrl={null} pins={[]} markers={[]} selection={sel} focus={focus} />
        ) : (
          <GlobeView body={world as Planet} base={meta.layers[world as Planet].tiles.find((t) => t.group === "imagery") ?? meta.layers[world as Planet].tiles[0]} pins={[]} selection={sel} focus={focus} interactive={false} />
        )}
      </div>
      <div className="px-4 pt-3 pb-1">
        <div className="text-2xs text-regolith-400">{title}</div>
        <h2 className="placename mt-0.5 text-xl leading-tight text-regolith-50 [overflow-wrap:anywhere]">{world !== "earth" && position ? targetLabel({ pins: useStore.getState().pins }, { body: world, ...position }, record?.name ?? cell.place.label) : record?.name ?? cell.place.label}</h2>
        <p className="tnum mt-1 text-xs text-regolith-300">{cell.coords}</p>
        <p className="mt-1 flex flex-wrap gap-1.5 text-2xs">
          <span className="rounded-xs bg-basalt-700 px-1.5 py-0.5 text-regolith-200" title="Values describe this whole analysis cell, not a point">Cell {Math.abs(ns - ew) < 0.3 ? `${Math.round(ns)} km` : `${Math.round(ns)} × ${Math.round(ew)} km`}</span>
          <span className="rounded-xs bg-basalt-700 px-1.5 py-0.5 text-regolith-200" title="How the grid was built">{world === "earth" ? "0.25° grid, ETOPO 2022 terrain" : world === "mars" ? "0.5° grid, MOLA terrain" : cell.cell.kind === "polar" ? "2.4 km polar grid, LOLA terrain" : "0.5° grid, LOLA terrain"}</span>
        </p>
      </div>
      <details className="mx-4 mt-3 text-xs"><summary className="cursor-pointer py-2 text-regolith-200">Site evidence and measurement sources</summary>{record&&<SiteEvidence site={record}/>}<ul className="my-3 space-y-1">{sources.map(s=><li key={`${s.url}:${s.name}`}><a className="link" href={s.url} target="_blank" rel="noreferrer">{s.name}</a></li>)}</ul></details>
      <div className="pb-2" />
    </section>
  );
}

/** "Share this finding": an image of the pair, its grade and its sources, drawn from the values on screen. */
function ShareFinding() {
  const c = useStore((s) => s.compare);
  const origin = useStore((s) => s.twinOrigin);
  const purpose = useStore((s) => s.purpose);
  const meta = useStore((s) => s.meta)!;
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "drawing" | "failed">("idle");
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!c || !origin) return null;
  const file = `radium-${c.planet.place.label}-${c.earth.place.label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) + ".png";
  const make = async () => {
    setState("drawing");
    try {
      const ids = [...new Set([c.planet, c.earth].flatMap((cell) => cell.groups.flatMap((g) => g.items.map((m) => m.source))).filter((id): id is string => !!id))];
      const agencies = [...new Set(ids.map((id) => meta.sources_index[id]?.name.split(":")[0].split("(")[0].trim()).filter(Boolean))].slice(0, 6);
      const blob = await renderShareCard({
        body: origin.body, target: targetLabel({ pins: useStore.getState().pins }, origin, c.planet.place.label), targetCoords: c.planet.coords, targetAt: origin,
        earth: c.earth.place.label, earthCoords: c.earth.coords, earthAt: { lat: c.earth.cell.lat, lon: c.earth.cell.lon },
        grade: c.match.grade, score: c.match.score, purpose: purposeVerb(purpose, origin.body).label, newLead: !c.documented,
        cannot: conditionChips(c.match.breaks_down).filter((b) => b.kind !== "close").map((b) => `${b.label} ${b.planet} vs ${b.earth}`),
        sources: agencies, link: currentLink().replace(/&(base|op|pins|u)=[^&]*/g, ""),
      });
      setUrl(URL.createObjectURL(blob));
      setState("idle");
    } catch { setState("failed"); }
  };
  return (
    <>
      <Button size="sm" variant="outline" data-share-finding disabled={state === "drawing"} onClick={() => void make()}><ImageDown size={13} /> {state === "drawing" ? "Drawing…" : "Share this finding"}</Button>
      {state === "failed" && <span role="status" className="text-xs text-alert">The image could not be created in this browser.</span>}
      {url && (
        <div className="share-card floating" role="dialog" aria-label="Share this finding" data-share-card>
          <img src={url} alt={`${c.planet.place.label} and its Earth twin ${c.earth.place.label}, grade ${c.match.grade ?? "not graded"}`} />
          <div className="share-card-actions">
            <a className="ctl share-card-save" href={url} download={file}><Download size={14} /> Download image</a>
            <span>Made from the values on this page. No logos, nothing generated.</span>
            <button type="button" className="ctl" aria-label="Close" onClick={() => setUrl(null)}><X size={15} /></button>
          </div>
        </div>
      )}
    </>
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
          <h2 className="font-serif text-[1.8rem] leading-tight font-medium tracking-[-0.03em] text-regolith-50">No pair to compare yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-regolith-300">Choose a Moon or Mars site in Find Earth Twins and open one of its Earth matches. The two places then appear here side by side.</p>
          <Button variant="solid" className="mt-4" onClick={() => setMode("twin")}>Find Earth Twins</Button>
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
          <Button size="sm" onClick={() => setMode("twin")}><ArrowLeft size={13} /> Best matches</Button>
          <label className="ml-auto flex items-center gap-2 text-xs text-regolith-300">What to test
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="field h-8 w-auto">
              {meta.purposes[body].map((p) => <option key={p.id} value={p.id}>{purposeVerb(p.id, body, p.label).label}</option>)}
            </select>
          </label>
          <Button size="sm" variant="solid" onClick={() => openBrief({ lat: c.earth.cell.lat, lon: c.earth.cell.lon })}><FileText size={13} /> Create a test brief</Button>
          <Button size="sm" variant="outline" onClick={() => setMode("near")}><Navigation size={13} /> Find nearer analogs</Button>
          <ShareFinding />
        </div>
        {status === "error" && <div className="mt-3"><Notice tone="error" title="The comparison could not be refreshed" action={<Button size="sm" variant="outline" onClick={() => void pickEarth(c.earth.cell.lat, c.earth.cell.lon)}>Try again</Button>}>{err}</Notice></div>}

        <p className="mt-4 text-xs leading-relaxed text-regolith-400">Published analog research documents a specific scientific use. The similarity grade below is independently calculated for your selected pair and purpose; it does not establish a historical research relationship between these exact places.</p>
        <div className="pair-grid mt-4 grid gap-4 md:grid-cols-2" data-pair key={`${c.planet.cell.lat},${c.planet.cell.lon}|${c.earth.cell.lat},${c.earth.cell.lon}`}>
          <Side cell={c.planet} title={`${world} target`} world={body} />
          <Side cell={c.earth} title={c.documented ? `Earth place, ${Math.round(c.documented.distance_km)} km from ${c.documented.name}` : "Earth place, not in RADIUM's reference list"} world="earth" />
        </div>

        <section className="mt-5 grid gap-5 rounded-md bg-basalt-900/60 p-4 ring-1 ring-[var(--hair)] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="flex items-center gap-3.5">
              <AssessmentGrade grade={m.grade} coverage={m.coverage} model="similarity" size="xl" />
              <div>
                <div className="flex items-center gap-1.5 text-xs text-regolith-400"><TwinScoreIcon size={14} /> Twin score · {purposeVerb(purpose, body).label}</div>
                <div className="text-lg font-semibold text-regolith-50">{m.grade ? `${GRADE_MEANING[m.grade]} match${m.score !== null ? ` (${m.score.toFixed(2)})` : ""}` : "Cannot be graded"}</div>
                <div className="mb-1 text-2xs leading-snug text-regolith-400">{GRADE_HELP.split(". ")[0]}. {coverageText(m.coverage)}.</div>
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
                    <span className="text-sm text-regolith-50">{dimensionLabel(d.id, d.label)}</span>
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

        <section data-tour="analogy-breakdown" className="mt-5 rounded-md bg-basalt-900/60 p-4 ring-1 ring-[var(--hair)]" aria-labelledby="breaks-title">
          <h3 id="breaks-title" className="text-sm font-semibold text-regolith-50">Where the analogy breaks down</h3>
          <p className="mt-1 max-w-[78ch] text-xs leading-relaxed text-regolith-400">Red marks a condition no place on Earth can reproduce; green marks one that nearly matches. Each row shows the {world} value against Earth's and what a test campaign needs to make up the difference. None of these is scored.</p>
          <ConditionBars items={m.breaks_down} body={body} />
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
          <section className="rounded-md bg-basalt-900/60 p-4 ring-1 ring-[var(--hair)]">
            <h3 className="text-sm font-semibold text-regolith-50">What else it could be used for</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {m.fitness.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-regolith-200"><GradeTile grade={f.applicable ? f.grade : null} size="xs" title={f.applicable ? undefined : "Does not apply to this site"} /> {purposeVerb(f.id, body, f.label).label}</li>
              ))}
            </ul>
            <p className="mt-2 text-2xs leading-snug text-regolith-500">The same place is graded once per purpose, because each purpose weighs the comparison differently.</p>
          </section>
        </div>


        <section className="mt-5 grid gap-4 md:grid-cols-2" aria-label="Photographs of both places">
          <div className="min-w-0 rounded-md bg-basalt-900/60 pt-3 ring-1 ring-[var(--hair)]"><h3 className="px-4 pb-1 text-sm font-semibold text-regolith-50">Photographs: {world}</h3><Photos compact id={`cmp-${photoKey(c.planet)}`} load={() => photosFor(c.planet)} /></div>
          <div className="min-w-0 rounded-md bg-basalt-900/60 pt-3 ring-1 ring-[var(--hair)]"><h3 className="px-4 pb-1 text-sm font-semibold text-regolith-50">Photographs: Earth</h3><Photos compact id={`cmp-${photoKey(c.earth)}`} load={() => photosFor(c.earth)} /></div>
        </section>

        <details className="mt-5 rounded-md bg-basalt-900/60 p-4 ring-1 ring-[var(--hair)]">
          <summary className="cursor-pointer text-sm font-semibold text-regolith-50">Every measurement, side by side</summary>
          <div className="mt-2"><Measurements planet={c.planet} earth={c.earth} /></div>
          <p className="mt-2 text-2xs leading-snug text-regolith-500">A dash means the quantity is not measured on that world in RADIUM. Values with the same name are measured the same way only for terrain; others share a definition but come from different instruments or models.</p>
        </details>
      </div>
      {status === "loading" && <div className="fixed right-4 bottom-4 z-30"><Spinner label="Recomputing for this purpose" /></div>}
    </div>
  );
}

/** The fixed "Earth can't reproduce" strip, shown under a twin pair exactly as under the results. */
function PairStrip() {
  const c = useStore((s) => s.compare);
  const origin = useStore((s) => s.twinOrigin);
  const status = useStore((s) => s.compareStatus);
  if (!origin || (!c && status !== "loading")) return null;
  return <CantReproduce items={c?.match.breaks_down ?? null} world={origin.body} pending={status === "loading"} />;
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
        <div role="tablist" aria-label="Comparison type" className="flex shrink-0 gap-1">
          <button type="button" role="tab" aria-selected={tab === "pair"} onClick={() => setTab("pair")} className="ctl h-8 rounded-sm px-3 text-sm font-medium text-regolith-200">Twin pair{pair ? "" : " (none)"}</button>
          <button type="button" role="tab" aria-selected={tab === "sites"} onClick={() => setTab("sites")} className="ctl h-8 rounded-sm px-3 text-sm font-medium text-regolith-200">Sites ({list.length})</button>
        </div>
        <RegistrySelect label={tab === "pair" ? "Compare with another Earth site" : "Add a place"} worlds={tab === "pair" ? ["earth"] : ["moon","mars","earth"]} onSelect={(p,b)=>{const s=useStore.getState();if(tab === "pair")void s.pickEarth(p.lat,p.lon);else s.addCompare({body:b,lat:p.lat,lon:p.lon,label:p.name});}} />
        <Button data-tour="save-comparison" variant="outline" disabled={tab === "pair" ? !pair || status !== "ready" : list.length < 2} onClick={()=>useStore.getState().saveComparison(undefined,tab)}><Bookmark size={14}/>Save to notebook</Button>
      </div>
      <div className="min-h-0 flex-1">{tab === "sites" ? <SitesCompare /> : <PairView />}</div>
      {tab === "pair" && <PairStrip />}
    </div>
  );
}
