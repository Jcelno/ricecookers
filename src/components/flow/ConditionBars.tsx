import { Ban, Check, FlaskConical } from "lucide-react";

import type { Condition } from "@/lib/types";

import "./flow.css";

const WORLD = { moon: "Moon", mars: "Mars" } as const;

/** Bar lengths on a shared logarithmic axis, so 3.7 against 9.8 and 820 against 86,000 are both readable. */
function logPair(a: number, b: number): [number, number] {
  const lo = Math.min(a, b) / 4, hi = Math.max(a, b) * 1.25, span = Math.log(hi / lo);
  return [Math.log(a / lo) / span, Math.log(b / lo) / span];
}

function Bar({ label, text, at, from = 0, tone }: { label: string; text: string; at: number | null; from?: number; tone: "planet" | "earth" }) {
  return (
    <div className="cbar-row">
      <span className="cbar-who">{label}</span>
      <span className="cbar-track" aria-hidden>
        {at !== null && <span className={`cbar-fill cbar-${tone}`} style={{ left: `${from * 100}%`, width: `${Math.max(1.5, (at - from) * 100)}%` }} />}
      </span>
      <span className="mono cbar-value">{text}</span>
    </div>
  );
}

/**
 * Where the analogy breaks down, one condition per row: the Moon or Mars value against Earth's, and what a
 * test campaign needs to make up the difference. These conditions are reported and never scored.
 */
export function ConditionBars({ items, body }: { items: Condition[]; body: "moon" | "mars" }) {
  return (
    <ul className="cbars" data-condition-bars>
      {items.map((b, i) => {
        const close = b.kind === "close";
        let planet: number | null = null, earth: number | null = null, pFrom = 0, eFrom = 0, scale = "";
        if (b.planet_range && b.earth_range && b.planet_range[1] !== null && b.earth_range[1] !== null) {
          const max = Math.max(b.planet_range[1]!, b.earth_range[1]!) * 1.05;
          pFrom = (b.planet_range[0] ?? 0) / max; planet = b.planet_range[1]! / max;
          eFrom = (b.earth_range[0] ?? 0) / max; earth = b.earth_range[1]! / max;
          scale = "range, linear scale from 0 K";
        } else if (typeof b.planet_value === "number" && typeof b.earth_value === "number" && b.planet_value > 0 && b.earth_value > 0) {
          [planet, earth] = logPair(b.planet_value, b.earth_value);
          scale = "log scale";
        } else if (typeof b.earth_value === "number" && b.planet === "vacuum") {
          earth = 0.92; planet = null; scale = "vacuum is off the scale";
        }
        return (
          <li key={b.id ?? b.label} className="cbar" data-kind={close ? "close" : "cannot"} data-cond={b.id} style={{ "--i": i } as React.CSSProperties}>
            <div className="cbar-head">
              <span className={close ? "chip-matches cbar-chip" : "chip-cannot cbar-chip"}>
                {close ? <Check size={13} aria-hidden /> : <Ban size={13} aria-hidden />}{b.label}
              </span>
              {b.ratio_text && <span className="cbar-ratio">{b.ratio_text}</span>}
              {b.remedy && <span className="cbar-remedy" data-remedy><FlaskConical size={12} aria-hidden />{b.remedy}</span>}
            </div>
            {(planet !== null || earth !== null || b.planet === "vacuum") ? (
              <div className="cbar-bars" title={scale}>
                <Bar label={WORLD[body]} text={b.planet} at={planet} from={pFrom} tone="planet" />
                <Bar label="Earth" text={b.earth} at={earth} from={eFrom} tone="earth" />
                {scale && <span className="cbar-scale">{scale}</span>}
              </div>
            ) : (
              <p className="cbar-plain"><span>{WORLD[body]}: <b>{b.planet}</b></span><span>Earth: <b>{b.earth}</b></span></p>
            )}
            <p className="cbar-text">{b.text}</p>
          </li>
        );
      })}
    </ul>
  );
}
