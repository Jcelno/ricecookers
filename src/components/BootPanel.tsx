import { WorldOrb, type World } from "@/components/start/WorldOrb";
import { useBoot } from "@/lib/boot";
import { useStore } from "@/store";

import "@/components/start/start.css";
import "@/components/flow/flow.css";

const REST = { moon: { lat: 6, lon: 8 }, mars: { lat: 4, lon: -62 }, earth: { lat: 18, lon: 20 } };
const Line = ({ w }: { w: string }) => <span className="skeleton" style={{ width: w, height: 10 }} />;

/**
 * Shown in place of the workspace until the data service answers: the frame and a world are on screen at
 * once, panels show skeletons instead of zeros, and the message says honestly how long the wait has been.
 */
export function BootPanel() {
  const { phase, seconds } = useBoot();
  const intent = useStore((s) => s.intent);
  const world: World = intent?.kind === "twin" ? intent.body : intent?.kind === "near" ? "earth" : "moon";
  const waking = phase !== "connecting";
  return (
    <div className="boot" data-boot={phase} data-boot-panel>
      <div className="grid-bg" aria-hidden />
      <div className="glow" aria-hidden />
      <aside className="boot-side max-lg:hidden" aria-hidden>
        <Line w="46%" /><Line w="82%" /><Line w="64%" />
        <span className="boot-gap" />
        <Line w="38%" /><Line w="90%" /><Line w="72%" /><Line w="78%" />
      </aside>
      <div className="boot-stage">
        <div className="boot-orb"><WorldOrb world={world} view={REST[world]} spin label={`${world === "moon" ? "The Moon" : world === "mars" ? "Mars" : "Earth"}, turning while data loads`} /></div>
        <p className="boot-text" role="status">
          {waking ? "Waking up the data service, usually under 15 seconds" : "Loading the Moon, Mars and Earth data"}
        </p>
        {waking && (
          <>
            <div className="boot-bar" aria-hidden><i /></div>
            <p className="mono boot-clock">{seconds} s so far. A saved example opens if it takes longer than 20 s.</p>
          </>
        )}
      </div>
      <aside className="boot-side max-md:hidden" aria-hidden>
        <Line w="58%" /><Line w="88%" />
        <span className="boot-gap" />
        <Line w="96%" /><Line w="74%" /><Line w="84%" /><Line w="66%" />
      </aside>
    </div>
  );
}
