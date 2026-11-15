import { useEffect, useRef, useState } from "react";
import { Button, EvidenceTag, GradeTile, Segmented, Spinner } from "@/components/ui/primitives";
import type { Evidence, Grade, Planet } from "@/lib/types";
import { useStore } from "@/store";

interface ReverseSource { id: string; name: string; url: string; evidence: Evidence; resolution: string }
interface ReverseMatch {
  id: string; body: Planet; name: string; lat: number; lon: number; grid: string; coords: string; cell_km: number[];
  score: number; grade: Grade | null; coverage: number; site_id: string | null;
  dimensions: { id: string; label: string; weight: number; score: number | null; sources: ReverseSource[] }[];
  breaks_down: { label: string; text: string }[];
  curated_comparison: { outscored: number; scored: number; target_id: string } | null;
}
interface ReverseResult {
  status: "ready" | "not_assessed"; note: string | null; purpose: string; min_coverage: number;
  earth: { lat: number; lon: number; cell_km: number[]; analysed: boolean };
  results: { body: Planet; cells: ReverseMatch[]; catalog: ReverseMatch[]; searched_cells: number; note: string | null }[];
}

export default function ReverseTwin({ lat, lon }: { lat: number; lon: number }) {
  const meta = useStore(s => s.meta);
  const [purpose, setPurpose] = useState("general");
  const [kind, setKind] = useState<"cells" | "catalog">("catalog");
  const [result, setResult] = useState<ReverseResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort(); setResult(null); setStatus("idle");
    return () => request.current?.abort();
  }, [lat, lon, purpose]);
  const search = async () => {
    request.current?.abort(); const abort = new AbortController(); request.current = abort;
    const timeout = setTimeout(() => abort.abort(new DOMException("Reverse search timed out", "TimeoutError")), 20000);
    setStatus("loading"); setError("");
    try {
      const response = await fetch("/api/twin/reverse", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lon, purpose, n: 3 }), signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The reverse search is unavailable.");
      if (!abort.signal.aborted) { setResult(data); setStatus("ready"); }
    } catch (e) {
      if (!abort.signal.aborted || abort.signal.reason?.name === "TimeoutError") {
        setError(e instanceof Error ? e.message : "Data unavailable."); setStatus("error");
      }
    } finally { clearTimeout(timeout); }
  };
  const compare = async (match: ReverseMatch) => {
    const s = useStore.getState();
    // This comparison uses the default weights just searched, not a previous custom scenario.
    useStore.setState({ purpose, twinWeights: null });
    s.startTwin({ body: match.body, lat: match.lat, lon: match.lon });
    await s.pickEarth(lat, lon);
    s.setMode("compare");
  };
  const purposes = meta ? Array.from(new Map([...meta.purposes.moon, ...meta.purposes.mars].map(p => [p.id, p])).values()) : [];
  return <section className="space-y-3 rounded-md border border-[var(--hair)] bg-basalt-800/40 p-3" aria-label="What does this resemble?">
    <div><h4 className="font-serif text-lg text-regolith-50">What does this resemble?</h4><p className="text-xs leading-relaxed text-regolith-400">Find Moon and Mars places that match this Earth analysis cell for a research purpose.</p></div>
    <label className="block text-xs text-regolith-300">Research purpose
      <select className="field mt-1 w-full" value={purpose} onChange={event => setPurpose(event.target.value)}>{purposes.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
    </label>
    <Button size="sm" variant="outline" disabled={status === "loading"} onClick={() => void search()}>{status === "loading" ? "Finding matches…" : result ? "Search again" : "Find planetary matches"}</Button>
    <div aria-live="polite">{status === "loading" && <Spinner label="Comparing the planetary grids" />}{status === "error" && <p className="text-xs text-regolith-300">Unavailable. {error}</p>}{result?.note && <p className="text-xs text-regolith-300">{result.note}</p>}</div>
    {result?.status === "ready" && <>
      <p className="text-xs leading-relaxed text-regolith-400"><EvidenceTag kind="computed" /> Purpose-weighted similarity, not landing suitability. Earth cell {result.earth.cell_km.map(v => v.toFixed(1)).join(" × ")} km. Missing values are not interpolated.</p>
      <Segmented label="Planetary match type" size="sm" value={kind} onChange={setKind} options={[{ value: "catalog", label: "Research sites" }, { value: "cells", label: "Grid matches" }]} />
      {result.results.map(group => <div key={group.body} className="space-y-2">
        <h5 className="text-sm font-semibold text-regolith-100">{group.body === "moon" ? "Moon" : "Mars"}</h5>
        {group.note && <p className="text-xs text-regolith-400">{group.note}</p>}
        {group[kind].map(match => <article key={`${match.id}:${match.site_id ?? "cell"}`} className="rounded border border-[var(--hair)] p-2 text-xs leading-relaxed">
          <div className="flex items-start gap-2"><GradeTile grade={match.coverage >= result.min_coverage ? match.grade : null} size="md" title="Purpose-weighted similarity" /><div className="min-w-0 flex-1"><h6 className="font-semibold text-regolith-100">{match.name}</h6><p className="text-regolith-400">{match.coords}</p></div></div>
          <p className="mt-2 text-regolith-300"><EvidenceTag kind="computed" /> Similarity {(match.score * 100).toFixed(0)}/100 · coverage {(match.coverage * 100).toFixed(0)}%</p>
          <p className="text-regolith-400">{match.grid} analysis cell · {match.cell_km.map(v => v.toFixed(1)).join(" × ")} km</p>
          {match.curated_comparison && <p className="mt-1 text-regolith-300">For this target, this Earth cell outscores {match.curated_comparison.outscored} of {match.curated_comparison.scored} assessed, documented Earth analogs.</p>}
          <details className="mt-2"><summary className="row-ctl cursor-pointer rounded-sm py-1 text-regolith-300">Evidence and limits</summary>
            <ul className="space-y-2 py-2 text-regolith-400">{match.dimensions.filter(d => d.weight > 0).map(d => <li key={d.id}><span className="text-regolith-200">{d.label}: {d.score === null ? "Not assessed" : `${Math.round(d.score * 100)}/100`} · {Math.round(d.weight * 100)}% weight</span>{d.sources.map(source => <p key={source.id}><EvidenceTag kind={source.evidence} /> <a className="link" href={source.url} target="_blank" rel="noreferrer">{source.name}</a> · {source.resolution}</p>)}</li>)}</ul>
            <p className="text-regolith-200">Where the analogy breaks down</p><ul className="mt-1 space-y-1 text-regolith-400">{match.breaks_down.map(item => <li key={item.label}>{item.label}: {item.text}</li>)}</ul>
          </details>
          <Button size="sm" className="mt-2" variant="outline" onClick={() => void compare(match)}>Compare this pair</Button>
        </article>)}
      </div>)}
    </>}
    <p className="text-xs leading-relaxed text-regolith-400">Gravity, pressure and radiation remain different. An Earth-wide analog suitability envelope is not assessed.</p>
  </section>;
}
