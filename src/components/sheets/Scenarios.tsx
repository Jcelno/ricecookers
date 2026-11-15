import { Copy, Link2, RotateCcw, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { Button, GradeTile, IconButton, Notice, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { currentLink } from "@/lib/deeplink";
import { pct } from "@/lib/format";
import type { Mission, Probe, RankResult, SiteCard } from "@/lib/types";
import { shares, useStore } from "@/store";

type Scn = { weights: Record<string, number>; limits: string[] };
type Result = { rank: RankResult; probes: Map<string, Probe> };
const N = 10;

function Editor({ name, mission, scn, onChange, onReset, extra }: { name: string; mission: Mission; scn: Scn; onChange: (s: Scn) => void; onReset: () => void; extra?: React.ReactNode }) {
  const sh = shares(scn.weights);
  return (
    <section className="rounded-md bg-basalt-800/60 p-3 ring-1 ring-[var(--hair)]">
      <div className="flex items-center gap-2">
        <h3 className="font-serif text-lg font-medium whitespace-nowrap tracking-[-0.02em] text-regolith-50">Scenario {name}</h3>
        <div className="ml-auto flex gap-1">{extra}<Button size="sm" onClick={onReset}><RotateCcw size={12} /> Defaults</Button></div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {mission.criteria.map((c) => (
          <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5">
            <label htmlFor={`${name}-${c.id}`} className="truncate text-xs text-regolith-200">{c.label}</label>
            <span className="tnum text-right text-xs text-regolith-300">{pct(sh[c.id] ?? 0)}</span>
            <input id={`${name}-${c.id}`} type="range" min={0} max={100} step={1} value={scn.weights[c.id] ?? 0} className="slider col-span-2"
              onChange={(e) => onChange({ ...scn, weights: { ...scn.weights, [c.id]: Number(e.target.value) } })} aria-label={`${c.label}, scenario ${name}`} />
          </li>
        ))}
      </ul>
      {mission.limits.length > 0 && (
        <fieldset className="mt-3">
          <legend className="text-2xs text-regolith-400">Hard limits</legend>
          {mission.limits.map((l) => (
            <label key={l.id} className="mt-1 flex items-start gap-2 text-xs text-regolith-200">
              <input type="checkbox" className="mt-0.5 accent-[var(--world)]" checked={scn.limits.includes(l.id)}
                onChange={(e) => onChange({ ...scn, limits: e.target.checked ? [...scn.limits, l.id] : scn.limits.filter((x) => x !== l.id) })} />
              {l.label}
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}

function Cell({ site, probe, mission }: { site?: SiteCard; probe?: Probe; mission: Mission }) {
  if (site) return <span className="flex items-center gap-1.5"><GradeTile grade={site.grade} size="xs" /><span className="tnum text-regolith-100">#{site.rank}</span></span>;
  if (!probe) return <span className="text-regolith-500">–</span>;
  if (probe.excluded) {
    const labels = probe.failed_limits.map((id) => mission.limits.find((l) => l.id === id)?.label ?? id);
    return <span className="text-alert" title={labels.join("; ")}>Excluded by limit</span>;
  }
  if (probe.grade === null) return <span className="text-regolith-400">Not graded</span>;
  return <span className="flex items-center gap-1.5"><GradeTile grade={probe.grade} size="xs" /><span className="text-regolith-400">below top {N}</span></span>;
}

export default function Scenarios({ onClose }: { onClose: () => void }) {
  const meta = useStore((s) => s.meta)!;
  const missionId = useStore((s) => s.missionId);
  const mission = meta.missions.find((m) => m.id === missionId)!;
  const defaults: Scn = { weights: Object.fromEntries(mission.criteria.map((c) => [c.id, Math.round(c.weight * 100)])), limits: mission.limits.map((l) => l.id) };
  const a: Scn = { weights: useStore((s) => s.rawWeights[missionId]) ?? defaults.weights, limits: useStore((s) => s.limitsOn[missionId]) ?? defaults.limits };
  const bState = useStore((s) => s.scenarioB);
  const b: Scn = bState && bState.mission === missionId ? bState : { ...a, weights: { ...a.weights }, limits: [...a.limits] };
  const setA = (s: Scn) => useStore.setState((st) => ({ rawWeights: { ...st.rawWeights, [missionId]: s.weights }, limitsOn: { ...st.limitsOn, [missionId]: s.limits } }));
  const setB = (s: Scn) => useStore.setState({ scenarioB: { mission: missionId, ...s } });
  const [res, setRes] = useState<{ a: Result; b: Result } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!bState || bState.mission !== missionId) setB(b); }, [missionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = JSON.stringify([missionId, a, b]);
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const run = (s: Scn, probe?: { lat: number; lon: number }[]) => api.rank({ mission: missionId, weights: s.weights, limits: s.limits, n: N, probe }, ac.signal);
        const [ra, rb] = await Promise.all([run(a), run(b)]);
        const union = [...ra.sites, ...rb.sites].map((x) => ({ lat: x.lat, lon: x.lon }));
        const [pa, pb] = await Promise.all([run(a, union), run(b, union)]);
        const idx = (r: RankResult) => new Map((r.probes ?? []).map((p) => [p.id, p]));
        setRes({ a: { rank: ra, probes: idx(pa) }, b: { rank: rb, probes: idx(pb) } });
        setErr(null);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setErr((e as Error).message);
      } finally { setBusy(false); }
    }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  const identical = JSON.stringify([a.weights, [...a.limits].sort()]) === JSON.stringify([b.weights, [...b.limits].sort()]);
  const rows = useMemo(() => {
    if (!res) return [];
    const ids: string[] = [];
    for (const s of [...res.a.rank.sites, ...res.b.rank.sites]) if (!ids.includes(s.id)) ids.push(s.id);
    const wa = shares(a.weights), wb = shares(b.weights);
    return ids.map((id) => {
      const sa = res.a.rank.sites.find((x) => x.id === id);
      const sb = res.b.rank.sites.find((x) => x.id === id);
      const card = (sa ?? sb)!;
      const pa = res.a.probes.get(id), pb = res.b.probes.get(id);
      // Why the score moved: each criterion's contribution under B minus under A (value × weight share).
      const effects = card.factors.filter((f) => f.value !== null).map((f) => ({ label: f.label, d: (wb[f.id] - wa[f.id]) * (f.value as number) }))
        .filter((x) => Math.abs(x.d) >= 0.005).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 2);
      const delta = pa?.score !== null && pa?.score !== undefined && pb?.score !== null && pb?.score !== undefined && !pa.excluded && !pb.excluded ? pb.score - pa.score : null;
      return { id, card, sa, sb, pa, pb, effects, delta };
    });
  }, [res, a.weights, b.weights]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(currentLink()); setCopied("Link copied"); } catch { setCopied("Copy failed"); }
    setTimeout(() => setCopied(null), 2200);
  };

  return (
    <div className="anim-fade fixed inset-0 z-50 flex justify-center bg-black/70 p-0 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Compare mission scenarios" className="anim-sheet surface flex h-full w-full max-w-[1180px] flex-col rounded-none shadow-[var(--shadow-float)] outline-none sm:rounded-lg">
        <header className="hair-b flex flex-wrap items-center gap-2 px-5 py-3">
          <div className="min-w-0">
            <h2 className="font-serif text-[1.6rem] leading-tight font-medium tracking-[-0.03em] text-regolith-50">Compare scenarios</h2>
            <p className="text-xs text-regolith-400">{mission.label}. Both scenarios use the same model and grade thresholds; only the priorities and limits differ. Scenario A is the Mission Planner's current setting.</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {busy && <Spinner />}
            <Button size="sm" variant="outline" onClick={() => void copy()}><Link2 size={13} /> {copied ?? "Copy link"}</Button>
            <IconButton label="Close" onClick={onClose}><X size={17} /></IconButton>
          </div>
        </header>
        <div className="scroll grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[300px_1fr_300px]">
          <Editor name="A" mission={mission} scn={a} onChange={setA} onReset={() => setA(defaults)} />
          <section className="min-w-0 max-lg:order-last">
            {err ? <Notice tone="error" title="Ranking failed">{err}</Notice> : !res ? <Spinner label="Ranking both scenarios" /> : (
              <>
                <p className="mb-2 text-sm leading-snug text-regolith-200">
                  {identical ? "The two scenarios are identical, so their rankings match exactly." : `Top ${N} sites under each scenario. ${rows.filter((r) => r.sa && r.sb && r.sa.rank !== r.sb.rank).length} change rank, ${rows.filter((r) => !r.sa || !r.sb).length} appear in only one list.`}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] table-fixed text-xs">
                    <colgroup><col className="w-[30%]" /><col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[11%]" /><col /></colgroup>
                    <thead><tr className="text-left text-regolith-400"><th className="py-1.5 pr-2 font-medium">Site</th><th className="py-1.5 pr-2 font-medium">A</th><th className="py-1.5 pr-2 font-medium">B</th><th className="py-1.5 pr-2 font-medium">Score change</th><th className="py-1.5 font-medium">Why</th></tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t border-[var(--hair)] align-top">
                          <td className="py-1.5 pr-2"><span className="placename block text-sm text-regolith-50">{r.card.place}</span><span className="tnum text-2xs text-regolith-400">{r.card.coords}</span></td>
                          <td className="py-1.5 pr-2"><Cell site={r.sa} probe={r.pa} mission={mission} /></td>
                          <td className="py-1.5 pr-2"><Cell site={r.sb} probe={r.pb} mission={mission} /></td>
                          <td className="tnum py-1.5 pr-2 text-regolith-200">{r.delta === null ? "–" : `${r.delta >= 0 ? "+" : "−"}${Math.abs(r.delta * 100).toFixed(1)} pts`}</td>
                          <td className="py-1.5 text-regolith-300">
                            {r.pa?.excluded !== r.pb?.excluded ? `A hard limit applies in only one scenario.` : r.effects.length ? r.effects.map((e, k) => <Fragment key={e.label}>{k > 0 && "; "}{e.label} {e.d > 0 ? "adds" : "removes"} {Math.abs(e.d * 100).toFixed(1)} pts</Fragment>) : identical ? "No difference." : "Criteria shares barely moved for this site."}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-2xs leading-snug text-regolith-500">Score change is B minus A on RADIUM's 0–100 suitability scale for this mission. "Why" splits it into each criterion's contribution (its value times its share of the weights). Excluded sites are ruled out by a hard limit, not scored zero. No combined score across scenarios is computed.</p>
              </>
            )}
          </section>
          <Editor name="B" mission={mission} scn={b} onChange={setB} onReset={() => setB(defaults)}
            extra={<Button size="sm" onClick={() => setB({ weights: { ...a.weights }, limits: [...a.limits] })}><Copy size={12} /> Copy A</Button>} />
        </div>
      </div>
    </div>
  );
}
