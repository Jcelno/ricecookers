import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";

import { Stage } from "@/components/map/Stage";
import { LayersPanel } from "@/components/panels/LayersPanel";
import { LocationPanel } from "@/components/panels/LocationPanel";
import { MissionPanel } from "@/components/panels/MissionPanel";
import { TopBar } from "@/components/TopBar";
import { TwinView } from "@/components/twin/TwinView";
import { Button, cx, IconButton, Notice, Spinner } from "@/components/ui/primitives";
import { NearView } from "@/components/near/NearView";
import { applyLink, startLinkSync } from "@/lib/deeplink";
import { useStore } from "@/store";

const Methodology = lazy(() => import("@/components/sheets/Methodology"));
const Sources = lazy(() => import("@/components/sheets/Sources"));
const Intro = lazy(() => import("@/components/sheets/Intro"));
const BriefSheet = lazy(() => import("@/components/sheets/Brief"));
const Scenarios = lazy(() => import("@/components/sheets/Scenarios"));

function Side({ side, open, children, label }: { side: "left" | "right"; open: boolean; children: React.ReactNode; label: string }) {
  const setPanel = useStore((s) => s.setPanel);
  const left = side === "left";
  return (
    <>
      <aside
        aria-label={label}
        hidden={!open}
        className={cx(
          "surface scroll z-20 h-full shrink-0",
          left ? "hair-r w-[var(--rail-w)]" : "hair-l w-[var(--panel-w)]",
          // on narrow screens panels float over the map instead of squeezing it
          "max-lg:absolute max-lg:top-0 max-lg:bottom-0 max-lg:shadow-[var(--shadow-float)]",
          left ? "max-lg:left-0 max-sm:w-[min(var(--rail-w),88vw)]" : "max-lg:right-0 max-sm:top-auto max-sm:h-[58%] max-sm:w-full max-sm:border-t max-sm:border-[var(--hair-strong)]",
        )}
      >
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

export default function App() {
  const meta = useStore((s) => s.meta);
  const metaError = useStore((s) => s.metaError);
  const init = useStore((s) => s.init);
  const mode = useStore((s) => s.mode);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const sheet = useStore((s) => s.sheet);
  const setSheet = useStore((s) => s.setSheet);

  useEffect(() => {
    void init();
  }, [init]);
  // Restore a shared link once the app has loaded, then keep the address in sync with what is on screen.
  const ready = useStore((s) => !!s.meta);
  useEffect(() => {
    if (!ready) return;
    applyLink(location.hash);
    return startLinkSync();
  }, [ready]);

  if (metaError) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md">
          <h1 className="mb-3 text-md font-semibold tracking-[0.14em] text-regolith-50">RADIUM</h1>
          <Notice tone="error" title="The data service is not running" action={<Button variant="outline" size="sm" onClick={() => void init()}>Try again</Button>}>
            {metaError}
          </Notice>
        </div>
      </div>
    );
  }
  if (!meta) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner label="Loading the Moon, Mars and Earth grids" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="relative flex min-h-0 flex-1">
        {mode === "twin" ? (
          <TwinView />
        ) : mode === "near" ? (
          <NearView />
        ) : (
          <>
            <Side side="left" open={leftOpen} label={mode === "mission" ? "Mission panel" : "Layers panel"}>
              {mode === "mission" ? <MissionPanel /> : <LayersPanel />}
            </Side>
            <Stage />
            <Side side="right" open={rightOpen} label="Location panel">
              <LocationPanel />
            </Side>
          </>
        )}
      </main>
      <Suspense fallback={null}>
        {sheet === "methodology" && <Methodology onClose={() => setSheet(null)} />}
        {sheet === "sources" && <Sources onClose={() => setSheet(null)} />}
        {sheet === "intro" && <Intro onClose={() => setSheet(null)} />}
        {sheet === "brief" && <BriefSheet onClose={() => setSheet(null)} />}
        {sheet === "scenarios" && <Scenarios onClose={() => setSheet(null)} />}
      </Suspense>
    </div>
  );
}
