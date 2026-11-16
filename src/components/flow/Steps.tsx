import { Check } from "lucide-react";

import "@/components/twin/twin.css";

export type StepState = "open" | "done" | "todo";

/** One step of a rail: a number or a check, a title, and what was chosen. A finished step reopens on click. */
export function StepHead({ n, title, state, summary, onOpen }: { n: number; title: string; state: StepState; summary?: React.ReactNode; onOpen?: () => void }) {
  const body = (
    <>
      <span className="step-dot" aria-hidden>{state === "done" ? <Check size={13} strokeWidth={3} /> : n}</span>
      <span className="step-text">
        <span className="step-title">{title}</span>
        {summary && <span className="step-summary">{summary}</span>}
      </span>
      {onOpen && state !== "open" && <span className="step-change">{state === "done" ? "Change" : "Open"}</span>}
    </>
  );
  return onOpen && state !== "open"
    ? <button type="button" className="step-head row-ctl" data-step-head={n} data-state={state} onClick={onOpen} aria-label={`Step ${n}, ${title}: ${state === "done" ? "change" : "open"}`}>{body}</button>
    : <div className="step-head" data-step-head={n} data-state={state} aria-current={state === "open" ? "step" : undefined}>{body}</div>;
}

/** A compact three-step rail for a path whose detailed controls sit below it. */
export function StepRail({ label, steps }: { label: string; steps: { title: string; state: StepState; summary?: React.ReactNode; onOpen?: () => void }[] }) {
  return (
    <ol className="steps steps-compact" aria-label={label} data-step-rail>
      {steps.map((s, k) => <li key={s.title} data-step={k + 1}><StepHead n={k + 1} {...s} /></li>)}
    </ol>
  );
}
