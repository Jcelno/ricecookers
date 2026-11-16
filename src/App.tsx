import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { CaveatFooter, SkipLinks } from "@/components/AccessibilityChrome";
import { BootPanel } from "@/components/BootPanel";
import { CompareTray } from "@/components/CompareTray";
import { KeyboardControls } from "@/components/KeyboardControls";
import { MobileSheetHandle, type SheetSnap } from "@/components/MobileSheetHandle";
import { StartScreen } from "@/components/start/StartScreen";
import { TopBar } from "@/components/TopBar";
import { cx, IconButton, Spinner } from "@/components/ui/primitives";
import { useBoot, useBootRetry } from "@/lib/boot";
import { applyLink, startLinkSync } from "@/lib/deeplink";
import { useStore } from "@/store";

// Everything below loads on demand. The start screen needs none of it, so the first paint never waits
// for a map engine (CesiumJS alone is over 1 MB compressed).
const Stage = lazy(() => import("@/components/map/Stage").then((m) => ({ default: m.Stage })));
const LayersPanel = lazy(() => import("@/components/panels/LayersPanel").then(m => ({ default: m.LayersPanel })));
const LocationPanel = lazy(() => import("@/components/panels/LocationPanel").then(m => ({ default: m.LocationPanel })));
const MissionPanel = lazy(() => import("@/components/panels/MissionPanel").then(m => ({ default: m.MissionPanel })));
const SavedView = lazy(() => import("@/components/saved/SavedView").then(m => ({ default: m.SavedView })));
const TwinView = lazy(() => import("@/components/twin/TwinView").then((m) => ({ default: m.TwinView })));
const NearView = lazy(() => import("@/components/near/NearView").then((m) => ({ default: m.NearView })));
const CompareView = lazy(() => import("@/components/compare/CompareView").then((m) => ({ default: m.CompareView })));
const Methodology = lazy(() => import("@/components/sheets/Methodology"));
const Sources = lazy(() => import("@/components/sheets/Sources"));
const BriefSheet = lazy(() => import("@/components/sheets/Brief"));
const Scenarios = lazy(() => import("@/components/sheets/Scenarios"));
const MissionReport = lazy(() => import("@/components/sheets/MissionReport"));
const Help = lazy(() => import("@/components/sheets/Help"));
const Findings = lazy(() => import("@/components/sheets/Findings"));
const OfflineDemo = lazy(() => import("@/components/OfflineDemo"));
const CoachMarks = lazy(() => import("@/components/flow/CoachMarks"));
const DemoPlayer = lazy(() => import("@/components/flow/DemoPlayer"));

