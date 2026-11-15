import { ArrowLeftRight, Globe2, MousePointerClick, SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Button, cx, EvidenceGlyph, GradeTile, IconButton } from "@/components/ui/primitives";
import { GRADE_HEX, GRADE_MEANING } from "@/lib/format";
import { markIntroSeen } from "@/lib/intro";
import type { Evidence, Grade } from "@/lib/types";
import { useStore } from "@/store";

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];
const EVIDENCE: Evidence[] = ["observed", "inferred", "modelled", "computed"];

function Worlds() {
  return (
    <div className="flex items-end justify-center gap-5">
      {[
        { n: "Moon", c: "radial-gradient(circle at 35% 30%, #e9ecf1, #8d939c 55%, #3b3f46)" },
        { n: "Mars", c: "radial-gradient(circle at 35% 30%, #f2b48a, #b8603a 55%, #4a2214)" },
        { n: "Earth", c: "radial-gradient(circle at 35% 30%, #9fd8ef, #2f7aa6 50%, #173a2c 80%)" },
      ].map((w, i) => (
        <div key={w.n} className="flex flex-col items-center gap-2">
          <span className="block rounded-full shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)]" style={{ background: w.c, width: 58 + i * 10, height: 58 + i * 10 }} />
          <span className="placename text-sm text-regolith-200">{w.n}</span>
        </div>
      ))}
    </div>
  );
}

function PickDemo() {
  return (
    <div className="w-full max-w-[260px] space-y-3">
      <div className="inline-flex rounded-md bg-basalt-950/70 p-0.5 ring-1 ring-[var(--hair)]">
        {["Moon", "Mars", "Earth"].map((w, i) => (
          <span key={w} className={cx("rounded-sm px-3 py-1 text-xs font-medium", i === 1 ? "bg-[#e7935a] text-basalt-950" : "text-regolith-300")}>{w}</span>
        ))}
      </div>
      <div className="flex items-center gap-2.5 text-xs text-regolith-300"><Globe2 size={16} className="text-regolith-100" /> Drag to spin, scroll to zoom</div>
      <div className="flex items-center gap-2.5 text-xs text-regolith-300"><MousePointerClick size={16} className="text-regolith-100" /> Click a spot to inspect it</div>
    </div>
  );
}

function EvidenceDemo() {
  const meta = useStore((s) => s.meta);
  return (
    <ul className="w-full max-w-[260px] space-y-2">
      {EVIDENCE.map((e) => (
        <li key={e} className="flex items-baseline gap-2.5 text-xs">
          <span className="text-regolith-100"><EvidenceGlyph kind={e} size={12} /></span>
          <span><span className="font-medium text-regolith-50">{meta?.evidence[e].label ?? e}</span></span>
        </li>
      ))}
      <li className="flex items-baseline gap-2.5 text-xs text-regolith-400"><span className="w-3 text-center">–</span><span className="italic">Data unavailable</span></li>
    </ul>
  );
}

function GradeDemo() {
  return (
    <div className="w-full max-w-[280px]">
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={16} className="text-regolith-100" />
        <span className="h-1 flex-1 rounded-full bg-basalt-700"><span className="block h-1 w-2/3 rounded-full bg-[#e7935a]" /></span>
      </div>
      <ul className="mt-4 space-y-1.5">
        {GRADES.map((g) => (
          <li key={g} className="flex items-center gap-2.5 text-xs text-regolith-200"><GradeTile grade={g} size="sm" /> {GRADE_MEANING[g]}</li>
        ))}
      </ul>
    </div>
  );
}

function TwinDemo() {
  return (
    <div className="w-full max-w-[280px] space-y-3 text-xs text-regolith-200">
      <div className="flex items-center gap-2.5">
        <span className="grid size-6 place-items-center rounded-full border-2 border-basalt-950 text-[11px] font-semibold text-basalt-950" style={{ background: GRADE_HEX.A }}>1</span>
        Closest matches, numbered and graded
      </div>
      <div className="flex items-center gap-2.5">
        <span className="grid size-6 place-items-center"><span className="block size-3 rotate-45 rounded-[2px] border-[1.5px] border-basalt-950 shadow-[0_0_0_1.5px_rgb(246_242_233/0.85)]" style={{ background: GRADE_HEX.B }} /></span>
        Known analog sites, coloured by grade
      </div>
      <div className="flex items-center gap-2.5"><ArrowLeftRight size={16} className="text-regolith-100" /> Open one to compare side by side</div>
    </div>
  );
}

