// Motion helpers. Every animation here is driven by a real value or real request state, moves only
// transform or opacity (or the digits of a number), can be interrupted, and collapses to the final
// state under prefers-reduced-motion.
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

export const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Count toward `value` over `ms`. When `key` changes the count starts again from `from` (a new result);
 * when only the value changes it continues from the number on screen (the same result, re-weighted).
 */
export function useCountUp(value: number | null, ms = 600, key: unknown = "", from = 0): number | null {
  const [shown, setShown] = useState<number | null>(value === null ? null : reducedMotion() ? value : from);
  const live = useRef({ frame: 0, key, shown: from });
  useEffect(() => {
    const s = live.current;
    cancelAnimationFrame(s.frame);
    if (value === null) { setShown(null); return; }
    if (reducedMotion() || ms <= 0) { s.shown = value; s.key = key; setShown(value); return; }
    const begin = s.key === key ? s.shown : from;
    s.key = key;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      s.shown = begin + (value - begin) * easeOut(t);
      setShown(s.shown);
      if (t < 1) s.frame = requestAnimationFrame(tick);
    };
    s.frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.frame);
  }, [key, value, ms, from]);
  return shown;
}

/**
 * FLIP: when the children of `ref` change order, each one glides from where it was to where it is.
 * Children are matched by their `data-flip` attribute; `signature` changes whenever the order may have.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, signature: string, ms = 350) {
  const before = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const now = new Map<string, number>();
    const items = [...host.children] as HTMLElement[];
    for (const el of items) if (el.dataset.flip) now.set(el.dataset.flip, el.offsetTop);
    if (!reducedMotion()) {
      for (const el of items) {
        const k = el.dataset.flip, was = k ? before.current.get(k) : undefined, is = k ? now.get(k) : undefined;
        if (was !== undefined && is !== undefined && was !== is) el.animate([{ transform: `translateY(${was - is}px)` }, { transform: "none" }], { duration: ms, easing: EASE_OUT });
      }
    }
    before.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}

export interface ScanState { phase: "idle" | "sweep" | "waiting" | "finish"; revealed: boolean }

/**
 * The search sweep: a line crosses the Earth map while a request is in flight.
 *
 *   - it starts when `loading` turns true and ends only after the response has arrived;
 *   - at least 900 ms, so it can be read; at most 1.6 s of travel, after which the line waits at the edge
 *     ("Still comparing…") until the data arrives;
 *   - `onProgress(p)` gets the line's position 0..1 on every frame, written straight to the DOM.
 *
 * Under reduced motion there is no sweep: results are revealed the moment they arrive.
 */
export function useScan(loading: boolean, onProgress: (p: number) => void): ScanState {
  const [state, setState] = useState<ScanState>({ phase: "idle", revealed: !loading });
  const live = useRef({ p: 0, start: 0, arrived: 0, from: 0, frame: 0, running: false });
  const report = useRef(onProgress);
  report.current = onProgress;
  useEffect(() => {
    const s = live.current;
    if (loading) {
      if (reducedMotion()) { setState({ phase: "waiting", revealed: false }); return; }
      cancelAnimationFrame(s.frame);
      s.p = 0; s.start = performance.now(); s.arrived = 0; s.running = true;
      setState({ phase: "sweep", revealed: false });
      const tick = (now: number) => {
        if (!s.running) return;
        if (!s.arrived) {
          s.p = Math.min(0.96, (now - s.start) / 1600);
          if (s.p >= 0.96) setState((old) => (old.phase === "waiting" ? old : { phase: "waiting", revealed: false }));
        } else {
          // The answer is in: finish the crossing, never before 900 ms have passed.
          const end = Math.max(s.arrived + 220, s.start + 900);
          const t = Math.min(1, (now - s.arrived) / Math.max(1, end - s.arrived));
          s.p = s.from + (1 - s.from) * easeOut(t);
          if (t >= 1) { s.running = false; report.current(1); setState({ phase: "idle", revealed: true }); return; }
        }
        report.current(s.p);
        s.frame = requestAnimationFrame(tick);
      };
      s.frame = requestAnimationFrame(tick);
    } else if (s.running && !s.arrived) {
      s.arrived = performance.now();
      s.from = s.p;
      setState({ phase: "finish", revealed: false });
    } else if (!s.running) {
      setState({ phase: "idle", revealed: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  useEffect(() => () => { live.current.running = false; cancelAnimationFrame(live.current.frame); }, []);
  return state;
}
