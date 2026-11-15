/** Optional context, never inputs to either suitability or similarity. */
export interface SoilValue { id: string; label: string; value: number | null; unit: string }
export interface SoilContext { values: SoilValue[]; evidence: "modelled"; source: string; resolution: string; depth: string }
export interface Volcano { id: string; name: string; country: string; lat: number; lon: number; last_eruption_year: number | null; url: string }
export interface VolcanoCatalog { source: string; url: string; retrieved_at: string; doi: string; resolution: string; count: number; volcanoes: Volcano[] }
const SOIL = "https://rest.isric.org/soilgrids/v2.0/properties/query";
const PROPERTIES = [
  ["sand", "Sand", "%", 10], ["silt", "Silt", "%", 10], ["clay", "Clay", "%", 10],
  ["cfvo", "Coarse fragments", "%", 10], ["bdod", "Bulk density", "kg/dm³", 100], ["phh2o", "pH (water)", "", 10],
] as const;

export function summarizeSoil(data: unknown): SoilContext {
  const layers = (data as { properties?: { layers?: { name: string; depths?: { label: string; values?: { mean?: unknown } }[] }[] } })?.properties?.layers;
  if (!Array.isArray(layers)) throw new Error("Unavailable: no SoilGrids prediction for this location.");
  const values = PROPERTIES.map(([id, label, unit, divisor]) => {
    const raw = layers.find(layer => layer.name === id)?.depths?.find(depth => depth.label === "0-5cm")?.values?.mean;
    // Null is missing, not zero. Conversion factors are from ISRIC's published units table.
    const value = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw / divisor : null;
    return { id, label, value, unit };
  });
  if (values.every(value => value.value === null)) throw new Error("Unavailable: no SoilGrids prediction for this location.");
  return { values, evidence: "modelled", source: "ISRIC SoilGrids 2.0", resolution: "250 m", depth: "0–5 cm" };
}

export async function fetchSoil(lat: number, lon: number, signal: AbortSignal, timeoutMs = 8000): Promise<SoilContext> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException("SoilGrids timed out", "TimeoutError")), timeoutMs);
  try {
    if (signal.aborted) abort();
    const query = new URLSearchParams({ lat: String(lat), lon: String(lon), depth: "0-5cm", value: "mean" });
    for (const [id] of PROPERTIES) query.append("property", id);
    const response = await fetch(`${SOIL}?${query}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Unavailable: SoilGrids is not responding.");
    return summarizeSoil(await response.json());
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

/** Great-circle distance to the catalog point, not a volcanic hazard or extent. */
export function nearestVolcano(lat: number, lon: number, catalog: VolcanoCatalog) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) return null;
  const rad = Math.PI / 180;
  let best: (Volcano & { distanceKm: number }) | null = null;
  for (const volcano of catalog.volcanoes) {
    if (!Number.isFinite(volcano.lat) || !Number.isFinite(volcano.lon)) continue;
    const a = Math.sin((volcano.lat - lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(volcano.lat * rad) * Math.sin((volcano.lon - lon) * rad / 2) ** 2;
    const distanceKm = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
    if (!best || distanceKm < best.distanceKm) best = { ...volcano, distanceKm };
  }
  return best;
}

export function eruptionLabel(year: number | null): string {
  if (year === null || !Number.isFinite(year)) return "Unknown";
  return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
}
