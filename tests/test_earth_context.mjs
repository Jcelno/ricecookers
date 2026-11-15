import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { eruptionLabel, fetchSoil, nearestVolcano, summarizeSoil } from "../src/lib/earth-context.ts";

test("soil keeps missing measurements missing and uses the 0–5 cm interval", () => {
  const summary = summarizeSoil({ properties: { layers: [
    { name: "clay", depths: [{ label: "0-5cm", values: { mean: 253 } }, { label: "5-15cm", values: { mean: 999 } }] },
    { name: "sand", depths: [{ label: "0-5cm", values: { mean: null } }] },
    { name: "phh2o", depths: [{ label: "0-5cm", values: { mean: 62 } }] },
  ] } });
  assert.equal(summary.values.find(v => v.id === "clay").value, 25.3);
  assert.equal(summary.values.find(v => v.id === "sand").value, null);
  assert.equal(summary.values.find(v => v.id === "phh2o").value, 6.2);
  assert.equal(summary.evidence, "modelled");
  assert.throws(() => summarizeSoil({ properties: { layers: [] } }), /Unavailable/);
  assert.throws(() => summarizeSoil({ properties: { layers: [{ name: "clay", depths: [{ label: "0-5cm", values: { mean: -32768 } }] }] } }), /Unavailable/);
});

test("SoilGrids request times out and can be cancelled on a selection change", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  try {
    await assert.rejects(fetchSoil(0, 0, new AbortController().signal, 10), { name: "TimeoutError" });
    const abort = new AbortController(); const pending = fetchSoil(0, 0, abort.signal);
    abort.abort(); await assert.rejects(pending, { name: "AbortError" });
  } finally { globalThis.fetch = original; }
});

test("official snapshot is complete, attributable and keeps unknown eruption years", async () => {
  const catalog = JSON.parse(await readFile(new URL("../public/data/gvp-volcanoes.json", import.meta.url), "utf8"));
  assert.equal(catalog.volcanoes.length, catalog.count);
  assert.equal(new Set(catalog.volcanoes.map(v => v.id)).size, catalog.count);
  assert.match(catalog.download_url, /^https:\/\/webservices\.volcano\.si\.edu\//);
  assert.match(catalog.source_sha256, /^[a-f0-9]{64}$/);
  assert.ok(catalog.volcanoes.some(v => v.last_eruption_year === null));
  assert.equal(eruptionLabel(null), "Unknown");
  assert.equal(eruptionLabel(-8300), "8300 BCE");
  for (const point of catalog.volcanoes) {
    assert.ok(Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180);
    assert.match(point.url, /^https:\/\/volcano\.si\.edu\/volcano\.cfm\?vn=\d+$/);
  }
  const v = catalog.volcanoes.find(v => v.name === "Kilauea");
  assert.ok(v);
  assert.equal(nearestVolcano(v.lat, v.lon, catalog).id, v.id);
  assert.equal(nearestVolcano(v.lat, v.lon, catalog).distanceKm, 0);
  assert.equal(nearestVolcano(NaN, 0, catalog), null);
});

test("nearest-center search crosses the antimeridian and never invents a grade", () => {
  const catalog = { volcanoes: [{ id: "a", lat: 0, lon: 179.9 }, { id: "b", lat: 0, lon: 170 }] };
  const nearest = nearestVolcano(0, -179.9, catalog);
  assert.equal(nearest.id, "a");
  assert.ok(nearest.distanceKm > 22 && nearest.distanceKm < 23);
  assert.equal(nearest.score, undefined);
  assert.equal(nearest.grade, undefined);
});
