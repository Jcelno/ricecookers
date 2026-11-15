import { ArrowLeftRight, ExternalLink, Layers, LocateFixed, MapPin, Navigation, X } from "lucide-react";
import { useState } from "react";

import { SiteCard } from "@/components/panels/SiteCard";
import { Photos } from "@/components/ui/Photos";
import { AssessmentChips, AssessmentGrade } from "@/components/ui/Assessment";
import { Button, cx, EvidenceGlyph, EvidenceTag, GradeTile, IconButton, Meter, Notice, Section, Spinner } from "@/components/ui/primitives";
import { featuredPhotos, photoKey, photosFor } from "@/lib/photos";
import { formatKm, formatMeasure, formatValue, GRADE_MEANING, inUnit, pct } from "@/lib/format";
import type { Body, CellInfo, Evidence, Factor, Measure, Planet, Suitability } from "@/lib/types";
import { useStore } from "@/store";

const EVIDENCE_ORDER: Evidence[] = ["observed", "inferred", "modelled", "computed", "interpreted"];

/** One click: Gale crater, rover mobility, compared with its best Earth match. Real API results, nothing canned. */
export function runWorkedExample() {
  const st = useStore.getState();
  const target=st.pins.mars.find(p=>p.name.includes("Curiosity")) ?? st.pins.mars.find(p=>p.name === "Gale");
  if(!target)return;
  st.startTwin({ body: "mars", lat: target.lat, lon: target.lon });
  st.setPurpose("mobility");
  const unsub = useStore.subscribe((s) => {
    if (s.twin && s.twin.purpose === "mobility" && s.twin.candidates.length && !s.picked) {
      unsub();
      void s.pickEarth(s.twin.candidates[0].lat, s.twin.candidates[0].lon, true);
    }
  });
  setTimeout(unsub, 20000);
}

function Empty({ body }: { body: Body }) {
  const st = useStore();
  const sites = st.pins[body];
  const mission = st.mode === "mission";
  return <div className="explore-intro anim-fade">
    <div className="flex items-center gap-2 text-xs text-regolith-400"><span className={`planet-dot ${body}`} />{body === "moon" ? "Our nearest frontier" : body === "mars" ? "A world of possibilities" : "Fieldwork starts here"}</div>
    <h2>{mission ? <>Choose the ground<br/>for your mission.</> : <>Explore a world.<br/>Understand a place.</>}</h2>
    <p className="intro-copy">{mission ? "Choose a documented destination or inspect a model candidate. Evaluate its terrain, resources and limits against the priorities you set." : "Read the terrain, trace the evidence, and find the places on Earth that help us prepare for the Moon and Mars."}</p>
    <div className="intro-actions"><Button variant="solid" disabled={mission && !st.rank?.sites.length} onClick={() => {if(mission){const site=st.rank?.sites[0];if(site)void st.select(body,site.lat,site.lon,{source:"catalog",fly:true,spanKm:500});}else st.setSheet("intro");}}>{mission ? "Inspect top candidate" : "Take the interactive tour"}</Button><Button variant="outline" onClick={()=>mission ? document.querySelector<HTMLButtonElement>('[data-mission-step="3"]')?.click() : runWorkedExample()}>{mission ? "See candidate ranking" : "Try a live Mars example"}</Button></div>
    <div className="intro-note"><MapPin size={17} /><p>Choose a research site below, or select anywhere on the {body === "earth" ? "map" : "globe"}. Each measurement includes its source and resolution.</p></div>
    <div className="flex items-center justify-between pt-5"><h3 className="text-sm font-semibold">Start with a research site</h3><span className="text-xs text-regolith-400">{sites.length} on {body === "moon" ? "the Moon" : body === "mars" ? "Mars" : "Earth"}</span></div>
    <ul className="mt-2 divide-y divide-[var(--hair)]">{sites.slice(0,5).map(p=><li key={p.id}><button className="row-ctl w-full rounded-md px-1 py-3 text-left" onClick={()=>void st.select(body,p.lat,p.lon,{source:"catalog",fly:true,spanKm:body === "earth" ? 900 : 700})}><span className="block font-serif text-lg text-regolith-50">{p.name}</span><span className="mt-1 block text-xs leading-relaxed text-regolith-400">{p.note}</span></button></li>)}</ul>
    <p className="mt-5 border-t border-[var(--hair)] pt-4 text-xs leading-relaxed text-regolith-400">{st.meta?.bodies[body].cell_note}</p>
    <p className="mt-3 text-2xs leading-relaxed text-regolith-500">Built for the NASA Space Apps Challenge. RADIUM grades are exploratory model outputs, not NASA ratings.</p>
  </div>;
}

