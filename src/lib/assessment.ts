import type { CellInfo, DimScore, Evidence, Grade } from "./types";

export interface AssessmentInput {
  id?: string; label?: string; value: number | null; evidence?: Evidence;
  source?: string | null; res?: string;
}
export interface AssessmentFactor {
  id: string; label: string; short?: string; value: number | null; weight: number;
  inputs?: AssessmentInput[];
  ruleEvidence?: Evidence;
}

export const CONFIDENCE_RULE = "Interpreted source-mix summary, not statistical certainty. Each scored positive-weight criterion counts once using its least direct available input class. More than 40% inferred: Low; otherwise more than 40% modelled/interpreted: Medium; otherwise a majority observed/computed: High. Remaining mixed cases: Medium. Missing evidence provenance: Not assessed.";
export function evidenceConfidence(factors: AssessmentFactor[] | undefined): { label: "High" | "Medium" | "Low" | "Not assessed"; direct: number | null; inferred: number | null; modelled: number | null } {
  const unknown = { label: "Not assessed" as const, direct: null, inferred: null, modelled: null };
  const contributing = factors?.filter(f => f.value !== null && Number.isFinite(f.value) && Number.isFinite(f.weight) && f.weight > 0) ?? [];
  const total = contributing.reduce((sum, f) => sum + f.weight, 0);
  if (!total) return unknown;
  let direct = 0, inferred = 0, modelled = 0;
  for (const factor of contributing) {
    const inputs = factor.inputs?.filter(i => i.value !== null && Number.isFinite(i.value)) ?? [];
    if (!inputs.length || inputs.some(i => !i.evidence || !["observed", "computed", "inferred", "modelled", "interpreted"].includes(i.evidence))) return unknown;
    const classes = [...inputs.map(i => i.evidence), factor.ruleEvidence].filter(Boolean);
    if (classes.includes("inferred")) inferred += factor.weight;
    else if (classes.includes("modelled") || classes.includes("interpreted")) modelled += factor.weight;
    else direct += factor.weight;
  }
  direct /= total; inferred /= total; modelled /= total;
  const tolerance = 1e-9;
  return { label: inferred > 0.4 + tolerance ? "Low" : modelled > 0.4 + tolerance ? "Medium" : direct > 0.5 + tolerance ? "High" : "Medium", direct, inferred, modelled };
}

export function gradeAtCoverage(grade: Grade | null | undefined, coverage: number | null | undefined, threshold: number | null | undefined): Grade | null {
  if (coverage === null || coverage === undefined || threshold === null || threshold === undefined || !Number.isFinite(coverage) || !Number.isFinite(threshold) || coverage < 0 || coverage > 1 + 1e-9 || threshold < 0 || threshold > 1 || coverage + 1e-9 < threshold) return null;
  return grade ?? null;
}

/** Use the actual selected pair's measurements; no source class is assumed from a dimension's name. */
export function similarityFactors(dimensions: DimScore[], planet: CellInfo, earth: CellInfo): AssessmentFactor[] {
  const planetary: Record<string, string[]> = {
    terrain: ["slope_med", "slope_p90", "rough_iqr"],
    geology: planet.body === "moon" ? ["feo_wt"] : ["thermal_inertia", "cl_wt", "tmean", "weh_wt"],
    ice: planet.body === "moon" ? ["h_ppm", "dist_psr_km", "ice_1m_frac"] : ["tmean", "weh_wt"],
    environment: [], thermal: ["tmean"], dust: ["dust_tau"],
  };
  const terrestrial: Record<string, string[]> = {
    terrain: ["slope_med", "slope_p90", "rough_iqr"], geology: ["lith"], ice: ["tmean", "ice_frac"],
    environment: ["ndvi_max", "ice_frac", "barren_frac", "precip_mm_yr"], thermal: ["tmean"], dust: ["aod55"],
  };
  const measurements = (cell: CellInfo, ids: string[]) => cell.groups.flatMap(g => g.items).filter(m => ids.includes(m.id));
  return dimensions.map(d => ({ id: d.id, label: d.label, value: d.score, weight: d.weight,
    inputs: [...measurements(planet, planetary[d.id] ?? []), ...measurements(earth, terrestrial[d.id] ?? [])],
    ...(d.id === "geology" ? { ruleEvidence: "interpreted" as const } : {}),
  }));
}

/** Describes existing criteria; does not create a new or combined assessment. */
export function decisionFactors(factors: AssessmentFactor[]) {
  const available = factors.filter(f => f.value !== null && Number.isFinite(f.value) && Number.isFinite(f.weight) && f.weight > 0);
  const primary = [...available].sort((a, b) => b.value! * b.weight - a.value! * a.weight || a.id.localeCompare(b.id))[0] ?? null;
  const limiting = [...available].sort((a, b) => a.value! - b.value! || b.weight - a.weight || a.id.localeCompare(b.id))[0] ?? null;
  return { primary, limiting };
}
