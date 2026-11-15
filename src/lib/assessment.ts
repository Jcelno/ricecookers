import type { Evidence } from "./types";

export interface AssessmentInput {
  id?: string; label?: string; value: number | null; evidence?: Evidence;
  source?: string | null; res?: string;
}
export interface AssessmentFactor {
  id: string; label: string; short?: string; value: number | null; weight: number;
  inputs?: AssessmentInput[];
}

/** Describes existing criteria; does not create a new or combined assessment. */
export function decisionFactors(factors: AssessmentFactor[]) {
  const available = factors.filter(f => f.value !== null && Number.isFinite(f.value) && Number.isFinite(f.weight) && f.weight > 0);
  const primary = [...available].sort((a, b) => b.value! * b.weight - a.value! * a.weight || a.id.localeCompare(b.id))[0] ?? null;
  const limiting = [...available].sort((a, b) => a.value! - b.value! || b.weight - a.weight || a.id.localeCompare(b.id))[0] ?? null;
  return { primary, limiting };
}
