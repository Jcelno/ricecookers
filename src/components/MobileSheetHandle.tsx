import { useRef } from "react";
const SNAPS = [25, 60, 100] as const;
export type SheetSnap = typeof SNAPS[number];
export function MobileSheetHandle({ snap, onSnap }: { snap: SheetSnap; onSnap: (snap: SheetSnap) => void }) {
  const drag = useRef<{ y: number; height: number; available: number; panel: HTMLElement } | null>(null);
  const dragged = useRef(false);
  const move = (direction: number) => onSnap(SNAPS[Math.max(0, Math.min(2, SNAPS.indexOf(snap) + direction))]);
  return <button type="button" role="slider" aria-label="Location panel height" aria-valuemin={25} aria-valuemax={100} aria-valuenow={snap} aria-valuetext={`${snap}% of the map area`} className="mobile-sheet-handle" title="Drag to resize; arrow keys change height"
    onPointerDown={event => {
      const panel = event.currentTarget.closest("aside")!;
      drag.current = { y: event.clientY, height: panel.clientHeight, available: panel.parentElement!.clientHeight, panel };
      dragged.current = false; event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => { const start = drag.current; if (!start) return; const delta = event.clientY - start.y; if (Math.abs(delta) > 7) dragged.current = true; if (dragged.current) start.panel.style.transform = `translateY(${Math.max(-(start.available - start.height), Math.min(start.height - start.available * .25, delta))}px)`; }}
    onPointerUp={event => { const start = drag.current; if (!start) return; start.panel.style.transform = ""; if (dragged.current) { const percent = (start.height - (event.clientY - start.y)) / start.available * 100; onSnap(SNAPS.reduce((a, b) => Math.abs(b - percent) < Math.abs(a - percent) ? b : a)); } drag.current = null; }}
    onPointerCancel={() => { if (drag.current) drag.current.panel.style.transform = ""; drag.current = null; }}
    onClick={() => { if (dragged.current) { dragged.current = false; return; } onSnap(SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length]); }}
    onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); move(event.key === "ArrowUp" ? 1 : -1); } if (event.key === "Home" || event.key === "End") { event.preventDefault(); onSnap(event.key === "Home" ? 25 : 100); } }}>
    <span aria-hidden="true" /><span className="sr-only">Drag or use arrow keys to resize the location panel</span>
  </button>;
}
