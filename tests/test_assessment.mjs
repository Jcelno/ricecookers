import assert from "node:assert/strict";
import test from "node:test";
import { decisionFactors, evidenceConfidence, gradeAtCoverage, similarityFactors } from "../src/lib/assessment.ts";

test("decision cards use weighted contribution for strength and available score for the limit", () => {
  const factors = [
    { id: "terrain", label: "Terrain", value: 0.98, weight: 0.12 },
    { id: "power", label: "Power", value: 0.7, weight: 0.4 },
    { id: "thermal", label: "Thermal", value: 0.08, weight: 0.06 },
    { id: "off", label: "Off", value: 0, weight: 0 },
    { id: "missing", label: "Missing", value: null, weight: 0.42 },
  ];
  const { primary, limiting } = decisionFactors(factors);
  assert.equal(primary.id, "power");
  assert.equal(limiting.id, "thermal");
  assert.equal(decisionFactors(factors.toReversed()).primary.id, primary.id);
});

test("missing and zero-weight criteria are never invented decision factors", () => {
  const unavailable = [{ id: "a", label: "A", weight: 1, value: null }, { id: "b", label: "B", weight: 0, value: 0 }, { id: "c", label: "C", weight: 1, value: NaN }];
  assert.deepEqual(decisionFactors(unavailable), { primary: null, limiting: null });
  const zero = { id: "zero", label: "Zero", weight: 1, value: 0 };
  assert.equal(decisionFactors([zero]).limiting, zero);
});

const factor = (id, weight, evidence, value = 0.7) => ({ id, label: id, weight, value, inputs: [{ value: 12, evidence }] });
test("confidence weights criteria once, uses source evidence and preserves the strict 40% boundary", () => {
  assert.equal(evidenceConfidence([factor("terrain", 0.6, "computed"), factor("ice", 0.4, "inferred")]).label, "High");
  assert.equal(evidenceConfidence([factor("terrain", 0.59, "observed"), factor("ice", 0.41, "inferred")]).label, "Low");
  assert.equal(evidenceConfidence([factor("terrain", 0.59, "computed"), factor("climate", 0.41, "modelled")]).label, "Medium");
  assert.equal(evidenceConfidence([factor("rock", 1, "interpreted")]).label, "Medium");
  assert.equal(evidenceConfidence([factor("terrain", 0.5, "observed"), factor("ice", 0.3, "inferred"), factor("climate", 0.2, "modelled")]).label, "Medium");
  const mixed = factor("mixed", 0.45, "observed"); mixed.inputs.push({ value: 1, evidence: "inferred" });
  assert.equal(evidenceConfidence([mixed, factor("terrain", 0.55, "computed")]).label, "Low");
});

test("missing evidence is not high confidence and missing values do not consume scored weight", () => {
  assert.equal(evidenceConfidence(undefined).label, "Not assessed");
  assert.equal(evidenceConfidence([{ id: "a", label: "A", value: 0.8, weight: 1 }]).label, "Not assessed");
  assert.equal(evidenceConfidence([factor("a", 1, undefined)]).label, "Not assessed");
  assert.equal(evidenceConfidence([factor("a", 1, "observed", null)]).label, "Not assessed");
  assert.equal(evidenceConfidence([factor("a", 1, "observed", 0), factor("missing", 9, "inferred", null)]).label, "High");
  assert.equal(evidenceConfidence([factor("a", 1, "observed"), factor("off", 0, "inferred")]).label, "High");
});

test("coverage follows each backend threshold and unknown never becomes a letter", () => {
  assert.equal(gradeAtCoverage("A", 0.59, 0.6), null);
  assert.equal(gradeAtCoverage("A", 0.6, 0.6), "A");
  assert.equal(gradeAtCoverage("A", 0.79, 0.8), null);
  assert.equal(gradeAtCoverage("B", 0.8, 0.8), "B");
  assert.equal(gradeAtCoverage("A", 1, undefined), null);
  assert.equal(gradeAtCoverage("A", NaN, 0.6), null);
  assert.equal(gradeAtCoverage(null, 1, 0.6), null);
});

test("similarity confidence reads pair measurements and includes the interpreted affinity rule", () => {
  const cell = (body, items) => ({ body, groups: [{ items }] });
  const planet = cell("moon", [{ id: "feo_wt", value: 10, evidence: "inferred" }, { id: "slope_med", value: 3, evidence: "computed" }]);
  const earth = cell("earth", [{ id: "lith", value: 1, evidence: "interpreted" }, { id: "slope_med", value: 2, evidence: "computed" }]);
  const factors = similarityFactors([{ id: "geology", label: "Rock", weight: 0.6, score: 0.7 }, { id: "terrain", label: "Terrain", weight: 0.4, score: 0.8 }], planet, earth);
  assert.equal(factors[0].ruleEvidence, "interpreted");
  assert.deepEqual(factors[0].inputs.map(m => m.id), ["feo_wt", "lith"]);
  assert.equal(evidenceConfidence(factors).label, "Low");
});
