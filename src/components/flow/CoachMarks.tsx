import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { COACH, type CoachId, coachEnabled, coachSeen, markCoachSeen } from "@/lib/coach";
import { useStore } from "@/store";

import "./flow.css";

/** Which tip, if any, the current screen calls for. Order matters: one tip at a time. */
function useDue(): CoachId | null {
  const mode = useStore((s) => s.mode);
  const results = useStore((s) => s.mode === "twin" && s.twinStep === 3 && s.twinStatus === "ready" && !!s.twin?.candidates.length);
  const lead = useStore((s) => !!s.twin?.candidates.some((c) => c.novel));
  const pair = useStore((s) => s.mode === "compare" && s.compareTab === "pair" && s.compareStatus === "ready" && !!s.compare);
  const demo = useStore((s) => s.demo);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    window.addEventListener("radium:coach-reset", again);
    window.addEventListener("radium:coach-next", again);
    return () => { window.removeEventListener("radium:coach-reset", again); window.removeEventListener("radium:coach-next", again); };
  }, []);
  void tick;
  if (demo || !coachEnabled()) return null;
  if (mode === "twin" && results) {
    if (!coachSeen("grades")) return "grades";
    if (lead && !coachSeen("new-lead")) return "new-lead";
  }
  if (pair && !coachSeen("compare")) return "compare";
  return null;
}

/** A small, non-modal tip anchored to the thing it explains. Shown once; "Got it" or Escape dismisses it. */
export default function CoachMarks() {
  const due = useDue();
  const [open, setOpen] = useState<CoachId | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; side: "left" | "top" | "bottom" } | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // A tip opens a moment after its anchor appears, so it lands on a settled screen.
  useEffect(() => {
    if (!due || open) return;
    const t = window.setTimeout(() => { if (document.querySelector(COACH[due].anchor)) { markCoachSeen(due); setOpen(due); } }, 900);
    return () => window.clearTimeout(t);
  }, [due, open]);
  const dismiss = () => { setOpen(null); setBox(null); window.dispatchEvent(new Event("radium:coach-next")); };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = document.querySelector<HTMLElement>(COACH[open].anchor);
      const w = card.current?.offsetWidth ?? 280, h = card.current?.offsetHeight ?? 80;
      if (!anchor) { setOpen(null); setBox(null); return; }
      const r = anchor.getBoundingClientRect();
      // A tip belongs beside what it explains: while that is scrolled out of view the tip waits out of sight.
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth || r.width === 0) { setBox(null); return; }
      const fit = (v: number, max: number) => Math.max(10, Math.min(v, max));
      if (r.left > w + 28 && innerWidth >= 900) setBox({ side: "left", left: r.left - w - 14, top: fit(r.top + r.height / 2 - h / 2, innerHeight - h - 10) });
      else if (r.top > h + 28) setBox({ side: "top", left: fit(r.left + r.width / 2 - w / 2, innerWidth - w - 10), top: r.top - h - 14 });
      else setBox({ side: "bottom", left: fit(r.left + r.width / 2 - w / 2, innerWidth - w - 10), top: r.bottom + 14 });
    };
    place();
    const t = window.setInterval(place, 400);
    window.addEventListener("resize", place);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", key);
    return () => { window.clearInterval(t); window.removeEventListener("resize", place); document.removeEventListener("keydown", key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <div ref={card} className="coach floating" role="status" data-coach-mark={open} data-side={box?.side ?? "left"} style={box ? { left: box.left, top: box.top } : { visibility: "hidden" }}>
      <p>{COACH[open].text}</p>
      <button type="button" className="ctl coach-ok" onClick={dismiss}>Got it</button>
      <button type="button" className="ctl coach-x" aria-label="Dismiss tip" onClick={dismiss}><X size={13} /></button>
    </div>
  );
}
