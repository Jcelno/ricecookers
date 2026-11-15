import { ArrowDown, ArrowUp, Bookmark, Check, Columns2, Download, Printer, RotateCcw, Sparkle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, cx, GradeTile, Notice, Section, Segmented, Spinner, Switch } from "@/components/ui/primitives";
import { downloadCsv } from "@/lib/csv";
import { GRADE_MEANING, pct, plural } from "@/lib/format";
import type { Grade, Mission, SiteCard } from "@/lib/types";
import { shares, useStore } from "@/store";

function MissionPicker({ missions, value, onChange }: { missions: Mission[]; value: string; onChange: (id: string) => void }) {
  const cur = missions.find((m) => m.id === value);
  return (
    <div>
      <div role="radiogroup" aria-label="Mission" className="grid grid-cols-3 gap-1 rounded-md bg-basalt-950/70 p-0.5 ring-1 ring-[var(--hair)]">
        {missions.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={m.id === value} aria-selected={m.id === value} onClick={() => onChange(m.id)} title={m.summary}
            className="ctl rounded-sm px-1.5 py-1.5 text-center text-xs leading-tight font-medium text-regolith-300">
            {m.label.replace("Lunar permanent base", "Lunar base").replace(" landing", "").replace(" exploration", "")}
          </button>
        ))}
      </div>
      {cur && (
        <p className="mt-2 text-xs leading-snug text-regolith-300">
          <span className="font-semibold text-regolith-50">{cur.label}.</span> {cur.summary}
        </p>
      )}
    </div>
  );
}

const STEPS = ["Destination", "Mission", "Priorities", "Candidates", "Save"];