function MeasureRow({ m: raw, body }: { m: Measure; body: Body }) {
  const [open, setOpen] = useState(false);
  const temp = useStore((s) => s.tempUnit);
  const m = inUnit(raw, temp);
  const meta = useStore((s) => s.meta)!;
  const setLayer = useStore((s) => s.setLayer);
  const mode = useStore((s) => s.mode);
  const src = m.source ? meta.sources_index[m.source] : null;
  const missing = m.value === null;
  return (
    <li className="border-t border-[var(--hair)] first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="row-ctl flex w-full items-baseline gap-2 px-4 py-1.5 text-left">
        <span className={cx("mt-0.5 self-center", missing ? "text-regolith-500" : "text-regolith-300")}>
          <EvidenceGlyph kind={m.evidence} />
        </span>
        <span className={cx("min-w-0 flex-1 text-sm", missing ? "text-regolith-400" : "text-regolith-200")}>{m.label}</span>
        <span className={cx("tnum shrink-0 text-right text-sm", missing ? "text-regolith-500 italic" : "font-medium text-regolith-50")}>
          {missing ? "Data unavailable" : formatMeasure(m)}
          {!missing && !m.text && m.unit && m.fmt !== "percent" && <span className="ml-1 font-normal text-regolith-400">{m.unit}</span>}
        </span>
      </button>
      {open && (
        <div className="anim-fade px-4 pt-0.5 pb-3 pl-[38px] text-xs leading-relaxed text-regolith-300">
          <p>{m.desc}</p>
          {m.caveat && <p className="mt-1.5 text-regolith-400">{m.caveat}</p>}
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-regolith-500">Evidence</dt>
            <dd><EvidenceTag kind={m.evidence} /><span className="mt-0.5 block text-regolith-400">{meta.evidence[m.evidence].desc}</span></dd>
            <dt className="text-regolith-500">Resolution</dt>
            <dd>{m.res}</dd>
            {m.sigma !== null && (
              <>
                <dt className="text-regolith-500">Uncertainty</dt>
                <dd>± {formatValue(m.sigma, Math.max(m.dec, 1))} {m.unit} (one sigma, from the source product)</dd>
              </>
            )}
            <dt className="text-regolith-500">Source</dt>
            <dd>
              {src ? (
                <a className="link inline-flex items-baseline gap-1" href={src.url} target="_blank" rel="noreferrer">
                  {src.name}
                  <ExternalLink size={11} className="shrink-0 self-center" />
                </a>
              ) : (
                "Calculated by RADIUM from the formula above"
              )}
            </dd>
          </dl>
          {m.has_layer && mode !== "twin" && (
            <Button size="sm" variant="outline" className="mt-2.5" onClick={() => setLayer(body, { overlay: { kind: "grid", id: m.id } })}>
              <Layers size={13} /> Show this on the map
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function FactorRow({ f }: { f: Factor }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-[var(--hair)] first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="row-ctl grid w-full grid-cols-[24px_1fr_auto] items-center gap-x-2.5 px-4 py-2 text-left">
        <GradeTile grade={f.grade} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm text-regolith-100">{f.label}</span>
          <Meter value={f.value} grade={f.grade} className="mt-1" />
        </span>
        <span className="tnum text-xs text-regolith-400" title="Share of the overall score">{pct(f.weight)}</span>
      </button>
      {open && (
        <div className="anim-fade px-4 pb-3 pl-[50px] text-xs leading-relaxed text-regolith-300">
          <p className="text-regolith-200">{f.question}</p>
          {f.value === null && <p className="mt-1 text-alert">No data here for this criterion, so it is left out and the other weights are rescaled.</p>}
          <ul className="mt-1.5 space-y-0.5">
            {f.inputs.map((i) => (
              <li key={i.id} className="flex items-baseline gap-2">
                <span className="self-center text-regolith-400"><EvidenceGlyph kind={i.evidence} size={10} /></span>
                <span className="flex-1">{i.label}</span>
                <span className="tnum font-medium text-regolith-100">{i.value === null ? "no data" : `${formatValue(i.value, i.dec, i.fmt)}${i.unit && i.fmt !== "percent" ? ` ${i.unit}` : ""}`}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2"><span className="text-regolith-500">Rule. </span>{f.rule}</p>
          <p className="mt-1 text-regolith-400">{f.caveat}</p>
        </div>
      )}
    </li>
  );
}

export function SuitabilityBlock({ s }: { s: Suitability }) {
  const meta = useStore((st) => st.meta)!;
  const mission = meta.missions.find((m) => m.id === s.mission);
  return (
    <section className="hair-t">
      <div className="flex items-center gap-3.5 px-4 pt-4 pb-3">
        <AssessmentGrade grade={s.grade} coverage={s.coverage} minCoverage={s.min_coverage} excluded={s.excluded} size="xl" />
        <div className="min-w-0">
          <div className="text-xs text-regolith-400">{mission?.label}</div>
          <div className="text-lg leading-tight font-semibold text-regolith-50">
            {s.excluded ? "Ruled out" : s.grade ? `${GRADE_MEANING[s.grade]} suitability` : "Not enough data to grade"}
          </div>
          <div className="mt-0.5 text-xs leading-snug text-regolith-400">
            {s.excluded
              ? `Would otherwise grade ${s.grade ?? "–"}.`
              : s.coverage < 0.999
                ? `Based on ${pct(s.coverage)} of the weighted criteria; the rest have no data here.`
                : "All criteria have data here."}
          </div>
          <div className="mt-2"><AssessmentChips coverage={s.coverage} factors={s.factors} /></div>
        </div>
      </div>
      {s.failed_limits.length > 0 && (
        <div className="space-y-2 px-4 pb-3">
          {s.failed_limits.map((l) => (
            <Notice key={l.id} tone="warn" title={l.label}>
              {l.rule} {l.why}
            </Notice>
          ))}
        </div>
      )}
      <ul>{s.factors.map((f) => <FactorRow key={f.id} f={f} />)}</ul>
      <p className="px-4 py-2.5 text-2xs leading-snug text-regolith-500">Bars show how well each criterion is met. Percentages are each criterion's share of the grade. Select a row for the measurements and the rule behind it.</p>
    </section>
  );
}

function Header({ cell }: { cell: CellInfo }) {
  const clear = useStore((s) => s.clearSelection);
  const flyTo = useStore((s) => s.flyTo);
  const startTwin = useStore((s) => s.startTwin);
  const mode = useStore((s) => s.mode);
  const [ns, ew] = cell.cell.size_km;
  const span = Math.max(ns * 14, cell.body === "earth" ? 500 : 180);
  return (
    <header className="px-4 pt-4 pb-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="placename placename-lg text-regolith-50 [overflow-wrap:anywhere]">{cell.place.label}</h2>
          <div className="tnum mt-1 text-sm text-regolith-300">{cell.coords}</div>
        </div>
        <IconButton label="Clear the selection" onClick={clear} className="-mt-1 -mr-2"><X size={16} /></IconButton>
      </div>
      <p className="mt-1.5 text-xs leading-snug text-regolith-400">
        Values describe one analysis cell, {Math.abs(ns - ew) < 0.3 ? `${formatKm(ns)} across` : `${formatKm(ns)} north–south by ${formatKm(ew)} east–west`}
        {cell.cell.kind === "polar" ? " (polar grid)" : ""}, not the exact point clicked.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {cell.body !== "earth" && mode !== "twin" && (
          <Button variant="solid" size="sm" onClick={() => startTwin({ body: cell.body as Planet, lat: cell.cell.lat, lon: cell.cell.lon })}>
            <ArrowLeftRight size={13} /> Find its Earth twins
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => flyTo(cell.body, cell.cell.lat, cell.cell.lon, span)}>
          <LocateFixed size={13} /> Centre the map here
        </Button>
      </div>
    </header>
  );
}

export function CellDetails({ cell }: { cell: CellInfo }) {
  const used = new Set<Evidence>();
  cell.groups.forEach((g) => g.items.forEach((i) => used.add(i.evidence)));
  return (
    <>
      {cell.note && <div className="px-4 pb-3"><Notice tone="info">{cell.note}</Notice></div>}
      {cell.nearby_pins.length > 0 && (
        <div className="space-y-2 px-4 pb-3">
          {cell.nearby_pins.slice(0, 2).map((p) => (
            <div key={p.id} className="rounded-sm bg-basalt-800 px-3 py-2 text-xs leading-snug text-regolith-300">
              <span className="font-semibold text-regolith-50">{p.name}</span>
              {p.year ? `, ${p.year}` : ""} is {p.distance_km! < 1 ? "here" : `${formatKm(p.distance_km!)} away`}. {p.note}
              <span className="mt-0.5 block text-regolith-500">{p.kind === "analog" ? `${p.verification_status === "review_needed" ? "Research candidate; evidence needs review." : "Documented analog site."} ${p.source}` : p.source}</span>
            </div>
          ))}
        </div>
      )}
      {cell.groups.map((g) => {
        const have = g.items.filter((i) => i.value !== null).length;
        return (
          <Section key={g.id} title={g.label} count={have === g.items.length ? `${have}` : `${have} of ${g.items.length}`}>
            <ul className="pb-1">{g.items.map((m) => <MeasureRow key={m.id} m={m} body={cell.body} />)}</ul>
          </Section>
        );
      })}
      <footer className="hair-t px-4 py-3">
        <div className="mb-1.5 text-xs font-medium text-regolith-300">How to read evidence labels</div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-regolith-400">
          {EVIDENCE_ORDER.filter((e) => used.has(e)).map((e) => (
            <li key={e} className="flex items-center gap-1.5 text-regolith-300"><EvidenceTag kind={e} /></li>
          ))}
        </ul>
        <p className="mt-2 text-2xs leading-snug text-regolith-500">Select any row for its source, native resolution and limits.</p>
      </footer>
    </>
  );
}

export function LocationPanel() {
  const body = useStore((s) => s.body);
  const cell = useStore((s) => s.cell);
  const status = useStore((s) => s.cellStatus);
  const error = useStore((s) => s.cellError);
  const refresh = useStore((s) => s.refreshCell);

  if (status === "error") {
    return (
      <div className="p-4">
        <Notice tone="error" title="This place could not be loaded" action={<Button size="sm" variant="outline" onClick={() => void refresh()}>Try again</Button>}>{error}</Notice>
      </div>
    );
  }
  if (!cell || cell.body !== body) return status === "loading" ? <div className="p-5"><Spinner label="Reading the grids for this place" /></div> : <Empty body={body} />;
  return (
    <div className={cx("relative", status === "loading" && "opacity-70")} aria-busy={status === "loading"}>
      <SiteCard cell={cell} />
    </div>
  );
}
