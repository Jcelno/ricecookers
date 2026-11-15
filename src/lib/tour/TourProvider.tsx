import { ArrowRight, Check, Compass, Play, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store";
import { loadTourProgress, markHintSeen, markIntroSeen, QUICK_IDS, readHints, saveTourProgress, type TourProgress } from "@/lib/intro";
import { emitTour, onTour, type TourSignal } from "./events";
import { CHAPTER_ORDER, CHAPTERS, TOUR_STEPS, type Chapter } from "./steps";
import { CoachMark } from "./CoachMark";
import { findTourTarget, focusTourTarget, Spotlight, useTargetRect } from "./Spotlight";
import "./tour.css";

export function pathSteps(path: TourProgress["path"]) {
  return path === "quick" ? QUICK_IDS.map((id) => TOUR_STEPS.find((step) => step.id === id)!).filter(Boolean) : CHAPTER_ORDER.flatMap((chapter) => TOUR_STEPS.filter((step) => step.chapter === chapter));
}
function useModalFocus(ref: React.RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => (ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>("button,input,select,a[href]"))?.focus());
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]')].filter((node) => node.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", trap); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open, ref]);
}

const HINTS = {
  mission: { target: "mission", title: "Try one priority", body: "First time here? Open Priorities and move one slider to see why the candidate ranking changes." },
  compare: { target: "comparison", title: "Keep a useful comparison", body: "First time here? Add places from Explore, then compare their measurements side by side." },
  near: { target: "near-settings", title: "Start with coordinates", body: "First time here? Enter coordinates to find nearby field sites. Your location stays out of shared links." },
  saved: { target: "saved", title: "Make a research collection", body: "First time here? Open a saved record's name and collection controls to organize your fieldwork." },
} as const;

