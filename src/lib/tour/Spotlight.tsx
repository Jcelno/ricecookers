import { useEffect, useId, useState } from "react";
import { useStore } from "@/store";
import { galeSite } from "./steps";

export interface TargetRect { x: number; y: number; width: number; height: number; radius?: number }
export function findTourTarget(key: string): HTMLElement | null {
  if (key === "marker:gale") {
    const pin = galeSite(useStore.getState());
    return pin ? document.querySelector<HTMLElement>(`[data-tour-marker="${CSS.escape(pin.id)}"]`) : null;
  }
  if (key === "map") return document.querySelector<HTMLElement>('[data-tour="map"]') ?? document.querySelector<HTMLElement>('[aria-label="Planetary map"]') ?? document.querySelector<HTMLElement>(".cesium-viewer");
  if (key === "analogy-breakdown" && innerWidth < 640) return document.querySelector<HTMLElement>('[data-tour="analogy-breakdown"] li');
  if (key === "catalog") return document.querySelector<HTMLElement>('[data-tour="catalog"] .catalog-filters');
  if (key === "near-settings") return [...document.querySelectorAll<HTMLElement>('[aria-label="Enter coordinates"]')].find((node) => node.getClientRects().length > 0) ?? null;
  return document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(key)}"]`);
}
export function focusTourTarget(key: string) {
  const element = findTourTarget(key);
  if (!element) return;
  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  const focusable = element.matches("button,input,select,[tabindex]") ? element : element.querySelector<HTMLElement>("button,input,select,[tabindex]");
  focusable?.focus({ preventScroll: true });
}
/** Rebind when lazy views mount, and measure only after a real layout/camera change. */
export function useTargetRect(key: string | null): TargetRect | null {
  const [rect, setRect] = useState<TargetRect | null>(null);
  useEffect(() => {
    if (!key) { setRect(null); return; }
    let target: HTMLElement | null = null;
    let frame = 0;
    const resize = new ResizeObserver(() => schedule());
    function update() {
      frame = 0;
      const next = findTourTarget(key!);
      if (next !== target) {
        if (target) resize.unobserve(target);
        target = next;
        if (target) {
          resize.observe(target);
          const bounds = target.getBoundingClientRect();
          // Reveal once on binding; subsequent camera and layout updates must never steal scrolling.
          const scrollParent = target.parentElement?.closest<HTMLElement>(".scroll");
          const clip = scrollParent?.getBoundingClientRect();
          const clipped = clip && (bounds.bottom > clip.bottom || bounds.top < clip.top);
          if (bounds.width > 0 && bounds.height > 0 && (clipped || bounds.top >= innerHeight || bounds.bottom <= 0 || bounds.left >= innerWidth || bounds.right <= 0)) target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        }
      }
      if (!target || !target.getClientRects().length || getComputedStyle(target).visibility === "hidden") { setRect(null); return; }
      const box = target.getBoundingClientRect();
      let value: TargetRect = { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12, radius: 10 };
      if (key === "map") {
        const diameter = Math.min(box.width * 0.6, box.height * 0.6, 240);
        value = { x: box.x + box.width / 2 - diameter / 2, y: box.y + box.height / 2 - diameter / 2, width: diameter, height: diameter, radius: diameter / 2 };
      }
      if (key?.startsWith("marker:")) value = { x: box.x - 18, y: box.y - 18, width: box.width + 36, height: box.height + 36, radius: 40 };
      if (box.width < 1 || box.height < 1 || box.bottom < 0 || box.top > innerHeight) { setRect(null); return; }
      setRect((old) => old && Object.keys(value).every((k) => Math.abs((old[k as keyof TargetRect] ?? 0) - (value[k as keyof TargetRect] ?? 0)) < 0.5) ? old : value);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    const mutation = new MutationObserver((entries) => { if (entries.some((e) => !(e.target instanceof Element) || !e.target.closest("[data-tour-overlay]"))) schedule(); });
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); };
  }, [key]);
  return rect;
}
export function Spotlight({ rect }: { rect: TargetRect | null }) {
  const id = useId().replace(/:/g, "");
  return <svg className="tour-spotlight" data-tour-overlay="spotlight" aria-hidden="true" width="100%" height="100%">
    <defs><mask id={id}><rect width="100%" height="100%" fill="white" />{rect && <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={rect.radius} fill="black" />}</mask></defs>
    <rect width="100%" height="100%" fill="rgba(0, 4, 12, 0.66)" mask={`url(#${id})`} />
    {rect && <rect className="tour-spotlight-ring" x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={rect.radius} fill="none" stroke="var(--color-world)" strokeWidth="2" />}
  </svg>;
}
