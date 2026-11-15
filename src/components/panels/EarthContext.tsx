import { useEffect, useRef, useState } from "react";
import { Button, EvidenceTag, Spinner } from "@/components/ui/primitives";
import { eruptionLabel, fetchSoil, nearestVolcano, type SoilContext, type VolcanoCatalog } from "@/lib/earth-context";

/** Lazy loaded by the Earth Site Card; fetching soil always requires a deliberate request. */
export default function EarthContext({ lat, lon }: { lat: number; lon: number }) {
  const [catalog, setCatalog] = useState<VolcanoCatalog | null>(null);
  const [volcanoError, setVolcanoError] = useState(false);
  const [soil, setSoil] = useState<SoilContext | null>(null);
  const [soilStatus, setSoilStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const soilAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/data/gvp-volcanoes.json", { signal: abort.signal }).then(response => {
      if (!response.ok) throw new Error("catalog unavailable");
      return response.json();
    }).then((value: VolcanoCatalog) => {
      if (!Array.isArray(value.volcanoes) || !value.volcanoes.length) throw new Error("empty catalog");
      if (!abort.signal.aborted) setCatalog(value);
    }).catch(() => { if (!abort.signal.aborted) setVolcanoError(true); });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    soilAbort.current?.abort(); setSoil(null); setSoilStatus("idle");
    return () => soilAbort.current?.abort();
  }, [lat, lon]);
  const volcano = catalog ? nearestVolcano(lat, lon, catalog) : null;
  const requestSoil = async () => {
    soilAbort.current?.abort();
    const abort = new AbortController(); soilAbort.current = abort;
    setSoil(null); setSoilStatus("loading");
    try {
      const value = await fetchSoil(lat, lon, abort.signal);
      if (!abort.signal.aborted) { setSoil(value); setSoilStatus("ready"); }
    } catch { if (!abort.signal.aborted) setSoilStatus("error"); }
  };
  return <section className="space-y-3 rounded-md border border-[var(--hair)] bg-basalt-800/40 p-3" aria-label="Earth context (not scored)">
    <div><h4 className="font-serif text-lg text-regolith-50">Context (not scored)</h4><p className="text-xs leading-relaxed text-regolith-400">Local soil predictions and the nearest catalogued volcano add context. Neither changes a RADIUM grade.</p></div>
    <div className="space-y-1.5 text-xs leading-relaxed">
      <h5 className="font-semibold text-regolith-100">Nearest Holocene volcanic center</h5>
      {volcano && catalog ? <>
        <a className="link" href={volcano.url} target="_blank" rel="noreferrer">{volcano.name}, {volcano.country} ↗</a>
        <p className="tnum text-regolith-200"><EvidenceTag kind="computed" /> {volcano.distanceKm.toFixed(1)} km great-circle distance</p>
        <p className="text-regolith-400">Last known eruption: {eruptionLabel(volcano.last_eruption_year)}. <EvidenceTag kind="observed" /></p>
        <p className="text-regolith-400">Source: <a className="link" href={catalog.doi} target="_blank" rel="noreferrer">Smithsonian GVP</a>. Catalog points; coordinate precision varies. Snapshot {catalog.retrieved_at.slice(0, 10)}.</p>
        <p className="text-regolith-400">Proximity does not establish local lava tubes, caves, subsurface access or current hazard.</p>
      </> : <p className="text-regolith-400">{volcanoError ? "Unavailable" : "Loading catalog…"}</p>}
    </div>
    <div className="hair-t space-y-2 pt-3 text-xs leading-relaxed">
      <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold text-regolith-100">Topsoil prediction</h5><Button size="sm" variant="outline" disabled={soilStatus === "loading"} onClick={() => void requestSoil()}>{soilStatus === "idle" ? "Load SoilGrids" : soilStatus === "ready" ? "Refresh soil" : "Retry SoilGrids"}</Button></div>
      <p className="text-regolith-400"><EvidenceTag kind="modelled" /> ISRIC SoilGrids 2.0 · 250 m · 0–5 cm depth</p>
      <div aria-live="polite">{soilStatus === "loading" && <Spinner label="Requesting SoilGrids" />}{soilStatus === "error" && <p className="text-regolith-300">Unavailable. ISRIC may be offline or have no prediction for this cell.</p>}
      {soil && <dl className="grid grid-cols-2 gap-x-3 gap-y-1">{soil.values.map(value => <div key={value.id} className="flex justify-between gap-2"><dt className="text-regolith-400">{value.label}</dt><dd className="tnum text-regolith-100">{value.value === null ? "Unavailable" : `${value.value.toFixed(1)} ${value.unit}`}</dd></div>)}</dl>}</div>
      <p className="text-regolith-400">Modelled surface soil, not bedrock or a field sample. <a className="link" href="https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html" target="_blank" rel="noreferrer">Source, units and limitations ↗</a></p>
    </div>
  </section>;
}
