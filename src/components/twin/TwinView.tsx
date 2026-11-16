import { Check, Columns2, Download, FileText, Home, Layers, Minus, Navigation, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RegistrySelect } from "@/components/catalog/SiteCatalog";
import { CantReproduce } from "@/components/flow/CantReproduce";
import { EarthMap, LABEL_ATTRIBUTION } from "@/components/map/LazyEarthMap";
import { type GlobeHandle, GlobeView, type SiteMarker, type ViewState } from "@/components/map/GlobeView";
import { GradeLegend } from "@/components/map/Stage";
import { Tapes, type TapesHandle } from "@/components/map/Tapes";
import { Button, cx, GradeTile, IconButton, Notice, Segmented, Spinner, Switch } from "@/components/ui/primitives";
import { GRADE_HELP, GradeBadge, TwinScoreIcon } from "@/components/ui/ScoreIcons";
import { api, overlay } from "@/lib/api";
import { badgeFor, categoriesFor, pinCategories } from "@/lib/atlas";
import { downloadCsv } from "@/lib/csv";
import { count, famousFor, findings, shortPlace } from "@/lib/findings";
import { formatCoord, formatKm, GRADE_HEX, pct } from "@/lib/format";
import { useCountUp, useFlip, useScan } from "@/lib/motion";
import { useNotebook } from "@/lib/notebook";
import { coverageText, DIMENSION_PLAIN, dimensionLabel, purposeVerb } from "@/lib/plain";
import type { Candidate, DocumentedSite, Planet, Robustness, Validation } from "@/lib/types";
import { targetLabel, useStore } from "@/store";

import { LeadFilter, TargetContext } from "./TargetContext";
import "@/components/flow/flow.css";
import "./twin.css";

const WORLD = { moon: "Moon", mars: "Mars" } as const;
const near = (a: { lat: number; lon: number }, b: { lat: number; lon: number }, tol = 0.13) => Math.abs(a.lat - b.lat) < tol && Math.abs(a.lon - b.lon) < tol;

/* ------------------------------------------------------------------ step rail */
function StepHead({ n, title, state, summary, onOpen }: { n: 1 | 2 | 3; title: string; state: "open" | "done" | "todo"; summary?: React.ReactNode; onOpen?: () => void }) {
  const body = (
    <>
      <span className="step-dot" aria-hidden>{state === "done" ? <Check size={13} strokeWidth={3} /> : n}</span>
      <span className="step-text">
        <span className="step-title">{title}</span>
        {summary && <span className="step-summary">{summary}</span>}
      </span>
      {state === "done" && <span className="step-change">Change</span>}
    </>
  );
  return state === "done" && onOpen
    ? <button type="button" className="step-head row-ctl" data-step-head={n} data-state={state} onClick={onOpen} aria-label={`Step ${n}, ${title}: change`}>{body}</button>
    : <div className="step-head" data-step-head={n} data-state={state} aria-current={state === "open" ? "step" : undefined}>{body}</div>;
}

/** The lat/lon read-out counts to its final values when a site is chosen. */
function Coords({ lat, lon }: { lat: number; lon: number }) {
  const key = `${lat},${lon}`;
  const la = useCountUp(lat, 600, key) ?? lat, lo = useCountUp(lon, 600, key) ?? lon;
  return <span className="mono">{formatCoord(la, lo)}</span>;
}

