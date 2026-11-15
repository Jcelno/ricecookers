import { ArrowLeft, ArrowRight, Check, ChevronDown, Hand, List, Minimize2, Move, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GradeTile } from "@/components/ui/primitives";
import { formatMeasure } from "@/lib/format";
import type { Evidence } from "@/lib/types";
import { useStore } from "@/store";
import { emitTour } from "./events";
import { CHAPTERS, type TourStep } from "./steps";
import type { TargetRect } from "./Spotlight";

function MapGesture() {
  const touch = navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
  return <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{touch ? <><circle cx="12" cy="20" r="3" /><circle cx="20" cy="12" r="3" /><path d="M8 24 3 29m0-5v5h5M24 8l5-5m-5 0h5v5" /></> : <><path d="M3 21a14 14 0 0 1 26 0M3 15v6h6m14 0h6v-6" /><circle cx="16" cy="21" r="2" /></>}</svg>;
}

function Widget({ step }: { step: TourStep }) {
  const cell = useStore((s) => s.cell);
  const meta = useStore((s) => s.meta);
  const compare = useStore((s) => s.compare);
  const change = useStore((s) => s.rank?.change?.summary);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [wrong, setWrong] = useState(false);
  const done = () => emitTour("widget:answered", { id: step.id });
  if (step.widget === "grade-legend") return <div className="tour-quiz" role="group" aria-label="Which marker means not scored?">
    <div className="tour-grade-options">{(["A", "C", "F", null] as const).map((grade) => <button key={grade ?? "none"} className="tour-grade-answer" aria-label={grade ?? "Not scored"} onClick={() => { setWrong(grade !== null); if (grade === null) done(); }}><GradeTile grade={grade} /><span>{grade ?? "Not scored"}</span></button>)}</div>
    {wrong && <p role="status">A letter is a computed score. Try the grey marker.</p>}
  </div>;
  if (step.widget === "evidence-quiz") {
    const available = cell?.groups.flatMap((g) => g.items).filter((m) => m.value !== null) ?? [];
    const measurements = [...new Map(available.map((m) => [m.evidence, m])).values()].slice(0, 3);
    const classes: Evidence[] = ["observed", "modelled", "computed", "inferred", "interpreted"];
    return <div className="tour-evidence-quiz">
      {!measurements.length && <p>Data unavailable for this cell. Select a measured location, or skip this topic.</p>}
      {measurements.map((m) => <label key={m.id} className="tour-evidence-row"><span><strong>{m.label}: {formatMeasure(m)}{m.unit && m.fmt !== "percent" ? ` ${m.unit}` : ""}</strong><small>{m.source ? meta?.sources_index[m.source]?.name ?? m.source : "RADIUM calculation"} · {m.res}</small></span>
        <select aria-label={`Evidence for ${m.label}`} value={answers[m.id] ?? ""} onChange={(event) => { const next = { ...answers, [m.id]: event.target.value }; setAnswers(next); setWrong(false); if (measurements.every((x) => next[x.id] === x.evidence)) done(); else if (event.target.value !== m.evidence) setWrong(true); }}><option value="">Match class</option>{classes.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select>
        <details><summary>Source clue</summary>{meta?.evidence[m.evidence]?.desc ?? m.desc}</details>
      </label>)}
      {wrong && <p role="status">Check the source clue; that class does not match the recorded evidence.</p>}
    </div>;
  }
  if (step.widget === "slider-hint") return <p className="tour-live-ranking" aria-live="polite">{change ?? "The actual “What changed” sentence will appear after the ranking recalculates."}</p>;
  if (step.widget === "analogy-quiz") {
    const mismatch = compare?.match.breaks_down.find((item) => /gravity|pressure|radiation/i.test(item.label));
    return <div className="tour-quiz"><div className="tour-answer-options">{[mismatch?.label ?? "Gravity", "Map zoom", "Photograph colour"].map((label, index) => <button key={label} onClick={() => { setWrong(index !== 0); if (index === 0) done(); }}>{label}</button>)}</div>{wrong ? <p role="status">Look for a physical condition that differs between worlds.</p> : mismatch && <p>{mismatch.text}</p>}</div>;
  }
  return null;
}
interface Props {
  step: TourStep; rect: TargetRect | null; position: number; total: number; completed: string[];
  success: string | null; canSkip: boolean; chapterBadge: string | null;
  onBack: () => void; onSkip: () => void; onShow: () => void; onExit: () => void; onMinimize: () => void; onTopics: () => void;
}
export function CoachMark({ step, rect, position, total, completed, success, canSkip, chapterBadge, onBack, onSkip, onShow, onExit, onMinimize, onTopics }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 350, height: 320 });
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => { const box = node.getBoundingClientRect(); setSize({ width: box.width, height: box.height }); document.documentElement.style.setProperty("--tour-dock-height", `${box.height + 8}px`); };
    const observer = new ResizeObserver(update); observer.observe(node); update();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--tour-dock-height"); };
  }, []);
  useEffect(() => { const update = () => setViewport({ width: innerWidth, height: innerHeight }); window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); }, []);
  const gap = 18, pad = 12;
  let x = (viewport.width - size.width) / 2, y = viewport.height - size.height - pad, side = "top";
  if (rect && viewport.width >= 640) {
    if ((step.placement === "right" || step.placement === "auto" || !step.placement) && rect.x + rect.width + gap + size.width <= viewport.width - pad) { x = rect.x + rect.width + gap; y = rect.y; side = "left"; }
    else if (rect.x - gap - size.width >= pad) { x = rect.x - gap - size.width; y = rect.y; side = "right"; }
    else if (rect.y + rect.height + gap + size.height <= viewport.height - pad) { x = rect.x + rect.width / 2 - size.width / 2; y = rect.y + rect.height + gap; side = "top"; }
    else { x = rect.x + rect.width / 2 - size.width / 2; y = rect.y - gap - size.height; side = "bottom"; }
  }
  x = Math.max(pad, Math.min(x, viewport.width - size.width - pad));
  y = Math.max(pad, Math.min(y, viewport.height - size.height - pad));
  return <>
    {rect && !success && <div data-tour-overlay="hint" aria-hidden="true" className={`tour-target-hint ${step.id === "move-map" ? "tour-drag-hint" : ""}`} style={{ left: step.id === "move-map" ? rect.x + rect.width / 2 - 12 : rect.x + rect.width - 13, top: step.id === "move-map" ? rect.y + rect.height / 2 - 12 : rect.y + rect.height - 13 }}>{step.id === "move-map" ? <MapGesture /> : <Hand size={23} />}</div>}
    <section ref={ref} role="dialog" aria-modal="false" aria-labelledby="tutorial-title" aria-describedby="tutorial-description" className="tour-coach" data-tour-step={step.id} data-tour-overlay="coach" data-placement={side} style={viewport.width < 640 ? undefined : { left: x, top: y }}>
      <span className="tour-arrow" aria-hidden="true" />
      <div className="tour-coach-header"><span>{CHAPTERS[step.chapter]} <span className="tour-step-count">{position} of {total}</span></span><div><button aria-label="Choose tutorial topic" title="Topics" onClick={onTopics}><List size={16} /></button><button aria-label="Minimize tour" title="Minimize" onClick={onMinimize}><Minimize2 size={15} /></button><button aria-label="Close tutorial" title="Exit tour" onClick={onExit}><X size={16} /></button></div></div>
      <div className="tour-progress" role="progressbar" aria-label="Tour progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(total, completed.length)}>{Array.from({ length: total }, (_, i) => <span key={i} className={i < position - 1 ? "past" : i === position - 1 ? "current" : ""} />)}</div>
      {chapterBadge && <p className="tour-chapter-badge"><Check size={13} />{chapterBadge} complete</p>}
      <h2 id="tutorial-title">{step.title}</h2><p id="tutorial-description">{step.body}</p>
      {success ? <div className="tour-success" role="status"><Check className="tour-success-check" size={23} /><div><strong>Done!</strong><p>{success}</p></div></div> : <><p className="tour-prompt"><span aria-hidden="true">{step.id === "move-map" ? <Move size={15} /> : <Hand size={15} />}</span>{step.prompt ?? "Try the highlighted control."}</p><Widget key={step.id} step={step} /></>}
      {step.learnMore && <details className="tour-learn"><summary>Learn more <ChevronDown size={12} /></summary><p>{step.learnMore}</p></details>}
      <div className="tour-coach-actions"><button disabled={position <= 1} onClick={onBack}><ArrowLeft size={13} />Back</button><button onClick={onShow}>Show me</button>{canSkip && !success && <button onClick={onSkip}>Skip step<ArrowRight size={13} /></button>}<button className="tour-exit" onClick={onExit}>Exit tour</button></div>
    </section>
  </>;
}