function Movement({ s }: { s: SiteCard }) {
  if (s.prev_rank === undefined) return null;
  if (s.prev_rank === null) return <span className="inline-flex items-center gap-0.5 text-2xs font-medium text-world"><Sparkle size={10} />new</span>;
  const d = s.prev_rank - s.rank;
  if (d === 0) return <span className="text-2xs text-regolith-500">no change</span>;
  return (
    <span className={cx("tnum inline-flex items-center gap-0.5 text-2xs font-medium", d > 0 ? "text-grade-a" : "text-grade-d")}>
      {d > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {Math.abs(d)}
    </span>
  );
}

export function MissionPanel() {
  const meta = useStore((s) => s.meta)!;
  const missionId = useStore((s) => s.missionId);
  const raw = useStore((s) => s.rawWeights[s.missionId]) ?? {};
  const limitsOn = useStore((s) => s.limitsOn[s.missionId]) ?? [];
  const rank = useStore((s) => s.rank);
  const status = useStore((s) => s.rankStatus);
  const error = useStore((s) => s.rankError);
  const cell = useStore((s) => s.cell);
  const showSuitability = useStore((s) => s.showSuitability);
  const { setMission, setWeight, resetWeights, toggleLimit, runRank, refreshCell, select } = useStore.getState();

  const mission = meta.missions.find((m) => m.id === missionId)!;
  const share = shares(raw);
  const timer = useRef<number | undefined>(undefined);
  const [compare, setCompare] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const saved = useStore((s) => s.saved);
  const compareList = useStore((s) => s.compareList);

  useEffect(() => setCompare([]), [missionId]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onSlide = (id: string, v: number) => {
    setWeight(id, v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void runRank();
      void refreshCell();
    }, 220);
  };

  const isDefault = mission.criteria.every((c) => raw[c.id] === Math.round(c.weight * 100)) && mission.limits.every((l) => limitsOn.includes(l.id));
  const sites = rank && rank.mission === missionId ? rank.sites : [];
  const stats = rank && rank.mission === missionId ? rank.stats : null;
  const eligible = stats ? stats.graded - stats.excluded : 0;
  const good = stats ? stats.grades.A + stats.grades.B : 0;
  const chosen = sites.filter((s) => compare.includes(s.id));
  const destination = cell && cell.body === mission.body ? cell : null;
  const pickable = [...compareList, ...saved.sites].filter((p, k, a) => p.body === mission.body && a.findIndex((q) => q.lat === p.lat && q.lon === p.lon) === k).slice(0, 6);
  useEffect(() => { setName(`${mission.label}${destination ? `, ${destination.place.label}` : ""}`); setSavedNote(null); }, [missionId, destination?.cell.lat]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportCsv = () => downloadCsv(`radium-${missionId}-candidates.csv`,
    ["rank", "place", "lat", "lon", "suitability_score", "grade", "coverage", ...mission.criteria.map((c) => `${c.id}_grade`), ...mission.criteria.map((c) => `${c.id}_weight_share`)],
    sites.map((x) => [x.rank, x.place, x.lat, x.lon, x.score, x.grade, x.coverage, ...mission.criteria.map((c) => x.factors.find((f) => f.id === c.id)?.grade ?? null), ...mission.criteria.map((c) => share[c.id] ?? 0)]),
    [`RADIUM preliminary candidates for ${mission.label}. Hard limits on: ${limitsOn.join(", ") || "none"}.`, "Suitability is RADIUM's own 0-1 scale from public data at 2-30 km resolution; not a landing or construction certification."]);

  return (
    <div>
      <header className="px-4 pt-4 pb-2">
        <h2 className="text-md font-semibold text-regolith-50">Mission Planner</h2>
        <p className="mt-1 text-xs leading-relaxed text-regolith-400">Five steps from a destination to a saved, exportable plan. Grades here are site suitability for the mission, not Earth analog similarity, and not a certification.</p>
        <ol className="mt-3 grid grid-cols-5 gap-1" aria-label="Steps">
          {STEPS.map((t, k) => (
            <li key={t}>
              <button type="button" onClick={() => setStep(k)} aria-current={step === k ? "step" : undefined}
                className={cx("ctl flex w-full flex-col items-center gap-1 rounded-sm px-0.5 py-1 text-[10px] leading-tight", step === k ? "text-regolith-50" : "text-regolith-400")}>
                <span className={cx("grid size-5 place-items-center rounded-full text-[10px] font-bold ring-1", step === k ? "bg-world text-world-ink ring-transparent" : k < step ? "ring-[var(--world)] text-world" : "ring-[var(--hair-strong)]")}>{k < step ? <Check size={11} /> : k + 1}</span>
                {t}
              </button>
            </li>
          ))}
        </ol>
      </header>

      {step === 0 && (
        <Section title="1. Choose a destination">
          <div className="px-4 pb-3">
            <Segmented label="World" value={mission.body} onChange={(b) => { const m = meta.missions.find((x) => x.body === b); if (m) setMission(m.id); }} options={[{ value: "moon", label: "Moon" }, { value: "mars", label: "Mars" }]} />
            <div className="mt-3 rounded-md bg-basalt-800 px-3 py-2.5 text-sm">
              {destination ? (
                <>
                  <div className="text-2xs text-regolith-400">Selected site</div>
                  <div className="placename text-md text-regolith-50">{destination.place.label}</div>
                  <div className="tnum text-2xs text-regolith-400">{destination.coords}</div>
                  {destination.suitability && <div className="mt-1.5 flex items-center gap-2 text-xs text-regolith-200"><GradeTile grade={destination.suitability.excluded ? null : destination.suitability.grade} size="sm" />{destination.suitability.excluded ? "Ruled out by a hard limit" : destination.suitability.grade ? `${GRADE_MEANING[destination.suitability.grade]} for ${mission.label.toLowerCase()}` : "Not enough data to grade"}</div>}
                </>
              ) : <p className="text-xs leading-snug text-regolith-300">Click the globe to choose a site, or pick one below. You can also plan without a site: step 4 lists the best candidates.</p>}
            </div>
            {pickable.length > 0 && (
              <>
                <div className="mt-3 text-2xs text-regolith-400">From Compare and your saved places</div>
                <ul className="mt-1">{pickable.map((p) => (
                  <li key={`${p.lat}${p.lon}`}><button type="button" className="row-ctl -mx-2 block w-[calc(100%+16px)] rounded-sm px-2 py-1.5 text-left" onClick={() => void select(p.body, p.lat, p.lon, { fly: true, spanKm: 500 })}>
                    <span className="placename block truncate text-md text-regolith-50">{p.label}</span><span className="tnum text-2xs text-regolith-400">{p.lat.toFixed(2)}, {p.lon.toFixed(2)}</span>
                  </button></li>
                ))}</ul>
              </>
            )}
            <Button size="sm" variant="solid" className="mt-3" onClick={() => setStep(1)}>Next: mission type</Button>
          </div>
        </Section>
      )}

      {step === 1 && (
        <Section title="2. Choose a mission type">
          <div className="px-4 pb-3">
            <MissionPicker missions={meta.missions.filter((m) => m.body === mission.body)} value={missionId} onChange={setMission} />
            <p className="mt-2 text-2xs leading-snug text-regolith-500">RADIUM has {meta.missions.length} mission models: a permanent lunar base, a robotic Mars landing and a crewed Mars mission. For a rover campaign or science outpost, start from the closest model and adjust the priorities in the next step.</p>
            <Button size="sm" variant="solid" className="mt-3" onClick={() => setStep(2)}>Next: priorities</Button>
          </div>
        </Section>
      )}

      {step === 2 && (<>
      <Section title="3. Set priorities" aside={
        <button type="button" disabled={isDefault} onClick={resetWeights} className="ctl mr-3 inline-flex h-6 items-center gap-1 rounded-sm px-2 text-xs text-regolith-300" title="Return sliders and limits to this mission's defaults">
          <RotateCcw size={11} /> Reset
        </button>
      }>
        <ul className="px-4 pb-3">
          {mission.criteria.map((c) => {
            const v = raw[c.id] ?? 0;
            return (
              <li key={c.id} className="py-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={`w-${c.id}`} className="text-sm text-regolith-100" title={c.rule}>{c.label}</label>
                  <span className="tnum text-xs text-regolith-300" title="Share of the overall grade after all sliders are rescaled to 100%">{pct(share[c.id] ?? 0)}</span>
                </div>
                <input
                  id={`w-${c.id}`} type="range" min={0} max={100} step={1} value={v} className="slider"
                  style={{ ["--fill" as string]: `${v}%` }}
                  onChange={(e) => onSlide(c.id, Number(e.target.value))}
                  aria-valuetext={`${pct(share[c.id] ?? 0)} of the grade`}
                />
                <p className="text-2xs leading-snug text-regolith-500">{c.question}</p>
              </li>
            );
          })}
          <li className="pt-1 text-2xs leading-snug text-regolith-500">Shares always add up to 100%: raising one criterion lowers the rest in proportion.</li>
        </ul>
      </Section>

      <Section title="Hard limits" count={`${limitsOn.length} of ${mission.limits.length} on`} defaultOpen={false}>
        <div className="px-2 pb-3">
          {mission.limits.map((l) => (
            <Switch key={l.id} checked={limitsOn.includes(l.id)} onChange={() => toggleLimit(l.id)} label={l.label} hint={`${l.rule} ${l.why}`} />
          ))}
          <p className="px-2 pt-1 text-2xs leading-snug text-regolith-500">Limits rule a cell out whatever its grade. They are screening values chosen by RADIUM, not agency requirements.</p>
        </div>
      </Section>
      <div className="px-4 pb-3"><Button size="sm" variant="solid" onClick={() => setStep(3)}>Next: candidate sites</Button></div>
      </>)}

      {step === 3 && (
      <Section title="4. Compare candidate sites" aside={status === "loading" ? <span className="mr-4"><Spinner /></span> : undefined}>
        <div className="px-2 pb-1">
          <Switch checked={showSuitability} onChange={(v) => useStore.setState({ showSuitability: v })} label="Colour the globe by grade" />
        </div>
        {error && (
          <div className="px-4 pb-3">
            <Notice tone="error" title="The ranking could not be computed" action={<Button size="sm" variant="outline" onClick={() => void runRank()}>Try again</Button>}>{error}</Notice>
          </div>
        )}
        {rank?.change?.summary && (
          <div className="anim-rise px-4 pb-3"><Notice title="What changed">{rank.change.summary}</Notice></div>
        )}
        {stats && (
          <p className="px-4 pb-2 text-xs leading-snug text-regolith-400">
            {plural(eligible, "cell")} graded, {plural(stats.excluded, "cell")} ruled out by limits. {eligible > 0 ? `${((good / eligible) * 100).toFixed(good / eligible < 0.1 ? 1 : 0)}% grade B or better.` : ""} Sites below are at least{" "}
            {mission.body === "moon" ? "25 km" : "400 km"} apart so the list shows different places.
          </p>
        )}
        <ol>
          {sites.map((s) => {
            const active = !!cell && Math.abs(cell.cell.lat - s.lat) < 1e-6 && Math.abs(cell.cell.lon - s.lon) < 1e-6;
            return (
              <li key={s.id} className="border-t border-[var(--hair)]">
                <div className="flex">
                  <button
                    type="button" aria-current={active}
                    onClick={() => void select(mission.body, s.lat, s.lon, { fly: true, spanKm: Math.max(s.cell_km[0] * 60, 260) })}
                    className="row-ctl grid min-w-0 flex-1 grid-cols-[18px_32px_1fr] items-center gap-x-2.5 py-2 pr-1 pl-4 text-left"
                  >
                    <span className="tnum text-right text-xs text-regolith-400">{s.rank}</span>
                    <GradeTile grade={s.grade} />
                    <span className="min-w-0">
                      <span className="placename block truncate text-md text-regolith-50">{s.place}</span>
                      <span className="flex items-center gap-2">
                        <span className="tnum text-xs text-regolith-400">{s.coords}</span>
                        <Movement s={s} />
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                        {s.factors.map((f) => (
                          <span key={f.id} className="inline-flex items-center gap-1 text-2xs text-regolith-400" title={`${f.label}: ${f.grade ? GRADE_MEANING[f.grade as Grade] : "no data"}`}>
                            {f.short}
                            <GradeTile grade={f.grade} size="xs" />
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                  <label className="row-ctl flex w-10 shrink-0 cursor-pointer items-center justify-center" title={compare.includes(s.id) ? "Remove from comparison" : compare.length >= 3 ? "Compare up to three sites" : "Add to comparison"}>
                    <input
                      type="checkbox" className="focusable size-3.5 accent-[var(--world)]" checked={compare.includes(s.id)} disabled={!compare.includes(s.id) && compare.length >= 3}
                      onChange={(e) => setCompare((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))}
                      aria-label={`Compare ${s.place}`}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
        {status === "ready" && sites.length === 0 && (
          <div className="px-4 py-3"><Notice tone="warn" title="No site passes">Every cell is ruled out by the limits that are switched on. Turn a limit off to see candidates.</Notice></div>
        )}
        {chosen.length >= 2 && (
          <div className="anim-rise border-t border-[var(--hair)] px-4 py-3">
            <div className="mb-2 text-sm font-semibold text-regolith-50">Side by side</div>
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr className="text-left text-regolith-400">
                  <th className="w-[34%] py-1 font-normal" />
                  {chosen.map((s) => <th key={s.id} className="py-1 pr-1 font-medium text-regolith-200"><span className="placename block truncate text-sm">#{s.rank} {s.place}</span></th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--hair)]">
                  <td className="py-1.5 text-regolith-300">Overall</td>
                  {chosen.map((s) => <td key={s.id} className="py-1.5"><GradeTile grade={s.grade} size="sm" /></td>)}
                </tr>
                {mission.criteria.map((c) => (
                  <tr key={c.id} className="border-t border-[var(--hair)]">
                    <td className="py-1.5 pr-2 text-regolith-300">{c.label}</td>
                    {chosen.map((s) => <td key={s.id} className="py-1.5"><GradeTile grade={s.factors.find((f) => f.id === c.id)?.grade ?? null} size="xs" /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 px-4 pt-2">
          <Button size="sm" variant="outline" disabled={!chosen.length} onClick={() => { const st = useStore.getState(); chosen.forEach((x) => st.addCompare({ body: mission.body, lat: x.lat, lon: x.lon, label: x.place })); st.setMode("compare"); }}><Columns2 size={13} /> Open ticked sites in Compare</Button>
          <Button size="sm" variant="outline" onClick={() => useStore.getState().setSheet("scenarios")}><Columns2 size={13} /> Compare two scenarios</Button>
        </div>
        <p className="hair-t mt-3 px-4 py-3 text-2xs leading-relaxed text-regolith-500">
          Grades are RADIUM's exploratory assessment from public data at 2 to 30 km resolution. They are a way to compare options, not a landing-site certification. Tick sites to compare them; select one for its full analysis.
        </p>
        <div className="px-4 pb-3"><Button size="sm" variant="solid" onClick={() => setStep(4)}>Next: save or export</Button></div>
      </Section>
      )}

      {step === 4 && (
        <Section title="5. Save or export">
          <div className="px-4 pb-4">
            <p className="text-xs leading-snug text-regolith-300">Keep this plan in this browser, download the candidate list, or print a preliminary report with the criteria, candidates, sources and limits.</p>
            <label className="mt-3 block text-2xs text-regolith-400">Plan name<input value={name} onChange={(e) => setName(e.target.value)} className="field mt-0.5" /></label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="solid" onClick={() => { useStore.getState().saveMission(name.trim() || mission.label); setSavedNote("Saved. Find it under Saved in the top bar."); }}><Bookmark size={13} /> Save plan</Button>
              <Button size="sm" variant="outline" disabled={!sites.length} onClick={exportCsv}><Download size={13} /> Candidates CSV</Button>
              <Button size="sm" variant="outline" onClick={() => useStore.getState().setSheet("report")}><Printer size={13} /> Printable report</Button>
            </div>
            {savedNote && <p className="mt-2 text-2xs text-grade-b" role="status">{savedNote}</p>}
          </div>
        </Section>
      )}
    </div>
  );
}
