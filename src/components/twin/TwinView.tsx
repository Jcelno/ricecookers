import { ArrowLeft, Home, Minus, Plus } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { EarthMap, LABEL_ATTRIBUTION } from "@/components/map/EarthMap";
import { type GlobeHandle, GlobeView, type SiteMarker, type ViewState } from "@/components/map/GlobeView";
import { GradeLegend } from "@/components/map/Stage";
import { Tapes, type TapesHandle } from "@/components/map/Tapes";
import { Photos } from "@/components/ui/Photos";
import { Button, cx, GradeTile, IconButton, Meter, Notice, Section, Spinner, Switch } from "@/components/ui/primitives";
import { overlay } from "@/lib/api";
import { photoKey, photosFor } from "@/lib/photos";
import { formatCoord, formatKm, formatMeasure, formatValue, GRADE_MEANING, pct } from "@/lib/format";
import type { Candidate, CellInfo, CompareResult, DimDetail, DocumentedSite, Measure, Planet } from "@/lib/types";
import { useStore } from "@/store";

const START: Record<Planet, { name: string; lat: number; lon: number; why: string }[]> = {
  moon: [
    { name: "Ridge beside Shackleton", lat: -89.45, lon: -137.31, why: "Cold, rugged, ice-bearing ground at the south pole" },
    { name: "Apollo 11 site", lat: 0.67, lon: 23.47, why: "Smooth basalt plain of Mare Tranquillitatis" },
    { name: "Apollo 16 site", lat: -8.97, lon: 15.5, why: "Feldspathic highlands near Descartes" },
  ],
  mars: [
    { name: "Jezero crater", lat: 18.44, lon: 77.45, why: "Basaltic terrain around an ancient delta" },
    { name: "Phoenix landing site", lat: 68.22, lon: -125.75, why: "Flat, frozen northern plains over ground ice" },
    { name: "Arcadia Planitia", lat: 45.0, lon: -170.0, why: "Mid-latitude plain with shallow ice" },
  ],
};

