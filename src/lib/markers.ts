import type { Grade } from "./types";
import { GRADE_HEX } from "./format";

/** Screen-space grouping: never groups separate worlds or sites hidden behind a globe. */
export function clusterPoints<
  T extends { x: number; y: number; active?: boolean },
>(points: T[], radius = 36): T[][] {
  const groups: T[][] = [];
  for (const p of points) {
    if (p.active) {
      groups.push([p]);
      continue;
    }
    const group = groups.find(
      (g) => !g[0].active && Math.hypot(g[0].x - p.x, g[0].y - p.y) < radius,
    );
    if (group) group.push(p);
    else groups.push([p]);
  }
  return groups;
}

/** Spherical mean keeps clusters near the date line and poles on their actual world. */
export function sphericalCenter(points: { lat: number; lon: number }[]): {
  lat: number;
  lon: number;
} {
  let x = 0,
    y = 0,
    z = 0;
  for (const p of points) {
    const a = (p.lat * Math.PI) / 180,
      b = (p.lon * Math.PI) / 180;
    x += Math.cos(a) * Math.cos(b);
    y += Math.cos(a) * Math.sin(b);
    z += Math.sin(a);
  }
  return {
    lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
    lon: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

export function markerButton({
  text,
  title,
  grade,
  active = false,
  cluster = false,
  color,
  ink,
  id,
}: {
  text: string;
  title: string;
  grade?: Grade | null;
  active?: boolean;
  cluster?: boolean;
  color?: string;
  ink?: string;
  id?: string;
}) {
  const el = document.createElement("button");
  el.type = "button";
  if (id) el.dataset.tourMarker = id;
  el.className = "radium-map-marker";
  el.textContent = text;
  el.title = title;
  el.setAttribute("aria-label", title);
  el.setAttribute("aria-pressed", String(active));
  if (cluster) el.dataset.cluster = "true";
  else if (grade) el.dataset.grade = grade;
  const bg = cluster
    ? "#14283d"
    : grade
      ? GRADE_HEX[grade]
      : (color ?? "#415166");
  el.style.cssText = `width:${cluster ? 36 : 28}px;height:${cluster ? 36 : 28}px;border-radius:50%;padding:0;display:grid;place-items:center;font:700 12px 'IBM Plex Sans',sans-serif;color:${grade ? "#101216" : (ink ?? "#f0f5fa")};cursor:pointer;background:${bg};border:${cluster ? "4px double" : "2px solid"} ${active ? "#fff" : "#dce5ee"};box-shadow:${active ? "0 0 0 4px #8edcff70," : ""}0 3px 9px #0009;`;
  // Avoid transform: MapLibre owns it for geographic placement.
  const restore = () => {
    el.style.outline = "";
    el.style.outlineOffset = "";
  };
  const highlight = () => {
    el.style.outline = "3px solid #a8dbff";
    el.style.outlineOffset = "3px";
  };
  el.addEventListener("mouseenter", highlight);
  el.addEventListener("mouseleave", restore);
  el.addEventListener("focus", highlight);
  el.addEventListener("blur", restore);
  return el;
}
export const motionDuration = (milliseconds: number) =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : milliseconds;

export interface FanPoint { id: string; x: number; y: number; priority?: number }
export interface FanSlot extends FanPoint { dx: number; dy: number; folded: boolean; width: number; height: number }
/** Places labels only. The x/y ground coordinates are never moved or used to change an analysis cell. */
export function placeFanMarkers(points: FanPoint[], width: number, height: number, scale = 1): FanSlot[] {
  const chipWidth = 30 * scale, chipHeight = 27 * scale, padding = 5;
  const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
  const offsets = [0, -1, 1, -2, 2, -3, 3].flatMap((column) => [[column * (chipWidth + padding), -(chipHeight + 12)] as const]);
  offsets.push(...[0, -1, 1, -2, 2, -3, 3].map(column => [column * (chipWidth + padding), -(2 * chipHeight + 19)] as const));
  return [...points].sort((a, b) => (a.priority ?? 1000) - (b.priority ?? 1000)).map(point => {
    const slot = offsets.find(([dx, dy]) => {
      const box = { left: point.x + dx - chipWidth / 2, right: point.x + dx + chipWidth / 2, top: point.y + dy - chipHeight / 2, bottom: point.y + dy + chipHeight / 2 };
      if (box.left < 8 || box.right > width - 8 || box.top < 8 || box.bottom > height - 8) return false;
      if (occupied.some(other => box.left < other.right + padding && box.right + padding > other.left && box.top < other.bottom + padding && box.bottom + padding > other.top)) return false;
      occupied.push(box);
      return true;
    });
    return { ...point, dx: slot?.[0] ?? 0, dy: slot?.[1] ?? -(chipHeight + 12), folded: !slot, width: chipWidth, height: chipHeight };
  });
}
