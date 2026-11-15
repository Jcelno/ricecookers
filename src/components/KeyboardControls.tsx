import { lazy, Suspense, useEffect, useState } from "react";
import { useStore, type SiteRef } from "@/store";
const Shortcuts = lazy(() => import("./sheets/Shortcuts"));

export function currentSite(): SiteRef | null {
  const s = useStore.getState();
  if ((s.mode === "twin" || s.mode === "compare") && s.picked && s.compare) return { body: "earth", ...s.picked, label: s.compare.earth.place.label };
  if (!s.selection || !s.cell || s.cellStatus !== "ready") return null;
  const pin = s.pins[s.selection.body].find(p => Math.abs(p.lat - s.selection!.lat) < .0001 && Math.abs(p.lon - s.selection!.lon) < .0001);
  return { ...s.selection, label: pin?.name ?? s.cell.place.label };
}
export function KeyboardControls() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true]")) return;
      if ([...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")) return;
      const k = event.key.toLowerCase();
      if (!["/", "1", "2", "3", "l", "t", "s", "c", "?"].includes(k)) return;
      const s = useStore.getState();
      event.preventDefault();
      if (k === "?") setOpen(true);
      else if (k === "/") {
        const registry = [...document.querySelectorAll<HTMLSelectElement>(".workspace-context select")].find(el => el.getClientRects().length);
        if (registry) registry.focus();
        else window.dispatchEvent(new Event("radium:focus-search"));
      } else if (k === "1" || k === "2" || k === "3") s.setBody(k === "1" ? "moon" : k === "2" ? "mars" : "earth");
      else if (k === "l") { if (s.mode !== "explore") s.setMode("explore"); s.setPanel("left", !s.leftOpen); }
      else if (k === "t" && s.selection?.body !== "earth" && s.selection) s.startTwin({ ...s.selection, body: s.selection.body });
      else if (k === "s") { const place = currentSite(); if (place) s.saveSite(place); }
      else if (k === "c") { const place = currentSite(); if (place) s.addCompare(place); }
    };
    window.addEventListener("radium:shortcuts", show);
    document.addEventListener("keydown", key);
    return () => { window.removeEventListener("radium:shortcuts", show); document.removeEventListener("keydown", key); };
  }, []);
  return open ? <Suspense fallback={null}><Shortcuts onClose={() => setOpen(false)} /></Suspense> : null;
}
