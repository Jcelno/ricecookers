import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { ViewState } from "./GlobeView";

/**
 * Graticule tapes: two instrument-style scales that read out the latitude and
 * longitude under the centre of the view and slide as the globe turns.
 * They are drawn straight to canvas on every camera move (no React renders).
 */
export interface TapesHandle { draw: (v: ViewState) => void }

const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 45, 90];
const INK = "rgba(246,242,233,";

function pickStep(degPerPx: number, minPx: number) {
  for (const s of STEPS) if (s / degPerPx >= minPx) return s;
  return 90;
}

function label(v: number, step: number, pos: string, neg: string) {
  const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const a = Math.abs(v);
  if (a < step / 2) return "0°";
  return `${a.toFixed(dec)}°${v > 0 ? pos : neg}`;
}

export const Tapes = forwardRef<TapesHandle, { inset?: { left: number; right: number } }>(function Tapes({ inset }, ref) {
  const lonC = useRef<HTMLCanvasElement>(null);
  const latC = useRef<HTMLCanvasElement>(null);
  const last = useRef<ViewState | null>(null);

  const draw = (v: ViewState) => {
    last.current = v;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const font = '500 11px "IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif';

    // ---- longitude tape (bottom) ----
    const c1 = lonC.current;
    if (c1) {
      const w = c1.clientWidth;
      const h = c1.clientHeight;
      if (c1.width !== Math.round(w * dpr) || c1.height !== Math.round(h * dpr)) {
        c1.width = Math.round(w * dpr);
        c1.height = Math.round(h * dpr);
      }
      const g = c1.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      // longitude degrees shrink toward the poles on screen
      const dpp = v.degPerPx / Math.max(0.05, Math.cos((v.lat * Math.PI) / 180));
      const major = pickStep(dpp, 64);
      const minor = major / 5;
      const cx = w / 2;
      const half = (w / 2) * dpp;
      g.font = font;
      g.textAlign = "center";
      g.textBaseline = "top";
      const first = Math.ceil((v.lon - half) / minor) * minor;
      for (let x = first; x <= v.lon + half; x += minor) {
        const px = cx + (x - v.lon) / dpp;
        const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
        const fade = 1 - Math.min(1, Math.abs(px - cx) / (w / 2)) ** 3;
        g.strokeStyle = `${INK}${(isMajor ? 0.7 : 0.32) * fade})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(Math.round(px) + 0.5, 0);
        g.lineTo(Math.round(px) + 0.5, isMajor ? 8 : 4);
        g.stroke();
        if (isMajor) {
          let lon = ((((x + 180) % 360) + 360) % 360) - 180;
          if (Math.abs(lon + 180) < 1e-6) lon = 180;
          g.fillStyle = `${INK}${0.78 * fade})`;
          g.fillText(Math.abs(Math.abs(lon) - 180) < 1e-6 ? "180°" : label(lon, major, "E", "W"), px, 11);
        }
      }
      g.fillStyle = `${INK}0.95)`;
      g.beginPath();
      g.moveTo(cx - 4, 0);
      g.lineTo(cx + 4, 0);
      g.lineTo(cx, 5);
      g.closePath();
      g.fill();
    }

    // ---- latitude tape (left) ----
    const c2 = latC.current;
    if (c2) {
      const w = c2.clientWidth;
      const h = c2.clientHeight;
      if (c2.width !== Math.round(w * dpr) || c2.height !== Math.round(h * dpr)) {
        c2.width = Math.round(w * dpr);
        c2.height = Math.round(h * dpr);
      }
      const g = c2.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const dpp = v.degPerPx;
      const major = pickStep(dpp, 52);
      const minor = major / 5;
      const cy = h / 2;
      const half = (h / 2) * dpp;
      g.font = font;
      g.textAlign = "left";
      g.textBaseline = "middle";
      const first = Math.ceil((v.lat - half) / minor) * minor;
      for (let y = first; y <= v.lat + half; y += minor) {
        if (y > 90 + 1e-6 || y < -90 - 1e-6) continue;
        const py = cy - (y - v.lat) / dpp;
        const isMajor = Math.abs(y / major - Math.round(y / major)) < 1e-6;
        const fade = 1 - Math.min(1, Math.abs(py - cy) / (h / 2)) ** 3;
        g.strokeStyle = `${INK}${(isMajor ? 0.7 : 0.32) * fade})`;
        g.beginPath();
        g.moveTo(0, Math.round(py) + 0.5);
        g.lineTo(isMajor ? 8 : 4, Math.round(py) + 0.5);
        g.stroke();
        if (isMajor) {
          g.fillStyle = `${INK}${0.78 * fade})`;
          g.fillText(label(y, major, "N", "S"), 12, py);
        }
      }
      g.fillStyle = `${INK}0.95)`;
      g.beginPath();
      g.moveTo(0, cy - 4);
      g.lineTo(0, cy + 4);
      g.lineTo(5, cy);
      g.closePath();
      g.fill();
    }
  };

  useImperativeHandle(ref, () => ({ draw }), []);

  useEffect(() => {
    const redraw = () => last.current && draw(last.current);
    const ro = new ResizeObserver(redraw);
    if (lonC.current) ro.observe(lonC.current);
    if (latC.current) ro.observe(latC.current);
    document.fonts?.ready.then(redraw);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
      <div className="absolute inset-y-0 w-24 bg-gradient-to-r from-black/60 to-transparent" style={{ left: inset?.left ?? 0 }} />
      {/* canvases need a sized wrapper: a replaced element does not stretch between two offsets */}
      <div className="absolute bottom-1 h-7" style={{ left: (inset?.left ?? 0) + 64, right: (inset?.right ?? 0) + 64 }}>
        <canvas ref={lonC} className="block size-full" />
      </div>
      <div className="absolute top-14 bottom-14 w-16" style={{ left: inset?.left ?? 0 }}>
        <canvas ref={latC} className="block size-full" />
      </div>
    </div>
  );
});
