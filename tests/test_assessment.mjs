import assert from "node:assert/strict";
import test from "node:test";
import { decisionFactors } from "../src/lib/assessment.ts";

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