export default function TourProvider() {
  const sheet = useStore((s) => s.sheet);
  const mode = useStore((s) => s.mode);
  const current = useStore();
  const [progress, setProgress] = useState<TourProgress>(loadTourProgress);
  const [welcome, setWelcome] = useState(false);
  const [running, setRunning] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [finish, setFinish] = useState(false);
  const [topics, setTopics] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [signals, setSignals] = useState<TourSignal[]>([]);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [chapterBadge, setChapterBadge] = useState<string | null>(null);
  const [seenHints, setSeenHints] = useState(readHints);
  const modalRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const steps = useMemo(() => pathSteps(progress.path), [progress.path]);
  const step = steps.find((item) => item.id === progress.stepId) ?? steps[0];
  const position = steps.indexOf(step) + 1;
  const rect = useTargetRect(running && !minimized && !topics ? step.target : null);
  const hintId = mode in HINTS && !seenHints.includes(mode) ? mode as keyof typeof HINTS : null;
  const hint = hintId ? HINTS[hintId] : null;
  const hintRect = useTargetRect(!running && !welcome && !finish && hint ? hint.target : null);
  const save = useCallback((next: TourProgress) => { setProgress(next); saveTourProgress(next); }, []);
  const stop = useCallback(() => {
    clearTimeout(advanceTimer.current); markIntroSeen(); setWelcome(false); setRunning(false); setFinish(false); setTopics(false); setMinimized(false); useStore.getState().setSheet(null);
  }, []);
  useModalFocus(modalRef, welcome || finish);
  useModalFocus(drawerRef, topics);

  useEffect(() => {
    if (sheet === "intro") { setWelcome(true); setRunning(false); setMinimized(false); setFinish(false); setTopics(false); }
  }, [sheet]);
  useEffect(() => { emitTour("tutorial:changed", { running, welcome, stepId: progress.stepId, completed: progress.completed }); }, [running, welcome, progress]);
  useEffect(() => () => { emitTour("tutorial:changed", { running: false, welcome: false }); clearTimeout(advanceTimer.current); }, []);

  const start = (path: TourProgress["path"], resume = false) => {
    const list = pathSteps(path);
    const savedId = resume && list.some((item) => item.id === progress.stepId) ? progress.stepId : list.find((item) => !progress.completed.includes(item.id))?.id ?? list[0].id;
    save({ ...progress, path, stepId: savedId, finished: false }); setWelcome(false); setFinish(false); setMinimized(false); setRunning(true); setDoneId(null); useStore.getState().setSheet(null);
  };
  const advance = useCallback((direction = 1) => {
    clearTimeout(advanceTimer.current);
    const index = steps.findIndex((item) => item.id === progress.stepId);
    const next = steps[index + direction];
    if (!next && direction > 0) {
      setRunning(false); setFinish(true); setTopics(false); markIntroSeen(); save({ ...progress, finished: true }); return;
    }
    if (next) {
      const chapter = TOUR_STEPS.filter((item) => item.chapter === step.chapter);
      setChapterBadge(next.chapter !== step.chapter && chapter.every((item) => progress.completed.includes(item.id)) ? CHAPTERS[step.chapter] : null);
      save({ ...progress, stepId: next.id }); setDoneId(null); setSignals([]);
    }
  }, [progress, save, steps, step.chapter]);
  const complete = useCallback((events: TourSignal[]) => {
    setSignals(events); setDoneId(step.id);
    if (!progress.completed.includes(step.id)) save({ ...progress, completed: [...progress.completed, step.id] });
  }, [progress, save, step.id]);

  useEffect(() => {
    if (!running || minimized || topics) return;
    setDoneId(null); setSignals([]); setCanSkip(false);
    step.prepare?.(useStore.getState());
    // Preparing makes controls reachable, but never simulates their action events.
    if (step.satisfied?.(useStore.getState())) complete([]);
    const skip = setTimeout(() => setCanSkip(true), step.skippableAfterMs ?? 6000);
    return () => clearTimeout(skip);
    // A step is prepared once on entry, not every time a store result arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, running, minimized, topics]);
  useEffect(() => {
    if (!running || minimized || topics || doneId === step.id) return;
    const required = Array.isArray(step.waitFor) ? step.waitFor : step.waitFor ? [step.waitFor] : [];
    const heard: TourSignal[] = [];
    return onTour((event) => {
      if (!required.includes(event.type)) return;
      if (event.type === "widget:answered" && event.payload.id !== step.id) return;
      if (step.accepts && !step.accepts(event, useStore.getState())) return;
      heard.push(event);
      if (required.every((name) => heard.some((item) => item.type === name))) complete(heard);
    });
  }, [running, minimized, topics, doneId, step, complete]);
  const successReady = step.widget !== "slider-hint" || (current.rankStatus === "ready" && Object.entries(current.rawWeights[current.missionId] ?? {}).every(([id, value]) => current.lastRanked?.weights[id] === value));
  useEffect(() => {
    if (!running || minimized || topics || doneId !== step.id || step.autoAdvance === false || !successReady) return;
    advanceTimer.current = setTimeout(() => advance(), 950);
    return () => clearTimeout(advanceTimer.current);
  }, [doneId, running, minimized, topics, step.id, step.autoAdvance, successReady, advance]);
  useEffect(() => {
    if (!running || step.id !== "analogy-breaks" || current.compare || current.compareStatus === "loading") return;
    const candidate = current.twin?.candidates[0];
    if (candidate) { void current.pickEarth(candidate.lat, candidate.lon).then(() => useStore.getState().setMode("compare")); }
  }, [running, step.id, current.twin, current.compare, current.compareStatus]);
  useEffect(() => {
    if (!running && !welcome && !finish && !topics) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation(); markIntroSeen();
        if (topics) setTopics(false); else if (welcome || finish || minimized) stop(); else setMinimized(true);
      } else if (event.altKey && running && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        event.preventDefault(); event.stopImmediatePropagation(); advance(event.key === "ArrowRight" ? 1 : -1);
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => document.removeEventListener("keydown", keyboard, true);
  }, [running, welcome, finish, topics, minimized, advance, stop]);

  const restartChapter = (chapter: Chapter) => {
    const ids = TOUR_STEPS.filter((item) => item.chapter === chapter).map((item) => item.id);
    save({ path: "full", stepId: ids[0], completed: progress.completed.filter((id) => !ids.includes(id)) }); setTopics(false); setDoneId(null); setMinimized(false); setRunning(true);
  };
  const success = doneId === step.id ? step.success?.(current, signals) ?? "Done. Your action is reflected in the live application." : null;
  const dismissHint = () => { if (hintId) { markHintSeen(hintId); setSeenHints(readHints()); } };
  return <>
    <div className="sr-only" aria-live="polite" aria-atomic="true">{running ? `${CHAPTERS[step.chapter]}. Step ${position} of ${steps.length}: ${step.title}. ${success ?? step.prompt ?? step.body}` : finish ? "You're set. Tour finished." : ""}</div>
    {welcome && <div className="tour-modal-backdrop" data-tour-overlay="welcome"><div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="tutorial-title" className="tour-welcome" data-tour-welcome="true">
      <button className="tour-close" aria-label="Close tutorial" onClick={stop}><X size={19} /></button><span className="tour-welcome-emblem"><Compass size={26} /></span>
      <p className="tour-welcome-kicker">Your first field expedition</p><h1 id="tutorial-title">Find where humanity should land, and where on Earth to practise first.</h1><p>Follow the real data. Try the real controls. Keep the questions that matter.</p>
      <div className="tour-choices"><button data-autofocus="true" className="tour-choice recommended" onClick={() => start("quick")}><span><strong>Quick tour</strong><span className="tour-recommended">Recommended</span></span><small>About 2 minutes · 7 things to try</small><ArrowRight size={20} /></button><button className="tour-choice" onClick={() => start("full")}><strong>Full field guide</strong><small>About 10 minutes · 6 chapters</small><ArrowRight size={18} /></button><button className="tour-choice" onClick={() => { setDontShow(true); stop(); }}><strong>Explore on my own</strong><small>Help keeps your place when you're ready.</small><ArrowRight size={18} /></button></div>
      {(progress.completed.length > 0 || progress.stepId !== "pick-world") && <button data-tour-resume="true" className="tour-resume" onClick={() => start(progress.path, true)}><Play size={13} />Resume: {TOUR_STEPS.find((item) => item.id === progress.stepId)?.title ?? "your tour"}</button>}
      <div className="tour-welcome-footer"><label><input type="checkbox" checked={dontShow} onChange={(event) => setDontShow(event.target.checked)} />Don't show this again</label><button onClick={stop}>Skip tour</button></div>
    </div></div>}
    {running && !minimized && !topics && <><Spotlight rect={rect} /><CoachMark step={step} rect={rect} position={position} total={steps.length} completed={steps.filter((item) => progress.completed.includes(item.id)).map((item) => item.id)} success={success} canSkip={canSkip} chapterBadge={chapterBadge} onBack={() => advance(-1)} onSkip={() => advance()} onShow={() => { step.prepare?.(useStore.getState()); requestAnimationFrame(() => focusTourTarget(step.target)); }} onExit={stop} onMinimize={() => setMinimized(true)} onTopics={() => setTopics(true)} /></>}
    {running && minimized && <div className="tour-minimized" data-tour-overlay="pill"><button onClick={() => setMinimized(false)}><Play size={14} />Tour · {position}/{steps.length} ▸</button><button aria-label="Exit tour" onClick={stop}><X size={14} /></button></div>}
    {running && topics && <div className="tour-modal-backdrop" data-tour-overlay="topics"><div ref={drawerRef} role="dialog" aria-modal="true" aria-label="Tutorial topics" className="tour-topic-drawer"><div className="tour-topic-header"><h2>Field guide</h2><button aria-label="Close topic list" onClick={() => setTopics(false)}><X size={18} /></button></div>{CHAPTER_ORDER.map((chapter) => { const chapterSteps = TOUR_STEPS.filter((item) => item.chapter === chapter); const count = chapterSteps.filter((item) => progress.completed.includes(item.id)).length; return <section key={chapter}><div className="tour-chapter-heading"><h3>{CHAPTERS[chapter]}</h3><span>{Math.round(count / chapterSteps.length * 100)}%</span><button onClick={() => restartChapter(chapter)} aria-label={`Restart ${CHAPTERS[chapter]}`} title="Restart chapter"><RotateCcw size={13} /></button></div>{chapterSteps.map((item) => <button className="tour-topic" key={item.id} aria-current={item.id === step.id ? "step" : undefined} onClick={() => { save({ ...progress, path: "full", stepId: item.id }); setTopics(false); setDoneId(null); }}><span>{progress.completed.includes(item.id) ? <Check size={14} /> : <span className="tour-topic-dot" />}</span>{item.title}</button>)}{count === chapterSteps.length && <p className="tour-chapter-badge"><Check size={13} />Chapter complete</p>}</section>; })}</div></div>}
    {finish && <div className="tour-modal-backdrop" data-tour-overlay="finish"><div ref={modalRef} className="tour-finish" role="dialog" aria-modal="true" aria-labelledby="tour-finish-title" data-tour-finish="true"><button className="tour-close" aria-label="Close tutorial" onClick={stop}><X size={19} /></button><span className="tour-welcome-emblem"><Check size={27} /></span><h2 id="tour-finish-title">You're set.</h2><p>You know how to read a place, follow its evidence and keep a useful discovery.</p><div className="tour-finish-links"><button data-autofocus onClick={() => start("full")}><Compass size={16} />Full field guide</button><button onClick={() => { stop(); useStore.getState().setMode("mission"); }}>Mission Planner<ArrowRight size={16} /></button><button onClick={() => { stop(); document.querySelector<HTMLButtonElement>('[data-tour="catalog-button"]')?.click(); }}>Research Sites<ArrowRight size={16} /></button><button onClick={() => { stop(); window.dispatchEvent(new CustomEvent("radium:shortcuts")); }}>Keyboard shortcuts<span>?</span></button></div><button className="tour-finish-primary" onClick={stop}>Keep exploring</button></div></div>}
    {!welcome && !running && !finish && hint && hintId && <aside className="tour-context-hint" data-tour-overlay="hint" role="status" style={innerWidth >= 640 && hintRect ? { left: Math.max(16, Math.min(hintRect.x + 16, innerWidth - 320)), top: Math.max(145, Math.min(hintRect.y + 24, innerHeight - 180)) } : undefined}><button aria-label="Dismiss first-time hint" className="tour-close" onClick={dismissHint}><X size={15} /></button><strong>{hint.title}</strong><p>{hint.body}</p><button onClick={() => { if (hintId === "mission") useStore.getState().setMissionStep("priorities"); const node = findTourTarget(hint.target); node?.scrollIntoView({ block: "nearest" }); focusTourTarget(hint.target); dismissHint(); }}>Show me</button><button onClick={dismissHint}>Got it</button></aside>}
  </>;
}