function Rail() {
  const meta = useStore((s) => s.meta)!;
  const body = useStore((s) => s.body) as Planet;
  const origin = useStore((s) => s.twinOrigin);
  const step = useStore((s) => s.twinStep);
  const twin = useStore((s) => s.twin);
  const purpose = useStore((s) => s.purpose);
  const pins = useStore((s) => s.pins);
  const { startTwin, setPurpose, setTwinStep, enter } = useStore.getState();
  const purposes = meta.purposes[body];
  const status = twin && origin && near(twin.planet, origin, 1) ? twin.purposes : [];
  const name = origin ? targetLabel({ pins }, origin, twin?.planet.place.label ?? formatCoord(origin.lat, origin.lon)) : null;
  const chosenPurpose = step === 3 ? purposeVerb(purpose, body) : null;
  const pick = (lat: number, lon: number) => { startTwin({ body, lat, lon }); useStore.getState().flyTo(body, lat, lon, body === "moon" ? 2200 : 4200); };

  return (
    <aside className="flow-rail surface scroll" aria-label="Find Earth Twins: steps" data-tour="target-settings" data-flow-rail>
      <header className="rail-head">
        <span className="eyebrow"><TwinScoreIcon size={14} /> Find Earth Twins</span>
        <div role="tablist" aria-label="World to match" className="rail-worlds">
          {(["moon", "mars"] as Planet[]).map((b) => (
            <button key={b} type="button" role="tab" aria-selected={body === b} className="ctl" onClick={() => { if (b !== body) enter({ kind: "twin", body: b }); }}>
              <span className={`world-disc ${b}`} style={{ "--d": "14px" } as React.CSSProperties} />{WORLD[b]}
            </button>
          ))}
        </div>
      </header>

      <ol className="steps" aria-label="Steps">
        <li data-step={1}>
          <StepHead n={1} title="Site" state={step === 1 ? "open" : "done"} onOpen={() => setTwinStep(1)}
            summary={step !== 1 && origin ? <><span className="placename">{name}</span><Coords lat={origin.lat} lon={origin.lon} /></> : undefined} />
          {step === 1 && (
            <div className="step-body">
              <p className="step-lede">Pick a place on {body === "moon" ? "the Moon" : "Mars"}.</p>
              <ul className="famous" data-famous>
                {famousFor(body).map((f, i) => (
                  <li key={f.id} className="rise-in" style={{ "--i": i } as React.CSSProperties}>
                    <button type="button" className="row-ctl famous-row" data-famous-site={f.id} aria-current={!!origin && near(origin, f, 0.01)} onClick={() => pick(f.lat, f.lon)}>
                      <span className="placename">{f.name}</span>
                      <span className="famous-line">{f.line}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="step-or">or click anywhere on the globe</p>
              <RegistrySelect label="More named places" worlds={[body]} value="" onSelect={(p, b) => { if (b !== "earth") pick(p.lat, p.lon); }} />
            </div>
          )}
        </li>
        <li data-step={2}>
          <StepHead n={2} title="What to test" state={step === 2 ? "open" : step === 3 ? "done" : "todo"} onOpen={() => setTwinStep(2)}
            summary={chosenPurpose ? chosenPurpose.label : step === 1 ? "Choose a site first" : undefined} />
          {step === 2 && (
            <div className="step-body">
              <p className="step-lede">A twin is only a twin for a purpose. Choose yours.</p>
              <div role="radiogroup" aria-label="What to test" className="purposes" data-purposes>
                {purposes.map((p, i) => {
                  const st = status.find((x) => x.id === p.id);
                  const off = st ? !st.applicable : false;
                  const v = purposeVerb(p.id, body, p.label);
                  return (
                    <button key={p.id} type="button" role="radio" aria-checked={false} aria-disabled={off} data-purpose={p.id} className={cx("purpose rise-in", off ? "purpose-off" : "row-ctl")}
                      style={{ "--i": i } as React.CSSProperties} onClick={() => { if (!off) setPurpose(p.id); }}>
                      <span className="purpose-label">{v.label}</span>
                      <span className="purpose-line">{off ? `Not for this site: ${st?.note?.replace(/^This planetary site /, "it ").replace(/, so .*$/, ".") ?? "it does not apply here."}` : v.line}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </li>
        <li data-step={3}>
          <StepHead n={3} title="Results" state={step === 3 ? "open" : "todo"} summary={step === 3 && twin ? `${count(twin.distribution.cells)} places on Earth compared` : step < 3 ? "Earth's closest matches" : undefined} />
        </li>
      </ol>

      {step === 3 && twin && <Compared key={`${twin.planet.body}-${purpose}`} dims={twin.dimensions} />}
    </aside>
  );
}

/* ------------------------------------------------- what gets compared (weights) */
/** The purpose's weights as live bars. Dragging one re-ranks Earth for your own priorities. */
function Compared({ dims }: { dims: { id: string; label: string; weight: number; available: boolean }[] }) {
  const custom = useStore((s) => s.twinWeights);
  const setW = useStore((s) => s.setTwinWeights);
  const meta = useStore((s) => s.meta)!;
  const purpose = useStore((s) => s.purpose);
  const body = useStore((s) => s.twinOrigin?.body ?? "mars");
  // Defaults always come from the purpose's documented weights, not from the last (possibly customised) result.
  const base = useMemo(() => {
    const pw = meta.purposes[body].find((p) => p.id === purpose)?.weights ?? {};
    return Object.fromEntries(dims.map((d) => [d.id, Math.round((pw[d.id] ?? 0) * 100)]));
  }, [meta, body, purpose, dims]);
  const [w, setLocal] = useState<Record<string, number>>(custom ?? base);
  const timer = useRef(0);
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const change = (id: string, v: number) => {
    const next = { ...w, [id]: v };
    setLocal(next);
    window.clearTimeout(timer.current);
    if (Object.values(next).some((x) => x > 0)) {
      timer.current = window.setTimeout(() => {
        const sum = Object.values(next).reduce((a, b) => a + b, 0) || 1;
        lastChange.current = { label: dimensionLabel(id, id), share: Math.round((next[id] / sum) * 100), raised: next[id] >= (w[id] ?? 0) };
        setW(next);
      }, 300);
    }
  };
  return (
    <section className="compared" aria-label="What gets compared" data-compared>
      <header><span className="eyebrow">What gets compared</span><span className="compared-state">{custom ? "your weights" : "this purpose's weights"}</span></header>
      <ul>
        {dims.map((d, i) => {
          const share = (w[d.id] ?? 0) / total;
          const plain = DIMENSION_PLAIN[d.id];
          return (
            <li key={d.id} className={d.available ? "" : "compared-off"}>
              <div className="compared-row">
                <label htmlFor={`tw-${d.id}`}>{plain?.label ?? d.label}</label>
                <span className="mono">{d.available ? `${Math.round(share * 100)}%` : "no data here"}</span>
              </div>
              <div className="bar">
                <span className="bar-fill" style={{ transform: `scaleX(${Math.max(0.005, share)})`, "--i": i } as React.CSSProperties} />
                <input id={`tw-${d.id}`} type="range" min={0} max={100} value={w[d.id] ?? 0} onChange={(e) => change(d.id, Number(e.target.value))}
                  aria-label={`${plain?.label ?? d.label} weight`} aria-valuetext={`${Math.round(share * 100)}% of the comparison`} />
              </div>
              {plain && <span className="compared-hint">{plain.hint}</span>}
            </li>
          );
        })}
      </ul>
      <p className="compared-note">Drag a bar to re-rank Earth for what matters to you. Shares always add up to 100%.</p>
      {custom && <Button size="sm" variant="outline" onClick={() => { setLocal(base); lastChange.current = null; setW(null); }}><RotateCcw size={12} /> Back to this purpose's weights</Button>}
    </section>
  );
}
/** What the visitor last dragged, so the re-rank can be explained in one line. */
const lastChange: { current: { label: string; share: number; raised: boolean } | null } = { current: null };

/* -------------------------------------------------------------------- results */
function Score({ value, k }: { value: number | null; k: string }) {
  const shown = useCountUp(value, 600, k);
  return <span className="mono result-score">{shown === null ? "–" : shown.toFixed(2)}</span>;
}

function LeadTag({ c, first }: { c: Candidate; first: boolean }) {
  return c.documented
    ? <span className="tag tag-doc" title={`${c.documented.name}, ${formatKm(c.documented.distance_km)} away. ${c.documented.source}`}>Documented site nearby</span>
    : <span className="tag tag-lead" data-first-lead={first || undefined} title="No site in RADIUM's list of documented analog sites lies within 150 km. That does not mean the area has never been studied."><Sparkles size={10} aria-hidden />New lead</span>;
}

function ResultRow({ c, k, active, runKey, firstLead, onClick }: { c: Candidate; k: number; active: boolean; runKey: string; firstLead: boolean; onClick: () => void }) {
  return (
    <li className="result" data-flip={c.id} data-new-lead={c.novel ? "true" : undefined} data-rank={c.rank} style={{ "--i": k } as React.CSSProperties}>
      <button type="button" aria-current={active} onClick={onClick} className="row-ctl result-row">
        <span className="result-rank mono" aria-label={`Rank ${c.rank}`}>{c.rank}</span>
        <span className={c.novel ? "new-lead-grade" : undefined}><GradeTile grade={c.grade} /></span>
        <span className="result-main">
          <span className="placename result-name">{c.place.label}</span>
          <span className="result-meta"><span className="mono">{c.coords}</span><LeadTag c={c} first={firstLead} /></span>
        </span>
        <Score value={c.score} k={runKey} />
      </button>
    </li>
  );
}

function DocumentedRow({ d, onClick }: { d: DocumentedSite; onClick: () => void }) {
  return (
    <li className="result">
      <button type="button" onClick={onClick} className="row-ctl result-row">
        <span className="result-rank" />
        <GradeTile grade={d.analysed ? d.grade : null} />
        <span className="result-main">
          <span className="placename result-name">{d.name}</span>
          <span className="result-meta">{d.country}. {d.theme}{d.for_this_body ? "" : " (documented for the other world)"}</span>
        </span>
        <span className="mono result-score">{d.analysed && d.score !== null ? d.score.toFixed(2) : "–"}</span>
      </button>
    </li>
  );
}

/** Top three matches side by side: what matches and what does not, quantity by quantity. */
function TopThree({ list, onPick, picked }: { list: Candidate[]; onPick: (c: Candidate) => void; picked: { lat: number; lon: number } | null }) {
  const dims = list[0].dimensions.filter((d) => d.weight > 0);
  const weak = list.map((c) => c.dimensions.filter((d) => d.weight > 0 && d.score !== null && d.score < 0.5).map((d) => dimensionLabel(d.id, d.label).toLowerCase()));
  return (
    <section className="top3" aria-label="Top three matches side by side" data-top3>
      <table>
        <thead>
          <tr>
            <th scope="col"><span className="eyebrow">Top 3 side by side</span></th>
            {list.map((c) => (
              <th key={c.id} scope="col">
                <button type="button" className="row-ctl top3-pick" aria-current={!!picked && near(picked, c)} onClick={() => onPick(c)} title={c.place.label}>
                  <span className="mono top3-rank">{c.rank}</span>
                  <span className="placename">{shortPlace(c.place.label)}</span>
                  <span data-coach={c.rank === list[0].rank ? "grades" : undefined}><GradeBadge grade={c.grade} score={c.score} size={12} /></span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dims.map((d) => (
            <tr key={d.id}>
              <th scope="row">{dimensionLabel(d.id, d.label)} <span className="mono top3-w">{pct(d.weight)}</span></th>
              {list.map((c) => { const x = c.dimensions.find((y) => y.id === d.id); return <td key={c.id}><GradeTile grade={x?.grade ?? null} size="xs" title={x?.score !== null && x?.score !== undefined ? `${dimensionLabel(d.id, d.label)}: ${x.grade} (${x.score.toFixed(2)})` : "Not compared: no data"} /></td>; })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="top3-note">
        {weak.every((w) => !w.length) ? "All three match on every quantity compared." : list.map((c, i) => (weak[i].length ? `${shortPlace(c.place.label)} falls short on ${weak[i].join(" and ")}.` : null)).filter(Boolean).join(" ")}
      </p>
    </section>
  );
}

/** One request per result set: real answers from the API, or null while loading or if it fails. */
function useCheck<T>(load: (signal: AbortSignal) => Promise<T>, key: string, on: boolean): T | null {
  const [data, setData] = useState<{ key: string; value: T } | null>(null);
  useEffect(() => {
    if (!on || !key) return;
    const ctl = new AbortController();
    load(ctl.signal).then((value) => { if (!ctl.signal.aborted) setData({ key, value }); }, () => undefined);
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on]);
  return data && data.key === key ? data.value : null;
}

/** "Does RADIUM find places scientists already use?" Honest about misses as well as hits. */
function ValidationPanel({ v, world }: { v: Validation | null; world: string }) {
  if (!v) return <p className="results-note">Checking where documented analog sites rank…</p>;
  const s = v.summary;
  return (
    <section className="validation" aria-label="Does RADIUM find places scientists already use?" data-validation>
      <h3>Does RADIUM find places scientists already use?</h3>
      <p>
        Of {s.scored} verified sites documented for {world}, <b>{s.top_10_percent}</b> rank in the top 10% of Earth for this site and purpose and <b>{s.top_25_percent}</b> in the top 25%;
        {" "}<b>{s.below_median}</b> fall in the lower half. The list of documented sites is never used in scoring, so this is an independent check.
      </p>
      <ul>
        {v.sites.filter((x) => x.for_this_body).map((x) => (
          <li key={x.name}>
            <GradeTile grade={x.grade} size="xs" />
            <span className="validation-name">{x.name}</span>
            <span className="validation-bar" aria-hidden><i style={{ transform: `scaleX(${x.percentile ?? 0})` }} /></span>
            <span className="mono">{x.percentile === null ? "no data" : `top ${Math.max(1, Math.round((1 - x.percentile) * 100))}%`}</span>
          </li>
        ))}
      </ul>
      <p className="validation-note">{v.note}</p>
    </section>
  );
}

/** The match in focus: the top match by default, or whichever place the visitor picked. */
function Selected({ robust }: { robust: Robustness | null }) {
  const c = useStore((s) => s.compare);
  const status = useStore((s) => s.compareStatus);
  const error = useStore((s) => s.compareError);
  const picked = useStore((s) => s.picked);
  const twin = useStore((s) => s.twin);
  const pins = useStore((s) => s.pins);
  const { pickEarth, clearPick, setMode, openBrief, addCompare } = useStore.getState();
  if (!picked) return null;
  if (status === "error") return <div className="selected"><Notice tone="error" title="This place could not be compared" action={<Button size="sm" variant="outline" onClick={() => void pickEarth(picked.lat, picked.lon)}>Try again</Button>}>{error}</Notice></div>;
  if (!c) return <div className="selected"><Spinner label="Comparing the two places" /></div>;
  const rank = twin?.candidates.find((x) => near(x, c.earth.cell))?.rank;
  const m = c.match;
  const better = c.rank_among?.better_cells ?? null;
  const documented = pins.earth.filter((p) => p.verification_status !== "review_needed").length;
  const check = robust?.candidates.find((x) => x.rank === rank);
  return (
    <section className={cx("selected panel-selected", status === "loading" && "opacity-70")} aria-label="Selected match" data-selected>
      <header>
        <GradeTile grade={m.grade} size="lg" />
        <div className="selected-title">
          <span className="eyebrow">{rank ? `Match ${rank}` : "Your place"}{better !== null && c.rank_among ? ` · ${better === 0 ? "none match better" : `${count(better)} match better`}` : ""}</span>
          <h3 className="placename">{c.earth.place.label}</h3>
          <span className="mono selected-coords">{c.earth.coords} · score {m.score === null ? "–" : m.score.toFixed(2)}</span>
        </div>
        <IconButton label="Close this match" className="size-7" onClick={clearPick}><X size={14} /></IconButton>
      </header>
      {!c.earth.analysed && <Notice tone="warn">This place is mostly water, so it is not a candidate.</Notice>}
      <p className="selected-why">
        {c.documented
          ? <span className="tag tag-doc" title={`${c.documented.name} is ${formatKm(c.documented.distance_km)} away, a documented analog site (${c.documented.theme.toLowerCase()}). ${c.documented.source}`}>Documented site nearby</span>
          : <span className="tag tag-lead" data-coach="new-lead" title={`None of RADIUM's ${documented} documented analog sites lies within 150 km. That does not mean the area has never been studied: it is a candidate to verify with fieldwork and a literature check.`}><Sparkles size={10} aria-hidden />New lead</span>}
        {" "}{c.why} {coverageText(m.coverage)}.
      </p>
      {check && robust && (
        <p className="selected-robust" data-robust title={check.lost_when.length ? `Drops out when ${check.lost_when.map((l) => `${dimensionLabel(l.dimension, l.label).toLowerCase()} is weighted ${Math.round(Math.abs(l.change) * 100)}% ${l.change > 0 ? "more" : "less"}`).join(", or ")}.` : "Each weight was raised and lowered by 20%, one at a time, and Earth was re-ranked."}>
          <b>{check.robust ? "Robust" : check.stays >= check.of / 2 ? "Fairly robust" : "Sensitive to the weights"}:</b> stays in the top {robust.n} in {check.stays} of {check.of} weight variations (each weight ±{Math.round(robust.delta * 100)}%).
        </p>
      )}
      <div className="selected-actions">
        <Button variant="solid" data-compare-open onClick={() => setMode("compare")}><Columns2 size={14} /> {rank === 1 ? "Compare #1 side by side" : "Compare side by side"}</Button>
        <Button size="sm" variant="outline" onClick={() => openBrief({ lat: c.earth.cell.lat, lon: c.earth.cell.lon })}><FileText size={13} /> Test brief</Button>
        <Button size="sm" variant="outline" onClick={() => { addCompare({ body: c.planet.body, lat: c.planet.cell.lat, lon: c.planet.cell.lon, label: c.planet.place.label }); addCompare({ body: "earth", lat: c.earth.cell.lat, lon: c.earth.cell.lon, label: c.earth.place.label, newLead: !c.documented && c.earth.analysed && c.match.grade !== null }); }}>Add both to Compare</Button>
      </div>
    </section>
  );
}

/** "Try next": suggestions built only from real results for the match in focus. */
function TryNext() {
  const c = useStore((s) => s.compare);
  const purpose = useStore((s) => s.purpose);
  const origin = useStore((s) => s.twinOrigin);
  const earthPins = useStore((s) => s.pins.earth);
  const { setPurpose, enter, setMode, setNear } = useStore.getState();
  if (!c || !origin) return null;
  const body = origin.body;
  const also = c.match.fitness.filter((f) => f.applicable && f.id !== purpose && (f.grade === "A" || f.grade === "B")).slice(0, 2);
  const other: Planet = body === "mars" ? "moon" : "mars";
  const cousin = famousFor(other)[0];
  const R = 6371, rad = Math.PI / 180;
  const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => 2 * R * Math.asin(Math.sqrt(Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2));
  const nearby = earthPins.filter((p) => p.verification_status !== "review_needed" && dist(p, c.earth.cell) <= 500).length;
  const place = shortPlace(c.earth.place.label);
  return (
    <section className="trynext" aria-label="Try next" data-try-next>
      <span className="eyebrow">Try next</span>
      <ul>
        {also.map((f) => (
          <li key={f.id}><button type="button" className="row-ctl" onClick={() => setPurpose(f.id)}><GradeTile grade={f.grade} size="xs" /><span>{place} is also {f.grade === "A" ? "an A" : "a B"} if you want to {purposeVerb(f.id, body).label.toLowerCase()}.</span></button></li>
        ))}
        <li><button type="button" className="row-ctl" onClick={() => { enter({ kind: "twin", body: other }); useStore.getState().startTwin({ body: other, lat: cousin.lat, lon: cousin.lon }); }}>
          <span className={`world-disc ${other}`} style={{ "--d": "18px" } as React.CSSProperties} /><span>See {other === "moon" ? "the Moon's" : "Mars's"} version: {cousin.name}.</span></button></li>
        <li><button type="button" className="row-ctl" onClick={() => { setMode("near"); setNear({ nearLoc: { lat: c.earth.cell.lat, lon: c.earth.cell.lon, source: "map", label: c.earth.place.label }, nearRadius: 500 }); }}>
          <Navigation size={14} aria-hidden /><span>{nearby === 0 ? `No documented analog site lies within 500 km of ${place}.` : `${nearby} documented analog ${nearby === 1 ? "site lies" : "sites lie"} within 500 km of ${place}.`}</span></button></li>
      </ul>
    </section>
  );
}

function Results({ revealed, runKey }: { revealed: boolean; runKey: string }) {
  const twin = useStore((s) => s.twin);
  const picked = useStore((s) => s.picked);
  const status = useStore((s) => s.twinStatus);
  const error = useStore((s) => s.twinError);
  const origin = useStore((s) => s.twinOrigin);
  const step = useStore((s) => s.twinStep);
  const body = useStore((s) => s.body) as Planet;
  const purpose = useStore((s) => s.purpose);
  const showOverlay = useStore((s) => s.showTwinOverlay);
  const custom = useStore((s) => s.twinWeights);
  const { pickEarth, runTwin } = useStore.getState();
  const [tab, setTab] = useState<"best" | "documented">("best");
  const documented = useStore((s) => s.showDocumented), modelled = useStore((s) => s.showModelled);
  const onlyLeads = modelled && !documented;
  useEffect(() => { if (!modelled && documented) setTab("documented"); else if (onlyLeads) setTab("best"); }, [documented, modelled, onlyLeads]);
  const listRef = useRef<HTMLOListElement>(null);
  const shown = useMemo(() => (twin?.candidates ?? []).filter((c) => !onlyLeads || c.novel), [twin, onlyLeads]);
  useFlip(listRef, shown.map((c) => c.id).join());
  // Two checks on the ranking itself, asked once per result set (hooks stay above the early returns below).
  const ready = !!origin && !!twin && step === 3 && status === "ready" && twin.purpose === purpose;
  const target = { body: (origin?.body ?? body) as Planet, lat: origin?.lat ?? 0, lon: origin?.lon ?? 0, purpose, ...(custom ? { weights: custom } : {}) };
  const checkKey = ready ? `${runKey}|${JSON.stringify(custom ?? {})}` : "";
  const robust = useCheck((signal) => api.robustness({ ...target, n: 10 }, signal), checkKey, ready);
  const validation = useCheck((signal) => api.validation(target, signal), checkKey, ready && tab === "documented");

  // One line that says what a re-weighting did, from the two real rankings.
  const [toast, setToast] = useState<string | null>(null);
  const prev = useRef<{ key: string; order: string[] } | null>(null);
  useEffect(() => {
    if (!twin || status !== "ready") return;
    const order = twin.candidates.map((c) => c.id);
    const was = prev.current;
    prev.current = { key: runKey, order };
    const ch = lastChange.current;
    if (!was || was.key !== runKey || !ch || was.order.join() === order.join() && !custom) return;
    lastChange.current = null;
    let best: { name: string; up: number } | null = null;
    twin.candidates.forEach((c, i) => { const before = was.order.indexOf(c.id); const up = before < 0 ? 0 : before - i; if (up > 0 && (!best || up > best.up)) best = { name: shortPlace(c.place.label), up }; });
    const entered = twin.candidates.filter((c) => !was.order.includes(c.id)).length;
    const moved = best as { name: string; up: number } | null;
    setToast(`${ch.label} ${ch.raised ? "raised" : "lowered"} to ${ch.share}%: ${moved ? `${moved.name} moved up ${moved.up}` : entered ? `${entered} new ${entered === 1 ? "place" : "places"} entered the top ${order.length}` : "the top matches kept their order"}.`);
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [twin, status, runKey, custom]);

  if (!origin || step < 3) {
    return (
      <div className="results-empty">
        <span className="eyebrow">Step 3 · Results</span>
        <h2 className="placename">Earth's closest matches appear here</h2>
        <p>{!origin ? `Pick a place on ${body === "moon" ? "the Moon" : "Mars"}. RADIUM then compares it with ${count(findings.counts.earth_cells)} places on Earth.` : "Now choose what you want to test. The same place can be a strong twin for one purpose and a weak one for another."}</p>
        <ul className="results-legend">
          <li><GradeBadge grade="A" /> <span>{GRADE_HELP.split(". ")[0]}.</span></li>
          <li><span className="tag tag-lead"><Sparkles size={10} aria-hidden />New lead</span> <span>Not in the list of documented analog sites.</span></li>
        </ul>
      </div>
    );
  }
  if (status === "error") return <div className="p-4"><Notice tone="error" title="The comparison could not be computed" action={<Button size="sm" variant="outline" onClick={() => void runTwin()}>Try again</Button>}>{error}</Notice></div>;
  if (!twin || !revealed) {
    return (
      <div className="results-wait" aria-busy="true" data-results-wait>
        <span className="eyebrow">Comparing with every place on Earth</span>
        {[0, 1, 2, 3, 4, 5].map((k) => <span key={k} className="skeleton" style={{ height: 44, opacity: 1 - k * 0.13 }} />)}
      </div>
    );
  }

  const dist = twin.distribution;
  const verb = purposeVerb(twin.purpose, twin.planet.body);
  const firstLead = shown.findIndex((c) => c.novel);

  return (
    <div aria-busy={status === "loading"} className={cx("results", status === "loading" && "results-busy")} data-results>
      <header className="results-head">
        <span className="eyebrow"><TwinScoreIcon size={14} /> Twin score · {verb.label}</span>
        <p className="results-sum">
          {dist.grades.A === 0
            ? <>No place on Earth earns an A. The best of {count(dist.cells)} scores <b className="mono">{dist.best?.toFixed(2)}</b>.</>
            : <><b className="mono">{count(dist.grades.A)}</b> of {count(dist.cells)} places on Earth earn an A.</>}
          {" "}Matches listed are at least {twin.separation_km} km apart.
        </p>
        {!twin.purpose_applicable && twin.purpose_note && <Notice tone="warn">{twin.purpose_note} The list below matches the other characteristics only.</Notice>}
        {twin.planet_coverage < 0.999 && <Notice tone="info">{coverageText(twin.planet_coverage)}: {twin.dimensions.filter((d) => !d.available).map((d) => dimensionLabel(d.id, d.label).toLowerCase()).join(", ")} has no data at this site.</Notice>}
        <details className="results-target"><summary>About the target and its data</summary><TargetContext twin={twin} /></details>
      </header>

      {toast && <p className="rerank-toast" role="status" data-rerank-toast>{toast}</p>}
      {tab === "best" && !onlyLeads && shown.length >= 3 && <TopThree list={shown.slice(0, 3)} picked={picked} onPick={(c) => void pickEarth(c.lat, c.lon, true)} />}
      <Selected robust={robust} />

      <div className="results-tabs">
        <div role="tablist" aria-label="Lists">
          {([["best", "Best matches"], ["documented", "Documented analog sites"]] as const).filter(([id]) => (id === "best" ? modelled : documented)).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="ctl">{label}</button>
          ))}
        </div>
        <LeadFilter />
      </div>
      {tab === "best" ? (
        <>
          <ol ref={listRef} className="result-list" data-discovery-results key={runKey}>
            {shown.map((c, k) => <ResultRow key={c.id} c={c} k={k} runKey={runKey} firstLead={k === firstLead} active={!!picked && near(picked, c)} onClick={() => void pickEarth(c.lat, c.lon, true)} />)}
          </ol>
          {onlyLeads && !shown.length && <p className="results-note">No new leads in these top results. Choose Both to see every match, or change the site or purpose.</p>}
          <p className="results-note">{GRADE_HELP}</p>
          <p className="results-note">Ranked by data alone. The list of documented analog sites is used only to label results and never changes a grade. Click anywhere on the map to grade a place of your own.</p>
        </>
      ) : (
        <>
          <ValidationPanel v={validation} world={twin.planet.body === "moon" ? "the Moon" : "Mars"} />
          <ol className="result-list">{twin.documented.map((d) => <DocumentedRow key={d.name} d={d} onClick={() => void pickEarth(d.lat, d.lon, true)} />)}</ol>
        </>
      )}
      <TryNext />
      <footer className="results-foot">
        <Switch checked={showOverlay} onChange={(v) => useStore.setState({ showTwinOverlay: v })} label="Colour all of Earth by twin grade" />
        <Button size="sm" variant="outline" onClick={() => downloadCsv(`radium-earth-twins-${twin.planet.body}-${twin.purpose}.csv`,
          ["rank", "type", "place", "lat", "lon", "similarity_score", "similarity_grade", "coverage", ...twin.dimensions.map((d) => `${d.id}_grade`), "documented_site_within_150km", "documented_distance_km"],
          [...twin.candidates.map((c) => [c.rank, "modelled_region", c.place.label, c.lat, c.lon, c.score, c.grade, c.coverage, ...twin.dimensions.map((d) => c.dimensions.find((x) => x.id === d.id)?.grade ?? null), c.documented?.name ?? null, c.documented?.distance_km ?? null]),
           ...twin.documented.map((d) => [null, "documented_site", d.name, d.lat, d.lon, d.analysed ? d.score : null, d.analysed ? d.grade : null, null, ...twin.dimensions.map(() => null), d.name, 0])],
          [`RADIUM Earth twins export. Target: ${twin.planet.body} ${twin.planet.coords} (${twin.planet.place.label}). Purpose: ${twin.purpose}.`,
           "Scores are twin similarity (0-1) on RADIUM's own scale, not NASA ratings; empty means no data.", "Matches are 0.25 degree map squares, not verified field sites."])}>
          <Download size={13} /> Download CSV
        </Button>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------- view */
export function TwinView() {
  const meta = useStore((s) => s.meta)!;
  const body = useStore((s) => s.body) as Planet;
  const origin = useStore((s) => s.twinOrigin);
  const step = useStore((s) => s.twinStep);
  const twin = useStore((s) => s.twin);
  const twinStatus = useStore((s) => s.twinStatus);
  const purpose = useStore((s) => s.purpose);
  const picked = useStore((s) => s.picked);
  const compare = useStore((s) => s.compare);
  const compareStatus = useStore((s) => s.compareStatus);
  const showOverlay = useStore((s) => s.showTwinOverlay);
  const focus = useStore((s) => s.focus);
  const cell = useStore((s) => s.cell);
  const earthPins = useStore((s) => s.pins.earth);
  const worldPins = useStore((s) => s.pins[s.body]);
  const earthLayers = useStore((s) => s.layers.earth);
  const colorBy = useStore((s) => s.colorBy);
  const gradeFilter = useStore((s) => s.gradeFilter);
  const showDocumented = useStore((s) => s.showDocumented);
  const showModelled = useStore((s) => s.showModelled);
  const catFilter = useStore((s) => s.catFilter);
  const twinWeights = useStore((s) => s.twinWeights);
  const fresh = useNotebook((n) => n.fresh.length);
  const { pickEarth, startTwin, setTwinStep } = useStore.getState();
  const handle = useRef<GlobeHandle>(null);
  const globe = useRef<GlobeHandle>(null);
  const tapes = useRef<TapesHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const link = useRef<SVGPathElement>(null);
  const linkCase = useRef<SVGPathElement>(null);

  // ---- the search sweep is tied to the request for a new site or purpose (not to re-weighting)
  const searchKey = origin ? `${origin.body}:${origin.lat},${origin.lon}|${purpose}` : "";
  const settled = useRef("");
  const searching = step === 3 && twinStatus === "loading" && settled.current !== searchKey;
  const total = findings.counts.earth_cells;
  const scan = useScan(searching, (p) => {
    const w = stage.current?.clientWidth ?? 0;
    if (veil.current) veil.current.style.transform = `scaleX(${1 - p})`;
    if (line.current) line.current.style.transform = `translateX(${p * w}px)`;
    if (readout.current) readout.current.textContent = `Comparing ${count(Math.round(p * total))} / ${count(total)}`;
  });
  const revealed = scan.revealed && !!twin && twinStatus !== "error" && (twinStatus === "ready" || settled.current === searchKey);
  useEffect(() => { if (scan.revealed && twinStatus === "ready") settled.current = searchKey; }, [scan.revealed, twinStatus, searchKey]);
  const runKey = searchKey;

  // ---- the top match is opened as soon as results arrive: its comparison feeds the strip below
  useEffect(() => {
    if (step !== 3 || !revealed || !twin || picked || twinStatus !== "ready" || twin.purpose !== purpose) return;
    const top = twin.candidates[0];
    if (top) void pickEarth(top.lat, top.lon);
  }, [step, revealed, twin, picked, twinStatus, purpose, pickEarth]);

  const basemap = meta.layers.earth.tiles.find((b) => b.id === earthLayers.base) ?? meta.layers.earth.tiles[0];
  const url = origin && step === 3 && showOverlay ? overlay.twin(origin.body, origin.lat, origin.lon, purpose, twinWeights) : null;
  const markers: SiteMarker[] = useMemo(
    () => (showModelled && revealed ? twin?.candidates ?? [] : [])
      .filter((c) => gradeFilter.includes(c.grade ?? "none") && (showDocumented || c.novel))
      .map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, text: c.grade ?? "·", grade: c.grade, newLead: c.novel, rank: c.rank, score: c.score, name: c.place.label, numbered: true, active: !!picked && near(picked, c) })),
    [twin, picked, showModelled, showDocumented, gradeFilter, revealed],
  );
  // Documented sites become badges coloured by grade, environment or study theme, then filtered.
  const ctx = useMemo(() => (origin ? `${WORLD[origin.body]} ${purposeVerb(purpose, origin.body).label.toLowerCase()}` : ""), [origin, purpose]);
  const gradedPins = useMemo(() => {
    if (!showDocumented || step < 3) return [];
    const g = new Map((twin?.documented ?? []).map((d) => [d.name, d.analysed ? d.grade : null]));
    return earthPins
      .filter((p) => p.verification_status !== "review_needed")
      .map((p) => { const grade = twin ? (g.get(p.name) ?? null) : undefined; return { ...p, grade, badge: twin || colorBy !== "grade" ? badgeFor(p, colorBy, grade, ctx) : undefined }; })
      .filter((p) => {
        if (colorBy === "grade" && twin) return gradeFilter.includes(p.grade ?? "none");
        if (colorBy !== "grade" && catFilter) return pinCategories(p, colorBy).some((c) => catFilter.includes(c));
        return true;
      });
  }, [twin, earthPins, colorBy, gradeFilter, showDocumented, catFilter, ctx, step]);
  const sel = useMemo(() => {
    if (compare) return { lat: compare.earth.cell.lat, lon: compare.earth.cell.lon, outline: compare.earth.cell.outline };
    return picked ? { lat: picked.lat, lon: picked.lon } : null;
  }, [compare, picked]);
  const onPick = useCallback((lat: number, lon: number) => { const s = useStore.getState(); if (s.twinOrigin && s.twinStep === 3) void pickEarth(lat, lon); }, [pickEarth]);

  // ---- dashed link from the target inset to the top match on the Earth map
  const top = revealed ? twin?.candidates[0] : undefined;
  const drawLink = useCallback(() => {
    const el = link.current;
    if (!el) return;
    const p = top ? handle.current?.project?.(top.lat, top.lon) : null;
    const inset = stage.current?.querySelector<HTMLElement>("[data-target-inset]");
    const show = (on: boolean, d?: string) => { for (const path of [el, linkCase.current]) { if (!path) continue; if (d) path.setAttribute("d", d); path.style.opacity = on ? "1" : "0"; } };
    if (!p || !inset) { show(false); return; }
    const a = { x: inset.offsetLeft + inset.offsetWidth, y: inset.offsetTop + inset.offsetHeight * 0.5 };
    const b = { x: p.x - 17, y: p.y };
    if (b.x < a.x + 24) { show(false); return; }
    show(true, `M${a.x} ${a.y} C ${a.x + (b.x - a.x) * 0.45} ${a.y}, ${b.x - (b.x - a.x) * 0.3} ${b.y}, ${b.x} ${b.y}`);
  }, [top]);
  const onView = useCallback((v: ViewState) => { tapes.current?.draw(v); drawLink(); }, [drawLink]);
  useEffect(() => { drawLink(); const t = window.setTimeout(drawLink, 700); return () => window.clearTimeout(t); }, [drawLink, step]);

  // ---- the target world: fills the stage while a site is being chosen, then shrinks to an inset
  const big = step < 3 || !origin;
  const tiles = meta.layers[body].tiles;
  const base = tiles.find((t) => t.group === "imagery") ?? tiles[0];
  const targetSel = useMemo(() => {
    if (!origin || origin.body !== body) return null;
    if (cell && cell.body === body) return { lat: cell.cell.lat, lon: cell.cell.lon, outline: cell.cell.outline };
    return { lat: origin.lat, lon: origin.lon };
  }, [origin, cell, body]);
  const flights = useRef(0);
  const originFocus = useMemo(() => {
    if (!origin || origin.body !== body) return focus;
    flights.current += 1;
    return { body, lat: origin.lat, lon: origin.lon, spanKm: body === "moon" ? 2200 : 4200, nonce: 1e6 + flights.current };
  }, [origin, body, focus]);
  const pickTarget = useCallback((lat: number, lon: number) => { const s = useStore.getState(); if (s.twinStep < 3 || !s.twinOrigin) startTwin({ body: s.body as Planet, lat, lon }); }, [startTwin]);
  const targetName = origin ? targetLabel({ pins: useStore.getState().pins }, origin, twin?.planet.place.label ?? "") : "";

  const scanning = step === 3 && !revealed && twinStatus !== "error";
  const dist = twin?.distribution;
  return (
    <div className="flow" data-flow="twin" data-step={step} data-revealed={revealed}>
      <Rail />
      <div ref={stage} className="flow-stage" data-stage>
        <div className="grid-bg" aria-hidden />
        <EarthMap ref={handle} basemap={basemap} labels={earthLayers.labels} overlayUrl={url} opacity={0.8} dimBase={!!url} pins={gradedPins} markers={markers} selection={sel} focus={focus} onPick={onPick} onView={onView}
          onMarker={(id) => { const c = twin?.candidates.find((x) => x.id === id); if (c) void pickEarth(c.lat, c.lon, true); }} />
        <Tapes ref={tapes} />

        {/* search sweep: the veil lifts behind the line as the request completes */}
        <div className="scan" data-phase={scan.phase} hidden={!scanning} aria-hidden>
          <div ref={veil} className="scan-veil" />
          <div ref={line} className="scan-line" />
        </div>
        {step === 3 && origin && (
          <p className="telemetry mono" role="status" data-telemetry data-scanning={scanning}>
            {scanning
              ? <><span ref={readout}>Comparing 0 / {count(total)}</span>{scan.phase === "waiting" && <span className="telemetry-wait"> · Still comparing…</span>}</>
              : dist ? <>Compared <b>{count(dist.cells)}</b> / {count(dist.cells)} · <b>{count(dist.grades.A)}</b> grade A</> : null}
          </p>
        )}

        <svg className="twin-link" aria-hidden key={`${runKey}:${revealed}`}>
          <defs><clipPath id="twin-link-reveal"><rect className="start-reveal" x="0" y="0" width="100%" height="100%" /></clipPath></defs>
          <g clipPath="url(#twin-link-reveal)"><path ref={linkCase} className="twin-link-case" style={{ opacity: 0 }} /><path ref={link} style={{ opacity: 0 }} /></g>
        </svg>

        <div className={cx("target", big ? "target-big" : "target-inset", `target-${body}`)} data-target-inset={big ? undefined : ""} data-target>
          <GlobeView key={body} ref={globe} body={body} base={base} pins={worldPins} selection={targetSel} focus={originFocus} onPick={pickTarget} />
          {origin && <span className="target-ping" key={`${origin.lat},${origin.lon}`} aria-hidden><i /><i /></span>}
          <span className="target-tag eyebrow"><span className={`world-disc ${body}`} style={{ "--d": "12px" } as React.CSSProperties} />{WORLD[body]} · {origin ? "target" : "pick a site"}</span>
          {big ? (
            <>
              <div className="surface-float target-zoom">
                <IconButton label="Zoom in" onClick={() => globe.current?.zoom(0.5)}><Plus size={16} /></IconButton>
                <IconButton label="Zoom out" onClick={() => globe.current?.zoom(2)}><Minus size={16} /></IconButton>
                <IconButton label="Reset the view" onClick={() => globe.current?.home()}><Home size={15} /></IconButton>
              </div>
              {!origin && <p className="target-hint">Click the globe to choose a site, or pick a famous place from the list.</p>}
            </>
          ) : (
            <button type="button" className="ctl target-change" onClick={() => setTwinStep(1)} title="Choose a different site">
              <span className="placename">{targetName}</span>
              <span className="mono">{twin ? twin.planet.coords : origin ? formatCoord(origin.lat, origin.lon) : ""}</span>
            </button>
          )}
        </div>
        {!big && twin && <div className="match-target-map-wrap"><TargetContext twin={twin} compact /></div>}

        {step === 3 && (
          <div className="surface-float map-zoom">
            <IconButton label="Zoom in" onClick={() => handle.current?.zoom(0.5)}><Plus size={16} /></IconButton>
            <IconButton label="Zoom out" onClick={() => handle.current?.zoom(2)}><Minus size={16} /></IconButton>
            <IconButton label="Reset the view" onClick={() => handle.current?.home()}><Home size={15} /></IconButton>
          </div>
        )}
        {step === 3 && origin && <AtlasPanel twin={twin} shownDocs={gradedPins.length} shownModel={markers.length} context={ctx} body={origin.body} />}
        {step === 3 && <div className="map-credit">{basemap.attribution}. {LABEL_ATTRIBUTION}.</div>}
      </div>
      <aside className="flow-results surface scroll" aria-label="Earth matches" data-fresh={fresh > 0}>
        <Results revealed={revealed} runKey={runKey} />
      </aside>
      <CantReproduce items={step === 3 && revealed ? compare?.match.breaks_down ?? null : null} world={origin?.body ?? body} pending={step === 3 && (scanning || compareStatus === "loading" || (!compare && !!picked))} />
    </div>
  );
}

/* ------------------------------------------------------------------ atlas */
/** Map legend and filters. Closed by default so the map stays clear. */
function AtlasPanel({ twin, shownDocs, shownModel, context, body }: { twin: ReturnType<typeof useStore.getState>["twin"]; shownDocs: number; shownModel: number; context: string; body: Planet }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const cats = s.colorBy === "grade" ? [] : categoriesFor(s.colorBy);
  const toggleGrade = (g: (typeof s.gradeFilter)[number]) =>
    s.setAtlas({ gradeFilter: s.gradeFilter.includes(g) ? s.gradeFilter.filter((x) => x !== g) : [...s.gradeFilter, g] });
  const toggleCat = (id: string) => {
    const cur = s.catFilter ?? cats.map((c) => c.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    s.setAtlas({ catFilter: next.length === cats.length ? null : next });
  };
  const reset = () => s.setAtlas({ colorBy: "grade", gradeFilter: ["A", "B", "C", "D", "F", "none"], showDocumented: true, showModelled: true, catFilter: null });
  const totalDocs = s.pins.earth.filter(p => p.verification_status !== "review_needed").length;
  const totalModel = twin?.candidates.length ?? 0;
  return (
    <div className="analog-atlas-position atlas">
      <div className="floating atlas-box" data-open={open}>
        <button type="button" className="ctl atlas-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Layers size={14} aria-hidden /><span>Map key and filters</span>
          <span className="atlas-scale" aria-hidden>{(["A", "B", "C", "D", "F"] as const).map((g) => <i key={g} style={{ background: GRADE_HEX[g] }}>{g}</i>)}</span>
        </button>
        {open && (
          <div className="atlas-body">
            <Segmented size="sm" label="Colour documented sites by" value={s.colorBy} onChange={(v) => s.setAtlas({ colorBy: v, catFilter: null })}
              options={[{ value: "grade", label: "Grade" }, { value: "environment", label: "Environment" }, { value: "application", label: "Study theme" }]} />
            <p className="atlas-text">
              {s.colorBy === "grade" ? `Numbered pins are the top matches; lettered circles are documented analog sites. Both are graded for ${context || `${WORLD[body]} similarity`} on RADIUM's own A to F scale, not a NASA rating. Grey circles have no score.`
                : s.colorBy === "environment" ? "Environment of each documented site, from its published study theme. Matches keep their grade colour."
                  : "What each documented site has been studied for, from the reference list. A study theme, not a measurement."}
            </p>
            <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Filter">
              {s.colorBy === "grade"
                ? (["A", "B", "C", "D", "F", "none"] as const).map((g) => (
                  <button key={g} type="button" aria-pressed={s.gradeFilter.includes(g)} onClick={() => toggleGrade(g)}
                    className={cx("chip grid h-6 min-w-6 place-items-center rounded-[4px] px-1 text-[11px] font-bold ring-1 ring-black/40", !s.gradeFilter.includes(g) && "opacity-30")}
                    style={{ background: g === "none" ? "#4a5260" : GRADE_HEX[g], color: g === "none" ? "#e9eef3" : "#101216" }} title={g === "none" ? "Not graded" : `Grade ${g}`}>
                    {g === "none" ? "–" : g}
                  </button>
                ))
                : cats.map((c) => {
                  const on = !s.catFilter || s.catFilter.includes(c.id);
                  return (
                    <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleCat(c.id)} title={c.label}
                      className={cx("chip inline-flex h-6 items-center gap-1 rounded-[4px] pr-1.5 pl-0.5 text-2xs text-regolith-100 ring-1", on ? "bg-basalt-700 ring-[var(--hair-strong)]" : "opacity-40 ring-[var(--hair)]")}>
                      <span className="grid h-5 min-w-5 place-items-center rounded-[3px] text-[10px] font-bold" style={{ background: c.color, color: c.ink }}>{c.code}</span>{c.label}
                    </button>
                  );
                })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-regolith-200">
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--world)]" checked={s.showDocumented} onChange={(e) => s.setAtlas({ showDocumented: e.target.checked })} /> Documented sites</label>
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--world)]" checked={s.showModelled} onChange={(e) => s.setAtlas({ showModelled: e.target.checked })} /> Top matches</label>
              <button type="button" className="ctl ml-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-regolith-300" onClick={reset}><RotateCcw size={11} /> Reset</button>
            </div>
            <p className="mono atlas-count" aria-live="polite">Showing {shownDocs} of {totalDocs} documented sites and {shownModel} of {totalModel} matches.</p>
            {s.showTwinOverlay && <div className="mt-2"><GradeLegend note="Map shading: every place's grade for this purpose. Clear areas are water or lack data." /></div>}
          </div>
        )}
      </div>
    </div>
  );
}
