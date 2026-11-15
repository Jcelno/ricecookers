import { useStore } from "@/store";
import type { TwinResult } from "@/lib/types";
import { formatValue } from "@/lib/format";
import "./discovery.css";

/** The profile is the exact analysis cell returned with this ranking, not a cursor sample. */
export function TargetContext({ twin, compact = false }: { twin: TwinResult; compact?: boolean }) {
  const meta = useStore((state) => state.meta)!;
  const unit = useStore((state) => state.tempUnit);
  const body = twin.planet.body;
  const purpose = meta.purposes[body].find((item) => item.id === twin.purpose)?.label ?? twin.purpose;
  const measurements = ["tmax", "tmin", "slope_med"].map((id) => {
    const layer = meta.layers[body].grid.find((item) => item.id === id);
    const raw = twin.planet.profile[id];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    const temperature = id === "tmax" || id === "tmin";
    return { id, layer, source: layer?.source ? meta.sources_index[layer.source] : null, label: id === "tmax" ? "High" : id === "tmin" ? "Low" : "Slope", text: value !== null && layer ? `${formatValue(temperature && unit === "C" ? value - 273.15 : value, temperature ? 0 : 1)} ${temperature ? unit === "C" ? "°C" : "K" : "°"}` : "Not assessed" };
  });
  return <section className={`match-target-context ${compact ? "match-target-map" : ""}`} data-match-target>
    <p>Earth matches to <strong>{twin.planet.coords}</strong> on {body === "moon" ? "the Moon" : "Mars"}</p>
    <span className="match-target-purpose">{purpose} · computed similarity</span>
    <div className="match-target-values">{measurements.map((item) => <span key={item.id} title={item.layer ? `${item.layer.evidence}; ${item.source?.name ?? "RADIUM source registry"}; ${item.layer.res}` : "Data unavailable"}>{item.label} <strong>{item.text}</strong>{!compact && item.layer && <small>{item.layer.evidence}</small>}</span>)}</div>
    <details><summary>Target evidence and resolution</summary>{measurements.map((item) => <p key={item.id}>{item.layer?.title ?? item.label}: {item.layer?.evidence ?? "Not assessed"}; {item.source ? <a href={item.source.url} target="_blank" rel="noreferrer">{item.source.name}</a> : "Source unavailable"}; {item.layer?.res ?? "resolution unavailable"}.</p>)}<p>Coordinates are the containing {twin.planet.grid} analysis cell. Temperature conversion is computed; imagery does not add scientific resolution.</p></details>
  </section>;
}
export function LeadFilter() {
  const documented = useStore((state) => state.showDocumented), modelled = useStore((state) => state.showModelled);
  const selected = documented ? modelled ? "both" : "documented" : modelled ? "leads" : "none";
  return <div className="lead-filter" role="group" aria-label="Candidate origin">{[{ id: "documented", label: "Documented" }, { id: "leads", label: "New leads" }, { id: "both", label: "Both" }].map((option) => <button key={option.id} type="button" aria-pressed={selected === option.id} onClick={() => useStore.getState().setAtlas({ showDocumented: option.id !== "leads", showModelled: option.id !== "documented" })}>{option.label}</button>)}</div>;
}
