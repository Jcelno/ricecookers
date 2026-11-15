import type { Grade, Measure } from "./types";

export const GRADE_COLOR: Record<Grade, string> = {
  A: "var(--color-grade-a)",
  B: "var(--color-grade-b)",
  C: "var(--color-grade-c)",
  D: "var(--color-grade-d)",
  F: "var(--color-grade-f)",
};
export const GRADE_HEX: Record<Grade, string> = { A: "#56c8f5", B: "#86d6b9", C: "#ecdf9a", D: "#f0a55a", F: "#de5d57" };
export const GRADE_MEANING: Record<Grade, string> = { A: "Excellent", B: "Good", C: "Moderate", D: "Poor", F: "Very poor" };

const nf = (dec: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const cache = new Map<number, Intl.NumberFormat>();
function fmtNum(v: number, dec: number) {
  let f = cache.get(dec);
  if (!f) cache.set(dec, (f = nf(dec)));
  return f.format(v);
}

/** Format a value with the decimals and style its catalogue entry asks for. */
export function formatValue(v: number | null | undefined, dec = 1, fmt?: string | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (fmt === "percent") return `${fmtNum(v * 100, v > 0 && v < 0.1 ? 1 : 0)}%`;
  return fmtNum(v, dec);
}

export function formatMeasure(m: Pick<Measure, "value" | "dec" | "fmt" | "text" | "sigma">): string {
  if (m.text) return m.text;
  if (m.value === null) return "No data";
  const base = formatValue(m.value, m.dec, m.fmt);
  if (m.sigma !== null && m.sigma !== undefined && Number.isFinite(m.sigma)) return `${base} ± ${formatValue(m.sigma, Math.max(m.dec, 1), m.fmt)}`;
  return base;
}

export function formatCoord(lat: number, lon: number, dec = 2): string {
  const la = `${Math.abs(lat).toFixed(dec)}°${lat >= 0 ? "N" : "S"}`;
  const lo = `${Math.abs(lon).toFixed(dec)}°${lon >= 0 ? "E" : "W"}`;
  return `${la}, ${lo}`;
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

export function wrapLon(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Temperatures are stored in kelvin; show them in °C when asked. Differences (sigma, ranges) are the same in both. */
export function inUnit<T extends { value: number | null; unit: string }>(m: T, temp: "K" | "C"): T {
  if (m.unit !== "K" || temp === "K" || m.value === null) return m;
  return { ...m, value: m.value - 273.15, unit: "°C" };
}
