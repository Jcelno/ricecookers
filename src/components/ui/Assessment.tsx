import { EvidenceTag, GradeTile } from "@/components/ui/primitives";
import { CONFIDENCE_RULE, decisionFactors, evidenceConfidence, gradeAtCoverage, type AssessmentFactor } from "@/lib/assessment";
import type { Grade } from "@/lib/types";
import { useStore } from "@/store";

export function AssessmentGrade({ grade, coverage, minCoverage, model = "suitability", excluded = false, size = "md" }: {
  grade: Grade | null | undefined; coverage: number | undefined; minCoverage?: number; model?: "suitability" | "similarity";
  excluded?: boolean; size?: "xs" | "sm" | "md" | "lg" | "xl";
}) {
  const threshold = useStore(s => s.meta?.coverage_thresholds?.[model]);
  const assessed = gradeAtCoverage(grade, coverage, minCoverage ?? threshold);
  const insufficient = !excluded && assessed === null;
  return <span className="inline-flex shrink-0 flex-col items-center gap-0.5"><GradeTile grade={excluded ? null : assessed} size={size} title={excluded ? "Ruled out by a hard limit" : insufficient ? "Insufficient data for this assessment" : undefined} />{insufficient && <span className="max-w-24 text-center text-2xs leading-tight text-regolith-500">Insufficient data</span>}</span>;
}

export function AssessmentChips({ coverage, factors }: { coverage: number | undefined; factors?: AssessmentFactor[] }) {
  const confidence = evidenceConfidence(factors);
  const knownCoverage = coverage !== undefined && Number.isFinite(coverage) && coverage >= 0 && coverage <= 1 + 1e-9;
  return <span className="inline-flex flex-wrap gap-1 text-2xs leading-snug" aria-label="Coverage and evidence confidence">
    <span className="rounded-sm border border-[var(--hair)] bg-basalt-800/60 px-1.5 py-0.5 text-regolith-300" title="Computed share of this assessment's weighted criteria with data; not a count of measurements">Coverage {knownCoverage ? `${Math.round(coverage * 100)}%` : "Not assessed"}</span>
    <span className="rounded-sm border border-[var(--hair)] bg-basalt-800/60 px-1.5 py-0.5 text-regolith-300" title={CONFIDENCE_RULE}>Confidence {confidence.label}</span>
  </span>;
}

export function DecisionCards({ factors, compact = false }: { factors: AssessmentFactor[]; compact?: boolean }) {
  const sources = useStore(s => s.meta?.sources_index);
  const { primary, limiting } = decisionFactors(factors);
  const entries = [{ label: "Primary strength", factor: primary }, { label: "Limiting factor", factor: limiting }];
  if (compact) return <div className="space-y-0.5 text-2xs leading-snug text-regolith-400" aria-label="Decision factors">
    {entries.map(({ label, factor }) => <p key={label}><span className="text-regolith-300">{label}: </span>{factor ? `${factor.short ?? factor.label} · ${Math.round(factor.value! * 100)}/100 · ${Math.round(factor.weight * 100)}% weight` : "Not assessed"}</p>)}
    <p className="text-regolith-500">Computed from this mission’s criteria; inspect the place for sources.</p>
  </div>;
  return <div className="space-y-2" aria-label="Decision factors">
    <div className="grid grid-cols-2 gap-2">{entries.map(({ label, factor }) => <article key={label} className="min-w-0 rounded-md border border-[var(--hair)] bg-basalt-800/60 p-2.5">
      <h4 className="text-2xs text-regolith-400">{label}</h4>
      <p className="mt-1 text-xs font-semibold text-regolith-100">{factor?.label ?? "Not assessed"}</p>
      {factor && <><p className="tnum mt-1 text-sm text-regolith-100">{Math.round(factor.value! * 100)}/100</p><p className="text-2xs text-regolith-400">{Math.round(factor.weight * 100)}% of mission weight</p></>}
    </article>)}</div>
    <p className="text-2xs leading-relaxed text-regolith-400"><EvidenceTag kind="computed" /> Strength has the highest weighted contribution. The limiting factor has the lowest available criterion score.</p>
    {(primary || limiting) && <details><summary className="row-ctl cursor-pointer rounded-sm py-1 text-xs text-regolith-300">Decision evidence and resolution</summary><div className="space-y-2 pt-1 text-2xs leading-relaxed text-regolith-400">
      {[primary, limiting].filter((f, i, all): f is AssessmentFactor => !!f && all.findIndex(x => x?.id === f.id) === i).map(f => <div key={f.id}><h5 className="font-semibold text-regolith-200">{f.label}</h5>{f.inputs?.length ? f.inputs.map((input, index) => <p key={input.id ?? index}>{input.label ?? "Input"}: {input.value === null ? "Data unavailable. " : ""}{input.evidence && <EvidenceTag kind={input.evidence} />} {input.source && sources?.[input.source] ? <a className="link" href={sources[input.source].url} target="_blank" rel="noreferrer">{sources[input.source].name}</a> : "Source unavailable"} · {input.res ?? "Resolution unavailable"}</p>) : <p>Input provenance unavailable.</p>}</div>)}
    </div></details>}
  </div>;
}
