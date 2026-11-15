// Run with Node 22.18+ (native TypeScript stripping): node --test tests/test_persistence.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { emptySaved, readSaved, writeSaved, parseSaved, validSite, sameSite, SAVED_KEY, LEGACY_SAVED_KEY } from "../src/lib/persistence.ts";
const site = { body: "moon", lat: 0.67416, lon: 23.47314, label: "Apollo 11" };
const storage = () => { const values = new Map(); return { values, getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }; };

test("legacy library migrates without losing precise positions or deleting original data", () => {
  const s = storage(); const original = JSON.stringify({ sites: [site], missions: [] });
  s.setItem(LEGACY_SAVED_KEY, original);
  const result = readSaved(s);
  assert.equal(result.error, null); assert.equal(result.saved.version, 2);
  assert.equal(result.saved.sites[0].lat, site.lat); assert.equal(result.saved.sites[0].lon, site.lon);
  assert.deepEqual(result.saved.comparisons, []);
  assert.equal(s.getItem(LEGACY_SAVED_KEY), original);
  assert.equal(JSON.parse(s.getItem(SAVED_KEY)).sites[0].label, site.label);
});
test("malformed entries cannot crash a valid library", () => {
  const { saved, rejected } = parseSaved({ sites: [null, {}, site, { ...site, lat: 91 }, { ...site, lon: "23" }], missions: [null], comparisons: [null] });
  assert.equal(saved.sites.length, 1); assert.equal(rejected, 6);
  assert.deepEqual(saved.missions, []); assert.deepEqual(saved.comparisons, []);
});
test("coordinates reject nonfinite values and invalid bodies", () => {
  for (const bad of [{ ...site, lat: Infinity }, { ...site, lon: NaN }, { ...site, body: "pluto" }, { ...site, lon: 181 }, { ...site, lat: -91 }]) assert.equal(validSite(bad), false);
  assert.equal(validSite({ ...site, lat: -90, lon: -180 }), true);
});
test("duplicates collapse without conflating distinct closely spaced sites", () => {
  const { saved } = parseSaved({ sites: [site, { ...site }, { ...site, lat: site.lat + 0.00001 }], missions: [] });
  assert.equal(saved.sites.length, 2);
  assert.equal(sameSite(site, { ...site, body: "mars" }), false);
});
test("failed writes report session-only persistence and retain in-memory data", () => {
  const saved = { ...emptySaved(), sites: [site] };
  const error = writeSaved(saved, { setItem() { throw new Error("quota exceeded"); } });
  assert.match(error, /this tab only/); assert.equal(saved.sites[0].lat, site.lat);
});
test("blocked reads and malformed JSON produce recoverable error states", () => {
  assert.match(readSaved({ getItem() { throw Error("blocked"); }, setItem() {} }).error, /could not be read/);
  const s = storage(); s.setItem(SAVED_KEY, "{malformed");
  assert.match(readSaved(s).error, /damaged/); assert.equal(s.getItem(SAVED_KEY), "{malformed");
});
test("unsafe source schemes and invalid model grades are dropped", () => {
  const saved = parseSaved({ sites: [{ ...site, sources: [{ title: "bad", url: "javascript:alert(1)" }, { title: "NASA", url: "https://www.nasa.gov/" }], context: { model: "analog similarity", grade: "Z" } }], missions: [] }).saved;
  assert.equal(saved.sites[0].sources.length, 1); assert.equal(saved.sites[0].context, undefined);
});
test("pair comparisons retain model context, dimensions, and sources through reload", () => {
  const earth = { body: "earth", lat: 75.383, lon: -89.667, label: "Haughton" };
  const context = { model: "analog similarity", modelVersion: "RADIUM 1.0", purpose: "mobility", weights: { terrain: 100 }, grade: "B", score: 0.75, coverage: 1, assessedAt: "2026-11-14T10:00:00Z" };
  const comparison = { id: "test", name: "Terrain study", kind: "pair", sites: [site, earth], target: site, earth, purpose: "mobility", weights: { terrain: 100 }, created: "2026-11-14T10:00:00Z", context, sources: [{ title: "LOLA", url: "https://pds.nasa.gov/" }], dimensions: [{ id: "terrain", label: "Terrain", score: 0.75, grade: "B", weight: 1 }] };
  const s = storage(); assert.equal(writeSaved({ ...emptySaved(), comparisons: [comparison] }, s), null);
  const restored = readSaved(s).saved.comparisons[0];
  assert.deepEqual(restored.context, context); assert.deepEqual(restored.sources, comparison.sources); assert.equal(restored.target.lat, site.lat);
});
test("invalid pair endpoints, mission weights, and collections are sanitized", () => {
  const input = { sites: [{ ...site, collection: 123 }], missions: [{ id: "x", name: "x", mission: "lunar_base", weights: { terrain: NaN }, limits: [], site: null, created: "now" }], comparisons: [{ id: "x", name: "x", kind: "pair", sites: [site, site], target: site, earth: site, purpose: "general", weights: null, created: "now" }] };
  const { saved, rejected } = parseSaved(input);
  assert.equal(saved.sites[0].collection, ""); assert.equal(rejected, 2);
});

test("new-lead provenance survives saved comparison export without inventing unknown provenance", () => {
  const earth = { body: "earth", lat: -24.25, lon: -69.75, label: "Screened cell", newLead: true };
  const comparison = { id: "lead", name: "Fieldwork lead", kind: "sites", sites: [site, earth], purpose: "general", weights: null, created: "2026-11-15T12:00:00Z", sources: [] };
  const s = storage();
  assert.equal(writeSaved({ ...emptySaved(), sites: [earth, { ...earth, lat: 1, newLead: "true" }, { ...site, newLead: true }], comparisons: [comparison] }, s), null);
  const restored = readSaved(s).saved;
  assert.equal(restored.sites[0].newLead, true);
  assert.equal(restored.sites[1].newLead, undefined);
  assert.equal(restored.sites[2].newLead, undefined);
  assert.equal(restored.comparisons[0].sites[0].newLead, undefined);
  assert.equal(restored.comparisons[0].sites[1].newLead, true);
  assert.equal(JSON.parse(JSON.stringify(restored)).comparisons[0].sites[1].newLead, true);
});
