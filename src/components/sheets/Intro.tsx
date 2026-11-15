import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  List,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, cx, GradeTile, IconButton } from "@/components/ui/primitives";
import { loadTourProgress, markIntroSeen, saveTourProgress } from "@/lib/intro";
import { useStore } from "@/store";

type View = "explore" | "twin" | "compare" | "near" | "mission" | "saved";
interface Topic {
  title: string;
  section: string;
  text: string;
  task: string;
  target: string;
  view?: View;
  panel?: "left" | "right";
  short?: boolean;
}
const TOUR: Topic[] = [
  {
    title: "A question, three worlds",
    section: "Start here",
    short: true,
    text: "Built for the NASA Space Apps Challenge, RADIUM screens Moon and Mars regions and finds useful testing environments on Earth. It uses public data, explicit assumptions and two separate models. Its grades are RADIUM assessments, not NASA certifications.",
    task: "Select Explore in the real navigation above. This walkthrough stays open while you use the application.",
    target: "nav-explore",
    view: "explore",
  },
  {
    title: "Your four workspaces",
    section: "Start here",
    text: "Explore inspects locations; Mission Planner evaluates destinations; Earth Analogs connects Discover, Compare and Near Me; Saved keeps your research in this browser. Your planetary target follows you between the three analog tabs.",
    task: "Choose a workspace, then return to Explore. Revisit any tutorial topic using the list button below.",
    target: "navigation",
  },
  {
    title: "Switch worlds",
    section: "Explore",
    short: true,
    text: "Moon and Mars use spherical globes with planetary imagery. Earth uses a geographic map. A site's exact coordinates and the center of its analysis cell are different things.",
    task: "Choose Moon, Mars, then Earth. Return to the world you want to investigate.",
    target: "worlds",
    view: "explore",
  },
  {
    title: "Move around the map",
    section: "Explore",
    text: "Drag the globe to rotate it; drag Earth to pan. Scroll or pinch to zoom. Touch users can drag with one finger and pinch with two. Keyboard users can use zoom and reset buttons and the searchable catalog.",
    task: "Drag the map and zoom toward a region. Imagery detail is not the same as scientific resolution.",
    target: "map",
    view: "explore",
  },
  {
    title: "Use the map controls",
    section: "Explore",
    text: "Plus and minus zoom; the house resets the view; the crosshair centers your selection. Full screen enlarges the map. With a planetary data layer enabled, the split control swipes between imagery and data.",
    task: "Try Zoom in and Reset the view. Tab between controls and activate them with Enter or Space.",
    target: "map-controls",
    view: "explore",
  },
  {
    title: "Select a real place",
    section: "Explore",
    short: true,
    text: "Click or tap a marker or any point to inspect its analysis cell. The selection outline identifies the analysis area. The location panel includes measurements, scientific context and actions for other workspaces.",
    task: "Select a site on the map or through Research Sites, then inspect the location panel.",
    target: "map",
    view: "explore",
    panel: "right",
  },
  {
    title: "Read a marker honestly",
    section: "Read the science",
    text: "A neutral circle identifies an unscored place. A historical landing or documented analog provides context, not a high grade. A colored A–F marker only appears when the relevant model returned that grade.",
    task: "Open a neutral site and inspect its classification, verification status and sources.",
    target: "location",
    view: "explore",
    panel: "right",
  },
  {
    title: "A–F are calculated grades",
    section: "Read the science",
    text: "A: excellent, score ≥0.80; B: good, ≥0.65; C: moderate, ≥0.50; D: poor, ≥0.35; F: very poor, below 0.35. Mission suitability and analog similarity share this scale but answer different questions. Gray means unscored or insufficient data, never zero.",
    task: "Inspect a candidate's grade and the weights that produced it in Mission Planner.",
    target: "mission",
    view: "mission",
    panel: "left",
  },
  {
    title: "Clusters count places",
    section: "Explore",
    text: "Overlapping sites collect into numbered circles with double borders. The number counts sites; it is not a scientific score. Zooming separates the individual circles.",
    task: "Zoom out and select a numbered cluster, then zoom in until the sites separate.",
    target: "map",
    view: "explore",
  },
  {
    title: "Find research sites",
    section: "Explore",
    text: "Research Sites distinguishes historical landings, geological regions, studied candidates and terrestrial research sites. A verified record supports a documented location and research use, not its suitability. Records needing evidence review are labeled separately.",
    task: "Open Research Sites, choose a site and inspect its scientific evidence.",
    target: "catalog-button",
    view: "explore",
  },
  {
    title: "Search and filter",
    section: "Explore",
    text: "Search by name or research theme. Filter by world, classification, analog purpose and data availability. Some coordinates represent broad research regions rather than exact landing points; read their coordinate references.",
    task: "Open Research Sites. Try Apollo, Jezero or Atacama, apply a filter, then clear it.",
    target: "catalog-button",
    view: "explore",
  },
  {
    title: "Imagery and data layers",
    section: "Explore",
    text: "Satellite basemaps show appearance. Data overlays show measured, inferred, computed or modelled quantities, each with its own legend and resolution. Some imagery is only visual context and supplies no scoring values.",
    task: "Open Layers, choose elevation or slope, and read the legend, units and source.",
    target: "layers",
    view: "explore",
    panel: "left",
  },
  {
    title: "Simple and Advanced",
    section: "Explore",
    text: "Simple mode prioritizes essential controls. Advanced reveals additional layers and scientific details. Both use the same measurements and formulas; the level of explanation changes, not the result.",
    task: "Switch Simple to Advanced in Layers, inspect the extra options, then switch back if you prefer.",
    target: "layers",
    view: "explore",
    panel: "left",
  },
  {
    title: "Read a measurement",
    section: "Read the science",
    text: "Elevation is average height; slope and roughness characterize terrain over kilometre baselines. Temperature is in kelvin or Celsius. Evidence labels distinguish observed, inferred, modelled, computed and interpreted values.",
    task: "Select a location and expand a measurement row to inspect its source, resolution and caveats.",
    target: "location",
    view: "explore",
    panel: "right",
  },
  {
    title: "Understand analysis cells",
    section: "Read the science",
    short: true,
    text: "Moon global cells are 0.5° (about 15 km), Mars 0.5° (30 km), Earth 0.25° (28 km at the equator). Lunar polar cells are 2.4 km. Source products can be much coarser. Zooming cannot reveal landing hazards at metre scale.",
    task: "Compare your selected cell size with the native resolution of one measurement.",
    target: "location",
    view: "explore",
    panel: "right",
  },
  {
    title: "Discover an Earth analog",
    section: "Earth Analogs",
    short: true,
    text: "Discover compares a Moon or Mars target with Earth land cells and also shows documented terrestrial research sites. A numerical match is a lead to investigate; it does not establish a published research relationship.",
    task: "Open Earth Analogs, choose a planetary target and inspect the results. The target remains shared across the analog tabs.",
    target: "workspace",
    view: "twin",
  },
  {
    title: "Documented versus similar",
    section: "Earth Analogs",
    text: "A documented analog has evidence for a specific use: rover testing, geology, astrobiology or another research activity. It does not recreate every planetary condition. Its computed grade still depends on your target, purpose and data.",
    task: "Choose a documented Earth site and compare its cited research purpose with your own question.",
    target: "catalog-button",
    view: "twin",
  },
  {
    title: "Choose a research purpose",
    section: "Earth Analogs",
    text: "Mobility emphasizes terrain; geology, ice drilling, dust and habitability weight dimensions differently. Only dimensions with usable data on both sides contribute. Inclusion in the analog catalog never adds a score bonus.",
    task: "Change Research purpose and observe the recomputed results, weights and coverage.",
    target: "purpose",
    view: "twin",
  },
  {
    title: "Read comparison charts",
    section: "Earth Analogs",
    text: "Compare shows normalized similarity scores alongside values in their original units. Longer bars mean closer matches, not more of the measured property. Radar shapes summarize dimensions; they are not uncertainty intervals.",
    task: "Open a result in Compare and read one dimension's score together with its underlying values.",
    target: "workspace",
    view: "compare",
  },
  {
    title: "Recognize an incomplete analogy",
    section: "Earth Analogs",
    text: "Earth cannot reproduce planetary gravity, atmospheric pressure or radiation. Lunar temperature is also excluded from similarity. A geological match may be a poor thermal or operational simulation. Read mismatches and missing dimensions.",
    task: "Find one strong match and one condition Earth cannot reproduce in your comparison.",
    target: "workspace",
    view: "compare",
  },
  {
    title: "Find sites near you",
    section: "Earth Analogs",
    text: "Near Me accepts typed coordinates, place search, a map click or an optional device location request. Distance means great-circle distance, not a driving route. Proximity never improves a grade; scientific similarity is sorted separately.",
    task: "Open Near Me and enter a starting location manually. Choose a radius and compare distance and similarity sorting.",
    target: "workspace",
    view: "near",
  },
  {
    title: "Choose a mission destination",
    section: "Mission Planner",
    short: true,
    text: "The five steps are Destination, Mission, Priorities, Candidates and Save. Choose Moon or Mars and a documented reference site, or discover another region in the ranking. Historical success never overrides the model.",
    task: "Choose a world and destination, then follow the five planner steps.",
    target: "mission",
    view: "mission",
    panel: "left",
  },
  {
    title: "Select a mission type",
    section: "Mission Planner",
    text: "Lunar permanent base, Mars robotic landing and Mars human exploration have different criteria and defaults. Their transfer rules convert measurements into 0–1 suitability values. Methodology exposes those rules.",
    task: "Choose the mission type and read its summary before accepting the priorities.",
    target: "mission",
    view: "mission",
    panel: "left",
  },
  {
    title: "Adjust priorities and limits",
    section: "Mission Planner",
    text: "Sliders change relative criterion weights. Hard limits exclude cells regardless of score. Missing criteria are dropped and coverage is reported. Below the model's coverage threshold, no grade is assigned.",
    task: "Move a priority slider and observe rank changes. Read a hard limit before toggling it.",
    target: "mission",
    view: "mission",
    panel: "left",
  },
  {
    title: "Interpret the candidates",
    section: "Mission Planner",
    text: "Candidate grades screen regions under your settings. Inspect strengths, limitations, missing data and exclusions. A top-ranked region is not a certified landing ellipse. Scenario comparison reveals sensitivity to your choices.",
    task: "Inspect a candidate's criterion contributions and compare it with a documented site under the same settings.",
    target: "mission",
    view: "mission",
    panel: "left",
  },
  {
    title: "Save a place",
    section: "Save and share",
    short: true,
    text: "Saving keeps the world, coordinates and available context in this browser. Duplicate places are handled consistently. A persistence error is reported instead of silently claiming a durable save.",
    task: "Select a place, use Save in its location panel, then find and rename it in Saved.",
    target: "location",
    view: "explore",
    panel: "right",
  },
  {
    title: "Save a comparison",
    section: "Save and share",
    text: "A saved comparison retains its planetary target, Earth location, purpose and available model context. Reopening can recompute using current data; saved context explains what you originally compared.",
    task: "Choose a planetary target and Earth site, calculate their similarity, then use Save comparison.",
    target: "workspace",
    view: "compare",
  },
  {
    title: "Save and reopen a mission",
    section: "Save and share",
    text: "Save a named mission from the planner's final step. Saved retains its type, priorities, limits and destination. Reopen, rename, organize or delete the record from the Saved workspace.",
    task: "Save a mission, open Saved and reopen it. Check that priorities and limits restore.",
    target: "nav-saved",
    view: "mission",
    panel: "left",
  },
  {
    title: "Share the current view",
    section: "Save and share",
    text: "Copy View Link encodes supported view state. Copied! appears only after clipboard success; if copying is blocked, a selectable link appears. Your Near Me starting location and browser-local Saved library are not shared.",
    task: "Use Copy View Link, open it in another tab and inspect the restored view.",
    target: "share",
  },
  {
    title: "Trace an original source",
    section: "Read the science",
    text: "Science & Data contains Methodology and Data Sources. Sources distinguish numerical inputs, imagery, site history and excluded datasets. Site references support identity, coordinates and research use; each source must support the particular claim.",
    task: "Open Data Sources and follow a reference. Return through Help to resume this topic.",
    target: "science",
  },
  {
    title: "Understand uncertainty",
    section: "Read the science",
    text: "Missing values are not zero. Coarse grids hide local variability and climate models provide estimates. A reported uncertainty does not guarantee safety. Methodology explains coverage, assumptions and limitations.",
    task: "Open Methodology and switch between Simple, Intermediate and Advanced before presenting a result.",
    target: "science",
  },
  {
    title: "Build your own investigation",
    section: "Save and share",
    text: "Start with a question, choose a planetary region, inspect its evidence, and select a mission or analog purpose. Explain useful matches and limitations. For your Space Apps presentation, make the data-to-decision trail visible.",
    task: "Explore independently. Reopen Help to restart either path or revisit any topic.",
    target: "navigation",
  },
];
const selector = (t: Topic) =>
  t.target === "map" ? "[data-stage]" : `[data-tour="${t.target}"]`;