function Side({ side, open, children, label }: { side: "left" | "right"; open: boolean; children: React.ReactNode; label: string }) {
  const setPanel = useStore((s) => s.setPanel);
  const left = side === "left";
  const [snap, setSnap] = useState<SheetSnap>(60);
  return (
    <>
      <aside
        aria-label={label}
        style={!left ? { "--location-sheet-height": `${snap}%` } as React.CSSProperties : undefined}
        data-tour={label === "Mission panel" ? "mission" : label === "Layers panel" ? "layers" : "location"}
        hidden={!open}
        className={cx(
          "surface scroll z-20 h-full shrink-0",
          !left && "location-side",
          left ? "hair-r w-[var(--rail-w)]" : "hair-l w-[var(--panel-w)]",
          // on narrow screens panels float over the map instead of squeezing it
          "max-lg:absolute max-lg:top-0 max-lg:bottom-0 max-lg:shadow-[var(--shadow-float)]",
          left ? "max-lg:left-0 max-sm:w-[min(var(--rail-w),88vw)]" : "max-lg:right-0 max-sm:top-auto max-sm:h-[58%] max-sm:w-full max-sm:border-t max-sm:border-[var(--hair-strong)]",
        )}
      >
        {!left && <MobileSheetHandle snap={snap} onSnap={setSnap} />}
        {children}
      </aside>
      <div className={cx("pointer-events-none absolute top-3 z-30", left ? (open ? "left-[calc(var(--rail-w)+12px)] max-sm:left-[calc(min(var(--rail-w),88vw)+8px)]" : "left-3") : open ? "right-[calc(var(--panel-w)+56px)] max-sm:right-14" : "right-14")}>
        <div className="surface-float pointer-events-auto rounded-md ring-1 ring-[var(--hair)]">
          <IconButton label={`${open ? "Hide" : "Show"} the ${label.toLowerCase()}`} onClick={() => setPanel(side, !open)}>
            {left ? (open ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />) : open ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </IconButton>
        </div>
      </div>
    </>
  );
}

const Loading = ({ label }: { label: string }) => <div className="grid flex-1 place-items-center"><Spinner label={label} /></div>;

export default function App() {
  const meta = useStore((s) => s.meta);
  const init = useStore((s) => s.init);
  const started = useStore((s) => s.started);
  const mode = useStore((s) => s.mode);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const sheet = useStore((s) => s.sheet);
  const demo = useStore((s) => s.demo);
  const setSheet = useStore((s) => s.setSheet);
  const boot = useBoot();

  useEffect(() => {
    void init();
  }, [init]);
  useBootRetry();
  // Restore a shared link once the app has loaded, then keep the address in sync with what is on screen.
  const ready = !!meta;
  useEffect(() => {
    if (!ready) return;
    applyLink(location.hash);
    return startLinkSync();
  }, [ready]);
  // Fetch the globe engine while the visitor reads the start screen, so the first globe opens promptly.
  useEffect(() => {
    const t = window.setTimeout(() => { void import("@/components/map/GlobeView"); }, 2500);
    return () => window.clearTimeout(t);
  }, []);
  // After 20 s without an answer the saved example is offered. It stays until the visitor leaves it,
  // even if the live service answers meanwhile: a page should not change under a reader.
  const [savedOpen, setSavedOpen] = useState(false);
  useEffect(() => {
    if (boot.phase === "saved" && started) setSavedOpen(true);
  }, [boot.phase, started]);
  const close = () => setSheet(null);

  const sheets = (
    <Suspense fallback={null}>
      {sheet === "methodology" && <Methodology onClose={close} />}
      {sheet === "sources" && <Sources onClose={close} />}
      {sheet === "help" && <Help onClose={close} />}
      {sheet === "findings" && <Findings onClose={close} />}
      {meta && sheet === "brief" && <BriefSheet onClose={close} />}
      {meta && sheet === "scenarios" && <Scenarios onClose={close} />}
      {meta && sheet === "report" && <MissionReport onClose={close} />}
    </Suspense>
  );

  if (!started) return <>{<StartScreen />}{sheets}</>;

  return (
    <div className="radium-shell flex h-full flex-col" data-mode={mode}>
      <SkipLinks />
      <TopBar />
      {meta && <KeyboardControls />}
      <main className="relative flex min-h-0 flex-1">
        {savedOpen ? (
          <Suspense fallback={<Loading label="Opening the saved example" />}><OfflineDemo live={ready} onLive={() => setSavedOpen(false)} onRetry={() => void init()} /></Suspense>
        ) : !meta ? (
          <BootPanel />
        ) : (
          <>
            <CompareTray />
            {mode === "saved" ? (<Suspense fallback={<Loading label="Opening your notebook" />}><SavedView /></Suspense>) : mode === "twin" ? (
              <Suspense fallback={<Loading label="Opening Find Earth Twins" />}><TwinView /></Suspense>
            ) : mode === "near" ? (
              <Suspense fallback={<Loading label="Opening Near Me" />}><NearView /></Suspense>
            ) : mode === "compare" ? (
              <Suspense fallback={<Loading label="Opening Compare" />}><CompareView /></Suspense>
            ) : (
              <>
                <Side side="left" open={leftOpen} label={mode === "mission" ? "Mission panel" : "Layers panel"}>
                  <Suspense fallback={<div className="p-4"><Spinner label="Opening controls" /></div>}>{mode === "mission" ? <MissionPanel /> : <LayersPanel />}</Suspense>
                </Side>
                <Suspense fallback={<div className="relative min-w-0 flex-1 bg-void" data-stage><Loading label="Loading the globe" /></div>}><Stage /></Suspense>
                <Side side="right" open={rightOpen} label="Location panel">
                  <Suspense fallback={<div className="p-4"><Spinner label="Opening the location panel" /></div>}><LocationPanel /></Suspense>
                </Side>
              </>
            )}
          </>
        )}
      </main>
      <Suspense fallback={null}>
        {meta && !savedOpen && <CoachMarks />}
        {meta && demo && !savedOpen && <DemoPlayer />}
      </Suspense>
      <CaveatFooter />
      {sheets}
    </div>
  );
}