interface Step { title: string; body: ReactNode; visual: ReactNode }
const STEPS: Step[] = [
  {
    title: "Where should we go next?",
    body: (
      <>
        <p>RADIUM helps you judge where a permanent Moon base or a Mars mission could work, and which places on Earth are most like those sites for testing and training.</p>
        <p>Every value comes from real measurements by NASA and partner agencies. Where no data exists, RADIUM says so instead of guessing.</p>
      </>
    ),
    visual: <Worlds />,
  },
  {
    title: "Pick a world, then a place",
    body: (
      <>
        <p>Switch between the Moon, Mars and Earth at the top left. The globes are real orbital imagery: drag to spin, scroll to zoom.</p>
        <p>Click anywhere and the right-hand panel shows what is known about that spot, with photographs of the terrain where they exist. Pins mark landing sites and named craters; click one to jump there.</p>
      </>
    ),
    visual: <PickDemo />,
  },
  {
    title: "Every number shows how we know it",
    body: (
      <>
        <p>Each measurement has a small marker. Observed values were measured by a spacecraft; modelled ones come from a climate model; computed ones are worked out by RADIUM from other data.</p>
        <p>Click any row to see its source, resolution and limits. The Layers panel on the left paints any of these values across the whole globe.</p>
      </>
    ),
    visual: <EvidenceDemo />,
  },
  {
    title: "Design a mission",
    body: (
      <>
        <p>Open Mission Planner and choose a lunar base, a robotic Mars landing or a crewed Mars mission. Move the sliders to say what matters most, such as sunlight, water ice or safe landing.</p>
        <p>Every place is regraded from A to F as you go, the globe recolours, and the best sites are listed and numbered.</p>
      </>
    ),
    visual: <GradeDemo />,
  },
  {
    title: "Find a site's Earth twins",
    body: (
      <>
        <p>Open Earth Analogs, pick a Moon or Mars site and say what the analog is for, such as rover testing or drilling for ice. RADIUM compares it with every land area on Earth.</p>
        <p>Open a match to see what is alike, what is not, and where Earth simply cannot copy the Moon or Mars, such as gravity and air pressure.</p>
      </>
    ),
    visual: <TwinDemo />,
  },
];

export default function Intro({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const { setMode, setBody } = useStore.getState();
  const last = i === STEPS.length - 1;
  const close = () => { markIntroSeen(); onClose(); };

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (fn: () => void) => { close(); fn(); };
  const s = STEPS[i];
  return (
    <div className="anim-fade fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="intro-title"
        className="anim-sheet surface relative grid w-full max-w-[860px] overflow-hidden rounded-lg shadow-[var(--shadow-float)] outline-none md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="intro-stage relative flex min-h-[200px] items-center justify-center px-8 py-10 max-md:min-h-[170px] max-md:py-7">
          <div key={i} className="anim-rise flex w-full justify-center">{s.visual}</div>
        </div>
        <div className="flex min-h-[380px] flex-col px-7 pt-6 pb-5 max-md:min-h-0">
          <div className="flex items-center justify-between">
            <span className="tnum text-xs text-regolith-400">Step {i + 1} of {STEPS.length}</span>
            <IconButton label="Close the guide" onClick={close} className="-mr-2"><X size={17} /></IconButton>
          </div>
          <div key={i} className="anim-rise mt-2 flex-1">
            <h2 id="intro-title" className="font-serif text-[1.85rem] leading-[1.1] font-medium tracking-[-0.03em] text-regolith-50" style={{ fontVariationSettings: '"opsz" 48' }}>{s.title}</h2>
            <div className="mt-3 max-w-[52ch] space-y-2.5 text-sm leading-[1.7] text-regolith-200">{s.body}</div>
          </div>
          {last && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Button variant="solid" size="sm" onClick={() => go(() => { setBody("moon"); setMode("explore"); })}>Explore the Moon</Button>
              <Button variant="outline" size="sm" onClick={() => go(() => setMode("mission"))}>Design a mission</Button>
              <Button variant="outline" size="sm" onClick={() => go(() => { setBody("mars"); setMode("twin"); })}>Find an Earth twin</Button>
            </div>
          )}
          <div className="mt-5 flex items-center gap-3">
            <div className="flex gap-1.5" aria-hidden="true">
              {STEPS.map((_, k) => <span key={k} className={cx("block h-1.5 rounded-full", k === i ? "w-5 bg-world" : "w-1.5 bg-basalt-600")} />)}
            </div>
            <div className="ml-auto flex gap-1.5">
              {i > 0 && <Button size="sm" onClick={() => setI(i - 1)}>Back</Button>}
              {!last ? <Button size="sm" variant="solid" onClick={() => setI(i + 1)}>Next</Button> : <Button size="sm" onClick={close}>Close</Button>}
              {i === 0 && <Button size="sm" onClick={close}>Skip</Button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
