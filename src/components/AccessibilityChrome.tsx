import { useState } from "react";
import { X } from "lucide-react";
import { useStore } from "@/store";
import { IconButton } from "./ui/primitives";

export function SkipLinks() {
  const skip = (target: "map" | "location") => {
    const s = useStore.getState();
    if (s.mode !== "explore" && s.mode !== "mission") s.setMode("explore");
    if (target === "location") s.setPanel("right", true);
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(target === "map" ? "[data-stage]" : '[data-tour="location"]');
      if (element) { element.tabIndex = -1; element.focus({ preventScroll: true }); }
    });
  };
  return <div className="skip-links"><a href="#radium-map" onClick={e => { e.preventDefault(); skip("map"); }}>Skip to map</a><a href="#location-panel" onClick={e => { e.preventDefault(); skip("location"); }}>Skip to location panel</a></div>;
}
export function CaveatFooter() {
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem("radium.caveat.v1") === "1"; } catch { return false; } });
  const body = useStore(s => ["twin", "near"].includes(s.mode) ? "earth" : s.body);
  const meta = useStore(s => s.meta);
  const layers = useStore(s => s.layers);
  if (dismissed || !meta) return null;
  const imagery = meta.layers[body].tiles.find(l => l.id === layers[body].base) ?? meta.layers[body].tiles[0];
  const elevation = meta.layers[body].grid.find(l => l.id === "elev_mean");
  const source = elevation?.source ? meta.sources_index[elevation.source] : null;
  const credit = `Imagery: ${imagery?.attribution ?? imagery?.provider ?? "Data unavailable"}. DEM: ${source?.name ?? "See Data Sources"}${elevation?.res ? `, ${elevation.res}` : ""}.`;
  return <footer className="caveat-footer">
    <span>RADIUM grades are exploratory, RADIUM-defined assessments, not NASA certification.</span>
    <span className="caveat-attribution" title={credit}>{credit}</span>
    <IconButton label="Dismiss caveat for this session" className="!size-6" onClick={() => { setDismissed(true); try { sessionStorage.setItem("radium.caveat.v1", "1"); } catch { /* session-only dismissal */ } }}><X size={12} /></IconButton>
  </footer>;
}