/* ---------------------------------------------------------------- left column */
function Origin() {
  const meta = useStore((s) => s.meta)!;
  const body = useStore((s) => s.body) as Planet;
  const origin = useStore((s) => s.twinOrigin);
  const twin = useStore((s) => s.twin);
  const purpose = useStore((s) => s.purpose);
  const cell = useStore((s) => s.cell);
  const allPins = useStore((s) => s.pins[s.body]);
  const focus = useStore((s) => s.focus);
  const { startTwin, setPurpose, setBody } = useStore.getState();
  const handle = useRef<GlobeHandle>(null);

  const tiles = meta.layers[body].tiles;
  const base = tiles.find((t) => t.group === "imagery") ?? tiles[0];
  const pins = useMemo(() => allPins.filter((p) => p.kind === "landing"), [allPins]);
  const sel = useMemo(() => {
    if (!origin || origin.body !== body) return null;
    if (cell && cell.body === body) return { lat: cell.cell.lat, lon: cell.cell.lon, outline: cell.cell.outline };
    return { lat: origin.lat, lon: origin.lon };
  }, [origin, cell, body]);
  const onPick = useCallback((lat: number, lon: number) => startTwin({ body: useStore.getState().body as Planet, lat, lon }), [startTwin]);
  // Keep the chosen site in view: fly there whenever the origin changes (for example a polar site picked in
  // Explore, which would otherwise sit out of sight behind the default near-side view).
  const flights = useRef(0);
  const originFocus = useMemo(() => {
    if (!origin || origin.body !== body) return focus;
    flights.current += 1;
    return { body, lat: origin.lat, lon: origin.lon, spanKm: body === "moon" ? 2200 : 4200, nonce: 1e6 + flights.current };
  }, [origin, body, focus]);
  const purposes = meta.purposes[body];
  const status = twin?.purposes ?? [];

  return (
    <aside className="surface hair-r scroll z-20 flex h-full w-[340px] shrink-0 flex-col max-lg:w-[280px] max-md:hidden" aria-label="Planetary site">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h2 className="text-md font-semibold text-regolith-50">Earth Twin</h2>
        <div role="tablist" aria-label="World to match" className="inline-flex rounded-md bg-basalt-950/70 p-0.5 ring-1 ring-[var(--hair)]">
          {(["moon", "mars"] as Planet[]).map((b) => (
            <button key={b} type="button" role="tab" aria-selected={body === b}
              onClick={() => { if (b !== body) { setBody(b); useStore.setState({ twinOrigin: null, twin: null, picked: null, compare: null }); useStore.getState().startTwin(); } }}
              className="ctl h-6 rounded-sm px-2.5 text-xs font-medium text-regolith-300">
              {b === "moon" ? "Moon" : "Mars"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mx-4 aspect-square overflow-hidden rounded-md bg-void ring-1 ring-[var(--hair)]">
        <GlobeView key={body} ref={handle} body={body} base={base} pins={pins} selection={sel} focus={originFocus} onPick={onPick} />
        <div className="surface-float absolute top-2 right-2 flex flex-col rounded-sm ring-1 ring-[var(--hair)]">
          <IconButton label="Zoom in" className="size-7" onClick={() => handle.current?.zoom(0.5)}><Plus size={14} /></IconButton>
          <IconButton label="Zoom out" className="size-7" onClick={() => handle.current?.zoom(2)}><Minus size={14} /></IconButton>
        </div>
        {!origin && <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pt-8 pb-2.5 text-xs text-regolith-100">Click the globe to choose a site.</div>}
      </div>

      {!origin ? (
        <div className="anim-rise px-4 pt-4 pb-5">
          <p className="text-sm leading-relaxed text-regolith-300">
            Choose a place on {body === "moon" ? "the Moon" : "Mars"}. RADIUM compares it with every land cell on Earth and grades how closely each one matches.
          </p>
          <div className="mt-4 text-xs font-medium text-regolith-400">Or start from one of these</div>
          <ul className="mt-1">
            {START[body].map((q) => (
              <li key={q.name}>
                <button type="button" onClick={() => { startTwin({ body, lat: q.lat, lon: q.lon }); useStore.getState().flyTo(body, q.lat, q.lon, 900); }} className="row-ctl -mx-2 block w-[calc(100%+16px)] rounded-sm px-2 py-1.5 text-left">
                  <span className="placename block text-md text-regolith-50">{q.name}</span>
                  <span className="block text-xs leading-snug text-regolith-400">{q.why}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="px-4 pt-3 pb-3">
            <div className="text-xs text-regolith-400">Matching against</div>
            <div className="placename mt-0.5 text-lg leading-tight text-regolith-50 [overflow-wrap:anywhere]">{twin?.planet.place.label ?? (cell?.body === body ? cell.place.label : "…")}</div>
            <div className="tnum mt-0.5 text-xs text-regolith-300">
              {twin ? twin.planet.coords : formatCoord(origin.lat, origin.lon)}
              {twin ? `, one ${formatKm(twin.planet.cell_km[0])} cell` : ""}
            </div>
          </div>

          <Section title="What is the analog for?">
            <div role="radiogroup" aria-label="Purpose" className="px-2 pb-2">
              {purposes.map((p) => {
                const st = status.find((x) => x.id === p.id);
                const na = st ? !st.applicable : false;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={purpose === p.id} aria-current={purpose === p.id} onClick={() => setPurpose(p.id)}
                    className="row-ctl flex w-full items-start gap-2.5 rounded-sm px-2 py-1.5 text-left">
                    <span className={cx("mt-1 grid size-3.5 shrink-0 place-items-center rounded-full ring-1", purpose === p.id ? "ring-[var(--world)]" : "ring-[var(--hair-strong)]")}>
                      {purpose === p.id && <span className="size-2 rounded-full bg-world" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cx("block text-sm", purpose === p.id ? "text-regolith-50" : "text-regolith-200")}>{p.label}</span>
                      <span className="block text-xs leading-snug text-regolith-400">{na ? "Not relevant to this site" : p.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {twin && (
            <Section title="What gets compared" defaultOpen={false} count={`${twin.dimensions.filter((d) => d.available).length} of ${twin.dimensions.length}`}>
              <ul className="px-4 pb-3 text-xs">
                {twin.dimensions.map((d) => (
                  <li key={d.id} className="flex items-baseline justify-between gap-2 border-t border-[var(--hair)] py-1.5 first:border-t-0">
                    <span className={d.available ? "text-regolith-200" : "text-regolith-500"}>{d.label}</span>
                    <span className="tnum text-regolith-400">{d.available ? pct(d.weight) : "no data at this site"}</span>
                  </li>
                ))}
                <li className="pt-2 leading-snug text-regolith-500">Percentages are each dimension's share of the match for this purpose. Gravity, air pressure and radiation are never scored: Earth cannot reproduce them.</li>
              </ul>
            </Section>
          )}
        </>
      )}
    </aside>
  );
}

/* --------------------------------------------------------------- right column */
function CandidateRow({ c, active, onClick }: { c: Candidate; active: boolean; onClick: () => void }) {
  return (
    <li className="border-t border-[var(--hair)]">
      <button type="button" aria-current={active} onClick={onClick} className="row-ctl grid w-full grid-cols-[18px_32px_1fr] items-start gap-x-2.5 px-4 py-2.5 text-left">
        <span className="tnum mt-1.5 text-right text-xs text-regolith-400">{c.rank}</span>
        <GradeTile grade={c.grade} />
        <span className="min-w-0">
          <span className="placename block text-md leading-tight text-regolith-50 [overflow-wrap:anywhere]">{c.place.label}</span>
          <span className="tnum mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-regolith-400">
            {c.coords}
            {c.documented ? (
              <span className="rounded-xs bg-basalt-600 px-1.5 py-px text-2xs text-regolith-100" title={`${c.documented.name}, ${formatKm(c.documented.distance_km)} away. ${c.documented.source}`}>Documented analog nearby</span>
            ) : (
              <span className="rounded-xs px-1.5 py-px text-2xs text-world ring-1 ring-[var(--world)]" title="No site in RADIUM's reference list of documented analogs lies within 150 km">Not a documented analog</span>
            )}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
            {c.dimensions.filter((d) => d.weight > 0).map((d) => (
              <span key={d.id} className="inline-flex items-center gap-1 text-2xs text-regolith-400">
                {d.label}
                <GradeTile grade={d.grade} size="xs" />
              </span>
            ))}
          </span>
        </span>
      </button>
    </li>
  );
}

function DocumentedRow({ d, onClick }: { d: DocumentedSite; onClick: () => void }) {
  return (
    <li className="border-t border-[var(--hair)]">
      <button type="button" onClick={onClick} className="row-ctl grid w-full grid-cols-[32px_1fr] items-start gap-x-2.5 px-4 py-2 text-left">
        <GradeTile grade={d.analysed ? d.grade : null} />
        <span className="min-w-0">
          <span className="placename block text-md leading-tight text-regolith-50">{d.name}</span>
          <span className="block text-xs text-regolith-400">{d.country}. {d.theme}{d.for_this_body ? "" : " (documented for the other world)"}</span>
          {d.analysed && (d.strong.length > 0 || d.weak.length > 0) && (
            <span className="mt-0.5 block text-2xs leading-snug text-regolith-500">
              {d.strong.length > 0 && `Matches on ${d.strong.slice(0, 3).join(", ").toLowerCase()}.`} {d.weak.length > 0 && `Falls short on ${d.weak.slice(0, 2).join(", ").toLowerCase()}.`}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function Results() {
  const twin = useStore((s) => s.twin);
  const status = useStore((s) => s.twinStatus);
  const error = useStore((s) => s.twinError);
  const origin = useStore((s) => s.twinOrigin);
  const showOverlay = useStore((s) => s.showTwinOverlay);
  const { pickEarth, runTwin } = useStore.getState();
  const [tab, setTab] = useState<"best" | "documented">("best");

  if (!origin) {
    return (
      <div className="p-5">
        <h2 className="placename placename-lg text-regolith-50">Earth matches appear here</h2>
        <p className="mt-2 text-sm leading-relaxed text-regolith-300">Once you choose a Moon or Mars site, RADIUM lists the Earth cells that resemble it most, says why, and says where the resemblance fails.</p>
      </div>
    );
  }
  if (status === "error") {
    return <div className="p-4"><Notice tone="error" title="The comparison could not be computed" action={<Button size="sm" variant="outline" onClick={() => void runTwin()}>Try again</Button>}>{error}</Notice></div>;
  }
  if (!twin) return <div className="p-5"><Spinner label="Comparing with every land cell on Earth" /></div>;

  const dist = twin.distribution;
  const ab = dist.grades.A + dist.grades.B;
  return (
    <div aria-busy={status === "loading"} className={cx(status === "loading" && "opacity-70")}>
      <header className="px-4 pt-4 pb-3">
        <h2 className="text-md font-semibold text-regolith-50">Closest places on Earth</h2>
        <p className="mt-1 text-xs leading-relaxed text-regolith-400">
          {dist.cells.toLocaleString("en-US")} land cells compared. {ab.toLocaleString("en-US")} grade B or better{dist.grades.A ? `, ${dist.grades.A.toLocaleString("en-US")} of them A` : ""}. Listed matches are at least {twin.separation_km} km apart.
        </p>
        {!twin.purpose_applicable && twin.purpose_note && <div className="mt-2"><Notice tone="warn">{twin.purpose_note} The list below matches the other characteristics only.</Notice></div>}
        {twin.planet_coverage < 0.999 && (
          <div className="mt-2"><Notice tone="info">Only {pct(twin.planet_coverage)} of this comparison could be made: {twin.dimensions.filter((d) => !d.available).map((d) => d.label.toLowerCase()).join(", ")} has no data at the planetary site.</Notice></div>
        )}
        <div className="-mx-2 mt-2"><Switch checked={showOverlay} onChange={(v) => useStore.setState({ showTwinOverlay: v })} label="Colour all of Earth by match grade" /></div>
      </header>
      <div role="tablist" aria-label="Lists" className="hair-t flex gap-1 px-3 pt-2">
        {([["best", "Best matches"], ["documented", "Documented analog sites"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="ctl h-7 rounded-sm px-2.5 text-xs font-medium text-regolith-300">{label}</button>
        ))}
      </div>
      {tab === "best" ? (
        <>
          <ol className="mt-2">{twin.candidates.map((c) => <CandidateRow key={c.id} c={c} active={false} onClick={() => void pickEarth(c.lat, c.lon, true)} />)}</ol>
          <p className="hair-t px-4 py-3 text-2xs leading-relaxed text-regolith-500">
            Ranked by data alone. The list of documented analog sites is used only to label results and never changes a grade. Click anywhere on the map to grade a place of your own.
          </p>
        </>
      ) : (
        <>
          <p className="px-4 pt-2 pb-1 text-xs leading-relaxed text-regolith-400">How well-known analog sites score against this particular place and purpose. A famous site can be a poor match here and still be excellent for the process it is known for.</p>
          <ol>{twin.documented.map((d) => <DocumentedRow key={d.name} d={d} onClick={() => void pickEarth(d.lat, d.lon, true)} />)}</ol>
        </>
      )}
    </div>
  );
}

function DimensionRow({ d }: { d: DimDetail }) {
  const [open, setOpen] = useState(false);
  const unscored = d.weight === 0;
  return (
    <li className="border-t border-[var(--hair)] first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="row-ctl grid w-full grid-cols-[24px_1fr_auto] items-center gap-x-2.5 px-4 py-2 text-left">
        <GradeTile grade={d.grade} size="sm" muted={unscored} />
        <span className="min-w-0">
          <span className="block truncate text-sm text-regolith-100">{d.label}</span>
          <Meter value={d.score} grade={d.grade} className="mt-1" />
        </span>
        <span className="tnum text-xs text-regolith-400">{unscored ? "not weighted" : pct(d.weight)}</span>
      </button>
      {open && (
        <div className="anim-fade px-4 pb-3 pl-[50px] text-xs leading-relaxed text-regolith-300">
          {d.score === null && <p className="mb-1.5 text-alert">{d.note ?? "No data on one side, so this dimension is left out."}</p>}
          {d.pairs.length > 0 && (
            <table className="mb-2 w-full">
              <thead><tr className="text-left text-regolith-500"><th className="py-0.5 font-normal" /><th className="py-0.5 text-right font-normal">Planet</th><th className="py-0.5 pl-3 text-right font-normal">Earth</th></tr></thead>
              <tbody>
                {d.pairs.map((p) => (
                  <tr key={p.label} className="border-t border-[var(--hair)]">
                    <td className="py-1 pr-2 text-regolith-300">{p.label}{p.unit ? <span className="text-regolith-500"> ({p.unit})</span> : null}</td>
                    <td className="tnum py-1 text-right font-medium text-regolith-100">{p.planet_text ?? formatValue(p.planet, p.dec, p.fmt)}</td>
                    <td className="tnum py-1 pl-3 text-right font-medium text-regolith-100">{p.earth_text ?? formatValue(p.earth, p.dec, p.fmt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {d.note && d.score !== null && <p className="mb-1.5">{d.note}</p>}
          <p><span className="text-regolith-500">{d.comparable}. </span>{d.how}</p>
        </div>
      )}
    </li>
  );
}

function SideBySide({ planet, earth }: { planet: CellInfo; earth: CellInfo }) {
  const eIndex = new Map<string, Measure>();
  earth.groups.forEach((g) => g.items.forEach((m) => eIndex.set(m.id, m)));
  const pIds = new Set<string>();
  planet.groups.forEach((g) => g.items.forEach((m) => pIds.add(m.id)));
  const cats = [...new Set([...planet.groups.map((g) => g.id), ...earth.groups.map((g) => g.id)])];
  const label = (id: string) => planet.groups.find((g) => g.id === id)?.label ?? earth.groups.find((g) => g.id === id)?.label ?? id;
  const cellText = (m?: Measure) => (!m ? "—" : m.value === null ? "no data" : `${formatMeasure({ ...m, sigma: null })}${!m.text && m.unit && m.fmt !== "percent" ? ` ${m.unit}` : ""}`);
  return (
    <div className="px-4 pb-3">
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="text-left text-regolith-500">
            <th className="w-[42%] py-1 font-normal" />
            <th className="py-1 text-right font-medium text-regolith-300">{planet.body === "moon" ? "Moon" : "Mars"}</th>
            <th className="py-1 pl-2 text-right font-medium text-regolith-300">Earth</th>
          </tr>
        </thead>
        {cats.map((cid) => {
          const pg = planet.groups.find((g) => g.id === cid)?.items ?? [];
          const eg = (earth.groups.find((g) => g.id === cid)?.items ?? []).filter((m) => !pIds.has(m.id));
          return (
            <tbody key={cid}>
              <tr><td colSpan={3} className="pt-3 pb-1 text-xs font-semibold text-regolith-100">{label(cid)}</td></tr>
              {pg.map((m) => (
                <tr key={m.id} className="border-t border-[var(--hair)]">
                  <td className="py-1 pr-2 text-regolith-300">{m.label}</td>
                  <td className={cx("tnum py-1 text-right", m.value === null ? "text-regolith-500" : "text-regolith-100")}>{cellText(m)}</td>
                  <td className={cx("tnum py-1 pl-2 text-right", !eIndex.get(m.id) || eIndex.get(m.id)!.value === null ? "text-regolith-500" : "text-regolith-100")}>{cellText(eIndex.get(m.id))}</td>
                </tr>
              ))}
              {eg.map((m) => (
                <tr key={m.id} className="border-t border-[var(--hair)]">
                  <td className="py-1 pr-2 text-regolith-300">{m.label}</td>
                  <td className="py-1 text-right text-regolith-500">—</td>
                  <td className={cx("tnum py-1 pl-2 text-right", m.value === null ? "text-regolith-500" : "text-regolith-100")}>{cellText(m)}</td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
      <p className="mt-2 text-2xs leading-snug text-regolith-500">A dash means the quantity is not measured on that world in RADIUM. Values with the same name are measured the same way only for terrain; others share a definition but come from different instruments or models.</p>
    </div>
  );
}

function Comparison({ c }: { c: CompareResult }) {
  const meta = useStore((s) => s.meta)!;
  const { clearPick } = useStore.getState();
  const purpose = useStore((s) => s.purpose);
  const body = c.planet.body as Planet;
  const pLabel = meta.purposes[body].find((p) => p.id === purpose)?.label ?? purpose;
  const m = c.match;
  const better = c.rank_among ? c.rank_among.better_cells : null;
  const share = c.rank_among && c.rank_among.cells > 0 ? (c.rank_among.better_cells / c.rank_among.cells) * 100 : null;

  return (
    <div className="anim-rise">
      <div className="px-2 pt-2">
        <Button size="sm" onClick={clearPick}><ArrowLeft size={13} /> All matches</Button>
      </div>
      <header className="px-4 pt-2 pb-3">
        <h2 className="placename placename-lg text-regolith-50 [overflow-wrap:anywhere]">{c.earth.place.label}</h2>
        <div className="tnum mt-1 text-sm text-regolith-300">{c.earth.coords}</div>
        {!c.earth.analysed && <div className="mt-2"><Notice tone="warn">This cell is mostly water, so it is not an analog candidate.</Notice></div>}
      </header>

      <section className="hair-t px-4 py-4">
        <div className="flex items-center gap-3.5">
          <GradeTile grade={m.grade} size="xl" />
          <div className="min-w-0">
            <div className="text-xs text-regolith-400">{pLabel}</div>
            <div className="text-lg leading-tight font-semibold text-regolith-50">{m.grade ? `${GRADE_MEANING[m.grade]} analog` : "Cannot be graded"}</div>
            <div className="mt-0.5 text-xs leading-snug text-regolith-400">
              of <span className="placename text-sm text-regolith-200">{c.planet.place.label}</span>
            </div>
          </div>
        </div>
        {c.why && <p className="mt-3 text-sm leading-relaxed text-regolith-200">{c.why}</p>}
        <p className="mt-1.5 text-xs leading-snug text-regolith-400">
          {better !== null && share !== null && c.rank_among &&
            (better === 0
              ? "No land cell on Earth matches better. "
              : better < 50
                ? `Only ${better} of ${c.rank_among.cells.toLocaleString("en-US")} land cells match${better === 1 ? "es" : ""} better. `
                : `${better.toLocaleString("en-US")} land cells match better, placing it in the top ${share < 1 ? share.toFixed(1) : share.toFixed(0)}%. `)}
          {m.coverage < 0.999 ? `Graded on ${pct(m.coverage)} of the comparison; ${m.missing.join(", ").toLowerCase()} has no data.` : "Every weighted dimension had data."}
        </p>
        <div className="mt-3 rounded-sm bg-basalt-800 px-3 py-2 text-xs leading-snug text-regolith-300">
          {c.documented ? (
            <><span className="font-semibold text-regolith-50">{c.documented.name}</span> is {formatKm(c.documented.distance_km)} away, a documented analog site ({c.documented.theme.toLowerCase()}). <span className="text-regolith-500">{c.documented.source}</span></>
          ) : (
            <><span className="font-semibold text-regolith-50">Not a documented analog site.</span> Nothing in RADIUM's reference list of {useStore.getState().pins.earth.length} published analog sites lies within 150 km. This match comes from the data alone and would need fieldwork to confirm.</>
          )}
        </div>
      </section>

      <Section title="Photographs of both places">
        <div className="px-4 pt-0.5 pb-2 text-xs text-regolith-400">On {body === "moon" ? "the Moon" : "Mars"}, <span className="placename text-sm text-regolith-100">{c.planet.place.label}</span></div>
        <Photos compact id={`twin-${photoKey(c.planet)}`} load={() => photosFor(c.planet)} />
        <div className="hair-t px-4 pt-3 pb-2 text-xs text-regolith-400">On Earth, <span className="placename text-sm text-regolith-100">{c.earth.place.label}</span></div>
        <Photos compact id={`twin-${photoKey(c.earth)}`} load={() => photosFor(c.earth)} />
      </Section>

      <Section title="How it matches" count={`${m.dimensions.filter((d) => d.score !== null && d.weight > 0).length} scored`}>
        <ul>{m.dimensions.map((d) => <DimensionRow key={d.id} d={d} />)}</ul>
        <div className="grid grid-cols-2 gap-3 px-4 pt-2 pb-3 text-xs">
          <div><div className="mb-1 font-medium text-regolith-100">Strong matches</div>{m.strong.length ? <ul className="space-y-0.5 text-regolith-300">{m.strong.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="text-regolith-500">None above grade B.</p>}</div>
          <div><div className="mb-1 font-medium text-regolith-100">Weak matches</div>{m.weak.length ? <ul className="space-y-0.5 text-regolith-300">{m.weak.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="text-regolith-500">None below grade C.</p>}</div>
        </div>
      </Section>

      <Section title="What it could be used for">
        <ul className="pb-2">
          {m.fitness.map((f) => (
            <li key={f.id} className="grid grid-cols-[24px_1fr] items-start gap-x-2.5 border-t border-[var(--hair)] px-4 py-2 first:border-t-0">
              <GradeTile grade={f.applicable ? f.grade : null} size="sm" title={f.applicable ? undefined : "Not applicable"} />
              <span className="min-w-0">
                <span className="block text-sm text-regolith-100">{f.label}</span>
                <span className="block text-xs leading-snug text-regolith-400">{f.applicable ? (f.grade ? `${GRADE_MEANING[f.grade]} for ${f.use}.` : "Too little data to judge.") : f.note}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="px-4 pb-3 text-2xs leading-snug text-regolith-500">The same place is graded once per purpose, because each purpose weights the comparison differently.</p>
      </Section>

      <Section title="Where the analogy breaks down">
        <ul className="pb-2">
          {m.breaks_down.map((b) => (
            <li key={b.label} className="border-t border-[var(--hair)] px-4 py-2 first:border-t-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-regolith-100">{b.label}</span>
                <span className="tnum shrink-0 text-xs text-regolith-300">{b.planet} <span className="text-regolith-500">vs</span> {b.earth}</span>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-regolith-400">{b.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Measurements side by side" defaultOpen={false}>
        <SideBySide planet={c.planet} earth={c.earth} />
      </Section>
    </div>
  );
}

/* -------------------------------------------------------------------- view */
export function TwinView() {
  const meta = useStore((s) => s.meta)!;
  const origin = useStore((s) => s.twinOrigin);
  const twin = useStore((s) => s.twin);
  const purpose = useStore((s) => s.purpose);
  const picked = useStore((s) => s.picked);
  const compare = useStore((s) => s.compare);
  const compareStatus = useStore((s) => s.compareStatus);
  const compareError = useStore((s) => s.compareError);
  const showOverlay = useStore((s) => s.showTwinOverlay);
  const focus = useStore((s) => s.focus);
  const earthPins = useStore((s) => s.pins.earth);
  const earthLayers = useStore((s) => s.layers.earth);
  const { pickEarth } = useStore.getState();
  const handle = useRef<GlobeHandle>(null);
  const tapes = useRef<TapesHandle>(null);

  const basemap = meta.layers.earth.tiles.find((b) => b.id === earthLayers.base) ?? meta.layers.earth.tiles[0];
  const url = origin && showOverlay ? overlay.twin(origin.body, origin.lat, origin.lon, purpose) : null;
  const markers: SiteMarker[] = useMemo(
    () => (twin?.candidates ?? []).map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, text: String(c.rank), grade: c.grade, active: !!picked && Math.abs(picked.lat - c.lat) < 0.13 && Math.abs(picked.lon - c.lon) < 0.13 })),
    [twin, picked],
  );
  const sel = useMemo(() => {
    if (compare) return { lat: compare.earth.cell.lat, lon: compare.earth.cell.lon, outline: compare.earth.cell.outline };
    return picked ? { lat: picked.lat, lon: picked.lon } : null;
  }, [compare, picked]);
  const onPick = useCallback((lat: number, lon: number) => { if (useStore.getState().twinOrigin) void pickEarth(lat, lon); }, [pickEarth]);
  const onView = useCallback((v: ViewState) => tapes.current?.draw(v), []);

  return (
    <>
      <Origin />
      <div className="relative h-full min-w-0 flex-1 overflow-hidden bg-void">
        <EarthMap ref={handle} basemap={basemap} labels={earthLayers.labels} overlayUrl={url} opacity={0.8} dimBase={!!url} pins={earthPins} markers={markers} selection={sel} focus={focus} onPick={onPick} onView={onView} />
        <Tapes ref={tapes} />
        <div className="surface-float absolute top-3 right-3 z-20 flex flex-col rounded-md ring-1 ring-[var(--hair)]">
          <IconButton label="Zoom in" onClick={() => handle.current?.zoom(0.5)}><Plus size={16} /></IconButton>
          <IconButton label="Zoom out" onClick={() => handle.current?.zoom(2)}><Minus size={16} /></IconButton>
          <IconButton label="Reset the view" onClick={() => handle.current?.home()}><Home size={15} /></IconButton>
        </div>
        {origin && (
          <div className="pointer-events-none absolute bottom-11 left-[72px] z-20">
            <div className="surface-float anim-rise pointer-events-auto w-[272px] rounded-md p-3 ring-1 ring-[var(--hair)]">
              <div className="text-sm leading-tight font-semibold text-regolith-50">Match to the selected {origin.body === "moon" ? "Moon" : "Mars"} site</div>
              <div className="mt-0.5 mb-2 text-2xs leading-snug text-regolith-300">{showOverlay ? "Every land cell, graded." : "Map colouring is off."} Numbered markers are the best matches; diamonds are documented analog sites.</div>
              <GradeLegend note="Clear cells are water or lack the data to compare." />
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute right-3 bottom-9 z-20 max-w-[54%] text-right text-[10px] leading-tight text-regolith-400 [text-shadow:0_1px_2px_#000]">{basemap.attribution}. {LABEL_ATTRIBUTION}.</div>
      </div>
      <aside className="surface hair-l scroll z-20 h-full w-[420px] shrink-0 max-xl:w-[372px] max-lg:absolute max-lg:top-0 max-lg:right-0 max-lg:bottom-0 max-lg:shadow-[var(--shadow-float)] max-sm:top-auto max-sm:h-[58%] max-sm:w-full" aria-label="Earth matches">
        {picked ? (
          compareStatus === "error" ? (
            <div className="p-4"><Notice tone="error" title="This place could not be compared" action={<Button size="sm" variant="outline" onClick={() => void pickEarth(picked.lat, picked.lon)}>Try again</Button>}>{compareError}</Notice></div>
          ) : compare ? (
            <div className={cx(compareStatus === "loading" && "opacity-70")}><Comparison c={compare} /></div>
          ) : (
            <div className="p-5"><Spinner label="Comparing the two places" /></div>
          )
        ) : (
          <Results />
        )}
      </aside>
    </>
  );
}
