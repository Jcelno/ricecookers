import { EvidenceTag } from "@/components/ui/primitives";
import { decisionFactors, type AssessmentFactor } from "@/lib/assessment";
import { useStore } from "@/store";

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