export default function Intro({ onClose }: { onClose: () => void }) {
  const [progress] = useState(loadTourProgress);
  const [started, setStarted] = useState(false);
  const [path, setPath] = useState<"short" | "detailed">(progress.path);
  const [index, setIndex] = useState(progress.index);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [completed, setCompleted] = useState<number[]>(progress.completed);
  const [highlight, setHighlight] = useState<DOMRect | null>(null);
  const [compact, setCompact] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const sequence = TOUR.map((_, i) => i).filter(
    (i) => path === "detailed" || TOUR[i].short || i === TOUR.length - 1,
  );
  const step = TOUR[index];
  const dockRight =
    started &&
    !!highlight &&
    highlight.left < 400 &&
    highlight.width < 600 &&
    innerWidth >= 900;
  const position = Math.max(0, sequence.indexOf(index));
  const close = () => {
    markIntroSeen();
    onClose();
  };
  const go = (next: number) => {
    setIndex(next);
    setTopicsOpen(false);
    setCompact(false);
  };
  const advance = (delta: number) =>
    go(sequence[Math.min(sequence.length - 1, Math.max(0, position + delta))]);
  const prepare = () => {
    const s = useStore.getState();
    if (step.view && s.mode !== step.view) s.setMode(step.view);
    if (step.panel) s.setPanel(step.panel, true);
    if (step.view === "twin" && !s.twinOrigin) {
      const example =
        s.pins.mars.find((p) => /curiosity|gale/i.test(p.name)) ??
        s.pins.mars[0];
      const origin =
        s.selection && s.selection.body !== "earth"
          ? { ...s.selection, body: s.selection.body }
          : example
            ? { body: "mars" as const, lat: example.lat, lon: example.lon }
            : undefined;
      if (origin) s.startTwin(origin);
    }
    window.setTimeout(() => {
      const missionStep = (
        { 21: 0, 22: 1, 23: 2, 24: 3, 27: 4 } as Record<number, number>
      )[index];
      if (missionStep !== undefined)
        document
          .querySelector<HTMLButtonElement>(
            `[data-mission-step="${missionStep}"]`,
          )
          ?.click();
      const el = document.querySelector<HTMLElement>(selector(step));
      el?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      const control = el?.matches("button,input,select")
        ? el
        : el?.querySelector<HTMLElement>("button,input,select");
      control?.focus({ preventScroll: true });
    }, 100);
  };
  useEffect(() => {
    saveTourProgress({ path, index, completed });
  }, [path, index, completed]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
      // Ordinary arrows stay available for real sliders, selects and map controls.
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        advance(1);
      }
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        advance(-1);
      }
      if (!started && e.key === "Tab") {
        const controls = dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, [tabindex="0"]',
        );
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    if (!started || compact) {
      setHighlight(null);
      return;
    }
    const update = () => {
      const rect = document
        .querySelector<HTMLElement>(selector(step))
        ?.getBoundingClientRect();
      setHighlight(rect && rect.width > 0 && rect.height > 0 ? rect : null);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    const interval = window.setInterval(update, 600);
    const interaction = (e: Event) => {
      const target = document.querySelector(selector(step));
      if (target && e.target instanceof Node && target.contains(e.target))
        setCompleted((done) =>
          done.includes(index) ? done : [...done, index],
        );
    };
    document.addEventListener("click", interaction, true);
    document.addEventListener("change", interaction, true);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      document.removeEventListener("click", interaction, true);
      document.removeEventListener("change", interaction, true);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [started, compact, step.target, index]);
  return (
    <div
      className={cx(
        "fixed inset-0 z-[70]",
        started
          ? "pointer-events-none"
          : "grid place-items-center bg-black/60 p-4",
      )}
    >
      {started && highlight && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: Math.max(0, highlight.top - 3),
            left: Math.max(0, highlight.left - 3),
            width: Math.min(innerWidth, highlight.width + 6),
            height: Math.min(innerHeight, highlight.height + 6),
            border: "2px solid var(--color-world, #7fcaef)",
            borderRadius: 10,
            boxShadow: "0 0 0 4px #88cfff20",
            pointerEvents: "none",
          }}
        />
      )}
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal={!started}
        aria-labelledby={compact ? undefined : "tutorial-title"}
        aria-label={compact ? `Tutorial: ${step.title}` : undefined}
        style={dockRight ? { left: "auto", right: 16 } : undefined}
        className={cx(
          "surface-float pointer-events-auto overflow-hidden rounded-xl border border-[var(--hair-strong)] shadow-[var(--shadow-float)] outline-none",
          started
            ? "absolute bottom-4 left-4 w-[360px] max-w-[calc(100vw-32px)] max-sm:bottom-2 max-sm:left-2 max-sm:max-w-[calc(100vw-16px)]"
            : "w-full max-w-xl",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--hair)] px-4 py-3">
          <span className="flex items-center gap-2 text-xs font-medium text-world">
            <Compass size={15} />
            {started
              ? `${step.section} · ${position + 1} / ${sequence.length}`
              : "RADIUM field guide"}
          </span>
          <div className="flex items-center gap-1">
            {started && (
              <Button size="sm" onClick={() => setCompact(!compact)}>
                {compact ? "Expand" : "Minimize"}
              </Button>
            )}
            <IconButton label="Close tutorial" onClick={close}>
              <X size={16} />
            </IconButton>
          </div>
        </div>
        {!started ? (
          <div className="p-6">
            <h2
              id="tutorial-title"
              className="font-serif text-3xl leading-tight text-regolith-50"
            >
              Learn by exploring.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-regolith-200">
              Follow a guided investigation using the real maps, science
              controls and research workspaces. Skip, minimize or revisit any
              topic.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                className="ctl rounded-lg border border-[var(--hair-strong)] p-4 text-left"
                onClick={() => {
                  setPath("short");
                  go(0);
                  setStarted(true);
                }}
              >
                <Play size={19} className="mb-3 text-world" />
                <strong className="block text-sm">Quick start</strong>
                <span className="mt-1 block text-xs leading-relaxed text-regolith-300">
                  From your first site to saving an investigation.
                </span>
              </button>
              <button
                className="ctl rounded-lg border border-[var(--hair-strong)] p-4 text-left"
                onClick={() => {
                  setPath("detailed");
                  go(0);
                  setStarted(true);
                }}
              >
                <List size={19} className="mb-3 text-world" />
                <strong className="block text-sm">Complete field guide</strong>
                <span className="mt-1 block text-xs leading-relaxed text-regolith-300">
                  All 32 topics: maps, evidence, analogs, missions and sharing.
                </span>
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {progress.index > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStarted(true)}
                >
                  Resume: {TOUR[index].title}
                </Button>
              )}
              <Button size="sm" onClick={close}>
                Explore on my own
              </Button>
            </div>
            <p className="mt-4 text-2xs text-regolith-400">
              Keyboard: Tab to controls, Enter or Space to activate, Alt + ← / →
              for tutorial topics, Escape to close. Touch: tap controls and
              pinch maps to zoom.
            </p>
          </div>
        ) : (
          <>
            {!compact && (
              <div className="scroll max-h-[min(48vh,460px)] overflow-y-auto p-4 max-sm:max-h-[38vh]">
                <h2
                  id="tutorial-title"
                  className="font-serif text-[1.6rem] leading-tight text-regolith-50"
                >
                  {step.title}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-regolith-200">
                  {step.text}
                </p>
                {index === 7 && (
                  <div className="mt-3 flex gap-2">
                    {(["A", "B", "C", "D", "F"] as const).map((g) => (
                      <GradeTile key={g} grade={g} size="sm" />
                    ))}
                  </div>
                )}
                <div className="mt-3 rounded-lg border border-[var(--hair)] bg-basalt-950/60 p-3">
                  <p className="mb-1 text-2xs font-semibold uppercase tracking-widest text-world">
                    Try it in the application
                  </p>
                  <p className="text-xs leading-relaxed text-regolith-100">
                    {step.task}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={prepare}>
                    Show the controls
                  </Button>
                  {completed.includes(index) && (
                    <span className="flex items-center gap-1 text-2xs text-grade-b">
                      <Check size={13} />
                      Control explored
                    </span>
                  )}
                </div>
                <p className="mt-2 text-2xs text-regolith-500">
                  The application stays interactive. Minimize this card for more
                  room; continue or skip any topic.
                </p>
                {topicsOpen && (
                  <div className="mt-3 space-y-1 border-t border-[var(--hair)] pt-3">
                    {TOUR.map((t, i) => (
                      <button
                        className={cx(
                          "ctl flex w-full items-start gap-2 rounded px-2 py-2 text-left text-xs",
                          i === index && "bg-world/10 text-world",
                        )}
                        key={t.title}
                        onClick={() => {
                          setPath("detailed");
                          go(i);
                        }}
                      >
                        <span className="w-5 shrink-0 text-regolith-400">
                          {completed.includes(i) ? "✓" : i + 1}
                        </span>
                        <span>{t.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-1 border-t border-[var(--hair)] px-3 py-2">
              <IconButton
                label="Choose tutorial topic"
                aria-expanded={topicsOpen}
                onClick={() => {
                  setCompact(false);
                  setTopicsOpen(!topicsOpen);
                }}
              >
                <List size={16} />
              </IconButton>
              <IconButton
                label="Restart tutorial"
                onClick={() => {
                  setStarted(false);
                  setCompact(false);
                }}
              >
                <RotateCcw size={14} />
              </IconButton>
              <div className="ml-auto flex items-center gap-1">
                <IconButton
                  label="Previous tutorial topic"
                  disabled={position === 0}
                  onClick={() => advance(-1)}
                >
                  <ArrowLeft size={15} />
                </IconButton>
                {position === sequence.length - 1 ? (
                  <Button size="sm" variant="solid" onClick={close}>
                    Start exploring
                  </Button>
                ) : (
                  <Button size="sm" variant="solid" onClick={() => advance(1)}>
                    Continue
                    <ArrowRight size={14} />
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
