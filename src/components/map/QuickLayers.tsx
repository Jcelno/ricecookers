import { ChevronDown, Layers, Map, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EvidenceTag } from "@/components/ui/primitives";
import type { Basemap, TileLayer } from "@/lib/types";
import { useStore } from "@/store";
import "./quick-layers.css";

/** Small map controls share the exact layer/opacity state used by Advanced and the legend. */
export function QuickLayers() {
  const body = useStore(s => s.body);
  const meta = useStore(s => s.meta)!;
  const layers = useStore(s => s.layers[s.body]);
  const mode = useStore(s => s.mode);
  const setLayer = useStore(s => s.setLayer);
  const [open, setOpen] = useState<"base" | "data" | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const bases = body === "earth" ? meta.layers.earth.tiles : meta.layers[body].tiles.filter(tile => tile.group === "imagery");
  const grid = meta.layers[body].grid;
  const selectedBase = bases.find(tile => tile.id === layers.base);
  const selectedLayer = grid.find(layer => layers.overlay?.kind === "grid" && layer.id === layers.overlay.id);
  const close = (focus = false) => { setOpen(null); if (focus) trigger.current?.focus({ preventScroll: true }); };
  const toggle = (which: "base" | "data", button: HTMLButtonElement) => { trigger.current = button; setOpen(value => value === which ? null : which); };
  useEffect(() => setOpen(null), [body, mode]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key, true); };
  }, [open]);
  return <div ref={root} className="quick-layers" data-tour="quick-layers">
    <button className="quick-layer-pill" aria-expanded={open === "base"} aria-controls="quick-layer-popover" aria-label={`Satellite imagery: ${selectedBase?.title ?? "Choose a source"}`} title={selectedBase?.title} onClick={event => toggle("base", event.currentTarget)}><Map size={13} /><span>Satellite</span><ChevronDown size={12} /></button>
    <button className="quick-layer-pill" aria-expanded={open === "data"} aria-controls="quick-layer-popover" aria-label={`Data layer: ${selectedLayer?.title ?? (mode === "mission" ? "Mission suitability" : layers.overlay ? "NASA rendered map" : "Off")}`} onClick={event => toggle("data", event.currentTarget)} data-active={!!layers.overlay || mode === "mission"}><Layers size={13} /><span>Layer</span><ChevronDown size={12} /></button>
    {body === "earth" && <button className="quick-layer-pill quick-boundaries" aria-pressed={layers.boundaries} title="Country boundaries from OpenStreetMap" onClick={() => setLayer(body, { boundaries: !layers.boundaries })}>Boundaries</button>}
    {open && <section id="quick-layer-popover" className="quick-layer-popover surface-float" aria-label={open === "base" ? "Choose satellite imagery" : "Choose a data layer"}>
      <div className="quick-layer-heading"><h3>{open === "base" ? "Satellite imagery" : "Data layer"}</h3><button className="quick-advanced" onClick={() => { const s = useStore.getState(); if (s.mode !== "explore") s.setMode("explore"); s.setAdvanced(true); s.setPanel("left", true); close(); }} title="Open all layer controls"><SlidersHorizontal size={13} />Advanced</button></div>
      {open === "base" ? <div role="radiogroup" aria-label="Quick satellite imagery">{bases.map((base: Basemap | TileLayer) => <button key={base.id} className="quick-layer-option" role="radio" aria-checked={base.id === layers.base} onClick={() => { setLayer(body, { base: base.id }); close(true); }}><span>{base.title}</span><small>{base.provider}</small></button>)}</div> : mode === "mission" ? <p className="quick-layer-note">Mission Planner displays its computed suitability overlay. Open Explore to inspect individual measurements.</p> : <>
        <div className="quick-layer-options scroll" role="radiogroup" aria-label="Quick data layer">{grid.map(layer => <button key={layer.id} className="quick-layer-option" role="radio" aria-checked={layers.overlay?.kind === "grid" && layers.overlay.id === layer.id} onClick={() => { setLayer(body, { overlay: { kind: "grid", id: layer.id } }); close(true); }}><span>{layer.title}</span><small><EvidenceTag kind={layer.evidence} />{layer.res}</small></button>)}</div>
        {layers.overlay && <div className="quick-layer-opacity"><label>Opacity <output>{Math.round(layers.opacity * 100)}%</output><input aria-label="Quick data layer opacity" type="range" min={20} max={100} value={Math.round(layers.opacity * 100)} className="slider" style={{ ["--fill" as string]: `${((layers.opacity * 100 - 20) / 80) * 100}%` }} onChange={event => setLayer(body, { opacity: Number(event.target.value) / 100 })} /></label><button className="quick-layer-off" onClick={() => { setLayer(body, { overlay: null }); close(true); }}>Turn off layer</button></div>}
      </>}
      {open === "base" && <p className="quick-layer-note">Imagery is visual context. Changing its zoom never changes the analysis grid.</p>}
    </section>}
  </div>;
}
