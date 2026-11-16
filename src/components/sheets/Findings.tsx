import { ArrowRight, Check, Columns2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { GradeBadge, SiteScoreIcon, TwinScoreIcon } from "@/components/ui/ScoreIcons";
import { Sheet } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { count, findings, score2, type RankCard, type Study } from "@/lib/findings";
import { useStore } from "@/store";

import "@/components/flow/flow.css";

const HEADLINE: Record<string, string> = {
  "gale-mobility": "A rover test ground for Gale crater that is on nobody's list",
  "ridge-ice": "The lunar south pole's closest twins are high, cold deserts in Asia",
  "ridge-general": "As an all-round match, the Moon's south pole has no Earth twin",
  "arcadia-ice": "For Mars ice drilling, Antarctica comes closest and still earns a B",
};
const WORLD = { moon: "Moon", mars: "Mars" } as const;

type Check = "idle" | "checking" | "same" | "different" | "offline";

/** Sentences are assembled from the saved numbers, so the words cannot drift from the model. */
function sentences(f: Study): string[] {
  const top = f.top[0], out: string[] = [];
  const others = f.top.slice(1).filter((t) => t.grade === top.grade).map((t) => `${t.name} (${score2(t.score)})`);
  out.push(`Best match on Earth: ${top.name}, grade ${top.grade} (${score2(top.score)})${others.length ? `, then ${others.join(" and ")}` : ""}.`);
  if (f.grades.A === 0) out.push(`No place on Earth earns an A. The best of ${count(f.cells)} places scores ${score2(f.best)}.`);
  else out.push(`${f.grades.A === 1 ? "Only one" : `Only ${count(f.grades.A)}`} of ${count(f.cells)} places on Earth ${f.grades.A === 1 ? "earns" : "earn"} an A.`);
  if (f.best_documented && f.documented_below_top === f.documented_scored)
    out.push(`It scores above all ${f.documented_scored} documented analog sites. The best of those is ${f.best_documented.name} (${score2(f.best_documented.score)}).`);
  const g = f.breaks_down.find((b) => b.label === "Gravity"), p = f.breaks_down.find((b) => b.label === "Air pressure");
  const gx = g?.text.match(/([\d.]+) times stronger/)?.[1], px = p?.text.match(/about ([\d,]+) times denser/)?.[1];
  const cannot = [gx && `gravity (Earth's is ${gx}× stronger)`, px ? `air pressure (about ${px}× denser here)` : p?.planet === "vacuum" && "air pressure (the Moon has none)"].filter(Boolean);
  if (cannot.length) out.push(`The analogy breaks down on ${cannot.join(" and ")}.`);
  return out;
}

function FindingCard({ f, check }: { f: Study; check: Check }) {
  const enter = useStore((s) => s.enter);
  const top = f.top[0];
  return (
    <article className="finding panel" data-finding={f.id}>
      <header>
        <span className="eyebrow"><TwinScoreIcon size={14} /> Twin score · {WORLD[f.body]} to Earth</span>
        <h3>{HEADLINE[f.id ?? ""] ?? `${f.name}: ${f.purpose_label}`}</h3>
      </header>
      <p className="finding-pair">
        <span className={`world-disc ${f.body}`} style={{ "--d": "22px" } as React.CSSProperties} />
        <span className="placename">{f.name}</span>
        <span className="mono finding-coords">{f.coords}</span>
        <span className="finding-for">{f.purpose_label}</span>
        <span className="world-disc earth" style={{ "--d": "22px" } as React.CSSProperties} />
        <span className="placename">{top.name}</span>
        <GradeBadge grade={top.grade} score={top.score} />
      </p>
      <ul className="finding-lines">{sentences(f).map((s) => <li key={s}>{s}</li>)}</ul>
      <footer>
        <button type="button" className="ctl finding-open" onClick={() => enter({ kind: "link", hash: f.link })}>Open this result <ArrowRight size={14} /></button>
        <button type="button" className="ctl finding-compare" onClick={() => enter({ kind: "link", hash: f.compare_link })}><Columns2 size={14} /> Compare side by side</button>
        <LiveCheck check={check} />
      </footer>
    </article>
  );
}

function LiveCheck({ check }: { check: Check }) {
  if (check === "idle" || check === "offline") return <span className="finding-check mono">Saved value · live check needs the data service</span>;
  if (check === "checking") return <span className="finding-check mono">Checking against the live model…</span>;
  if (check === "same") return <span className="finding-check mono" data-check="same"><Check size={13} /> Reproduced live just now</span>;
  return <span className="finding-check mono" data-check="different"><TriangleAlert size={13} /> The live model now gives a different value. Regenerate with npm run snapshot.</span>;
}

function RankFinding({ r, check }: { r: RankCard; check: Check }) {
  const enter = useStore((s) => s.enter);
  const top = r.top[0];
  return (
    <article className="finding panel" data-finding="rank-lunar-base">
      <header>
        <span className="eyebrow"><SiteScoreIcon size={14} /> Site score · {WORLD[r.body]} only</span>
        <h3>{r.grades.A === 1 ? "Only one place on the Moon earns an A for a permanent base" : `${count(r.grades.A)} places earn an A for a ${r.label.toLowerCase()}`}</h3>
      </header>
      <p className="finding-pair">
        <span className={`world-disc ${r.body}`} style={{ "--d": "22px" } as React.CSSProperties} />
        <span className="placename">{top.place}</span>
        <span className="mono finding-coords">{top.coords}</span>
        <GradeBadge grade={top.grade} score={top.score} />
      </p>
      <ul className="finding-lines">
        <li>{count(r.grades.A)} of {count(r.cells)} places graded for a {r.label.toLowerCase()} {r.grades.A === 1 ? "earns" : "earn"} an A; {count(r.grades.B)} earn a B.</li>
        <li>{count(r.excluded)} places are ruled out by a hard limit, such as slopes too steep to build on.</li>
        <li>This score involves no Earth data. It is never combined with a twin score.</li>
      </ul>
      <footer>
        <button type="button" className="ctl finding-open" onClick={() => enter({ kind: "link", hash: r.link })}>Open this ranking <ArrowRight size={14} /></button>
        <LiveCheck check={check} />
      </footer>
    </article>
  );
}

const same = (a: number | null | undefined, b: number | null | undefined) => a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(a - b) < 5e-4;

/** Findings: a handful of real, reproducible results. Each is re-run against the live model while this page is open. */
export default function Findings({ onClose }: { onClose: () => void }) {
  const live = useStore((s) => !!s.meta);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const rank = findings.cards.rank;
  useEffect(() => {
    if (!live) return;
    const ctl = new AbortController();
    const set = (id: string, c: Check) => { if (!ctl.signal.aborted) setChecks((old) => ({ ...old, [id]: c })); };
    for (const f of findings.findings) {
      set(f.id!, "checking");
      api.twin({ body: f.body, lat: f.lat, lon: f.lon, purpose: f.purpose, n: 3 }, ctl.signal)
        .then((t) => set(f.id!, same(t.candidates[0]?.score, f.top[0].score) && t.distribution.grades.A === f.grades.A ? "same" : "different"), () => set(f.id!, "offline"));
    }
    set("rank", "checking");
    api.rank({ mission: rank.mission, n: 3 }, ctl.signal).then((r) => set("rank", r.stats.grades.A === rank.grades.A && same(r.sites[0]?.score, rank.top[0].score) ? "same" : "different"), () => set("rank", "offline"));
    return () => ctl.abort();
  }, [live, rank]);
  return (
    <Sheet title="Findings" subtitle={`Results from the RADIUM model, computed ${findings.generated_date}. Each opens as a live view you can change, and each is checked against the live model while you read.`} onClose={onClose}>
      <div className="findings" data-findings>
        {findings.findings.map((f) => <FindingCard key={f.id} f={f} check={checks[f.id!] ?? "idle"} />)}
        <RankFinding r={rank} check={checks.rank ?? "idle"} />
        <p className="findings-note">
          Grades are RADIUM's own A to F scale (A = 0.80 or higher), not NASA ratings. A match found by data alone is a candidate to verify with fieldwork and a literature check.
          Gravity, air pressure and radiation are reported with numbers and never scored: no place on Earth can reproduce them.
        </p>
      </div>
    </Sheet>
  );
}
