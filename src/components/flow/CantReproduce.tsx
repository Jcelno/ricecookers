import { Ban, Check, NotebookPen } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { notebookCounts, useNotebook } from "@/lib/notebook";
import type { Match } from "@/lib/types";
import { useStore } from "@/store";

import "./flow.css";

export type Breakdown = Match["breaks_down"][number];
/** The conditions shown as chips, in this order. "Water and life" stays in the full comparison. */
const SHOWN = ["gravity", "pressure", "temperature", "radiation", "day_length"];

export function conditionChips(items: Breakdown[]): Breakdown[] {
  return SHOWN.map((id) => items.find((b) => b.id === id)).filter((b): b is Breakdown => !!b);
}

/** Short values for a chip: "3.71 vs 9.81 m/s²". The first number is the Moon or Mars, the second Earth. */
function values(b: Breakdown): string {
  const strip = (s: string) => s.replace(/\s*(m\/s²|Pa|mSv\/day|K)$/, "");
  const unit = b.unit && b.unit !== "h" ? ` ${b.unit}` : "";
  return b.planet === "vacuum" ? `vacuum vs ${b.earth}` : unit ? `${strip(b.planet)} vs ${strip(b.earth)}${unit}` : `${b.planet} vs ${b.earth}`;
}

/** The difference in a few characters; the full sentence is in the tooltip and the comparison view. */
function brief(b: Breakdown): string {
  if (b.kind === "close") return "nearly the same";
  if (!b.ratio) return b.id === "pressure" ? "no air" : b.id === "temperature" ? "far wider swing" : "";
  const r = b.ratio;
  return `${b.reference ? "about " : ""}${r >= 20 ? (b.reference ? Math.round(r / 10) * 10 : Math.round(r)).toLocaleString("en-US") : r.toFixed(1)}×`;
}

export function ConditionChip({ b, index = 0, coach = false }: { b: Breakdown; index?: number; coach?: boolean }) {
  const close = b.kind === "close";
  return (
    <span className={close ? "chip-matches cond-chip" : "chip-cannot cond-chip"} data-cond={b.id} data-kind={close ? "close" : "cannot"} data-coach={coach ? "cannot" : undefined}
      style={{ "--i": index } as React.CSSProperties} title={`${b.text}${b.remedy ? ` ${close ? "" : `${b.remedy}.`}` : ""}`} tabIndex={0}>
      {close ? <Check size={13} aria-hidden /> : <Ban size={13} aria-hidden />}
      <span className="cond-label">{b.id === "day_length" ? "Day length" : b.label}</span>
      <span className="mono cond-values">{values(b)}</span>
      {brief(b) && <span className="cond-ratio">{brief(b)}</span>}
      <span className="sr-only">{close ? "Close to Earth's." : "Earth cannot reproduce this."} {b.text}</span>
    </span>
  );
}

/**
 * The fixed strip under a results screen: what no place on Earth can reproduce, with numbers.
 * Red chips are conditions Earth cannot reproduce; a green chip is one that nearly matches.
 * These values are reported and never scored.
 */
export function CantReproduce({ items, world, pending }: { items: Breakdown[] | null; world: "moon" | "mars" | null; pending: boolean }) {
  const counts = useNotebook(useShallow((n) => notebookCounts(n)));
  const setMode = useStore((s) => s.setMode);
  const chips = items ? conditionChips(items) : [];
  return (
    <div className="flow-strip" data-cant-reproduce aria-label="Conditions Earth cannot reproduce">
      <span className="eyebrow strip-title">Earth can't reproduce</span>
      <div className="strip-chips" key={chips.map((c) => `${c.id}:${c.planet}:${c.earth}`).join("|")}>
        {chips.length > 0
          ? chips.map((b, k) => <ConditionChip key={b.id} b={b} index={k} coach={k === 0} />)
          : pending
            ? [0, 1, 2].map((k) => <span key={k} className="skeleton" style={{ width: 150, height: 30 }} />)
            : <span className="strip-empty">{world ? `Gravity, air pressure and radiation on ${world === "moon" ? "the Moon" : "Mars"} appear here with numbers once you have results. They are never scored.` : "Gravity, air pressure and radiation appear here with numbers. They are never scored."}</span>}
      </div>
      <button type="button" className="ctl strip-notebook" onClick={() => setMode("saved")} title="Open My Notebook" data-strip-notebook>
        <NotebookPen size={14} aria-hidden />
        <span className="strip-notebook-label">Notebook</span>
        <span className="mono"><b>{counts.twins}</b> {counts.twins === 1 ? "twin" : "twins"} · <b>{counts.leads}</b> {counts.leads === 1 ? "lead" : "leads"}</span>
      </button>
    </div>
  );
}
