import { ArrowUpRight, Award, Star, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import { GradeBadge } from "@/components/ui/ScoreIcons";
import { formatCoord } from "@/lib/format";
import { BADGES, earnedBadges, notebookCounts, useNotebook, type NotebookEntry } from "@/lib/notebook";
import { useStore } from "@/store";

import "@/components/flow/flow.css";

const WORLD = { moon: "Moon", mars: "Mars" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
/** The comparison reopens from the same kind of link that Copy View Link makes. */
const link = (e: NotebookEntry) => `#v=2&m=compare&b=${e.body}&t=${e.body},${e.target.lat},${e.target.lon}&p=${e.purpose}&e=${e.earth.lat},${e.earth.lon}&ct=pair`;

/**
 * The log half of My Notebook: every comparison opened, with its grade and date, and three counts.
 * Everything here comes from real results: a count only rises when the model returned that result.
 */
export function Notebook() {
  const n = useNotebook(useShallow((s) => ({ entries: s.entries, unmatched: s.unmatched, complete: s.complete, toggleStar: s.toggleStar, remove: s.remove, clear: s.clear, seen: s.seen })));
  const enter = useStore((s) => s.enter);
  useEffect(() => n.seen(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = notebookCounts(n);
  const earned = earnedBadges(n);
  const entries = [...n.entries].sort((a, b) => Number(b.starred) - Number(a.starred));
  return (
    <section className="notebook" aria-label="What you have found" data-notebook>
      <dl className="notebook-counts">
        <div title="Comparisons you opened that grade A or B"><dt>Twins found</dt><dd className="mono" data-count="twins">{counts.twins}</dd></div>
        <div title="Of those, places not in the list of documented analog sites"><dt>New leads</dt><dd className="mono" data-count="leads">{counts.leads}</dd></div>
        <div title="Sites and purposes you searched for which no place on Earth earns an A"><dt>Places Earth can't match</dt><dd className="mono" data-count="unmatched">{counts.unmatched}</dd></div>
      </dl>
      <ul className="notebook-badges" aria-label="Badges">
        {BADGES.map((b) => (
          <li key={b.id} data-earned={earned.includes(b.id)} title={b.how}><Award size={14} aria-hidden />{b.label}{!earned.includes(b.id) && <span className="sr-only"> (not earned yet)</span>}</li>
        ))}
      </ul>
      {entries.length === 0 ? (
        <p className="notebook-empty">Nothing logged yet. Every comparison you open in Find Earth Twins is recorded here with its grade and date.</p>
      ) : (
        <ol className="notebook-log">
          {entries.map((e) => (
            <li key={e.id} data-starred={e.starred}>
              <button type="button" className="ctl notebook-star" aria-pressed={e.starred} aria-label={e.starred ? "Remove star" : "Star this comparison"} onClick={() => n.toggleStar(e.id)}><Star size={15} fill={e.starred ? "currentColor" : "none"} /></button>
              <GradeBadge grade={e.grade} score={e.score} />
              <span className="notebook-pair">
                <span className="placename">{e.target.label}</span><span className="notebook-to" aria-hidden>to</span><span className="placename">{e.earth.label}</span>
                {e.newLead && (e.grade === "A" || e.grade === "B") && <span className="tag tag-lead">New lead</span>}
              </span>
              <span className="notebook-meta">{WORLD[e.body]} · {e.purposeLabel} · {day(e.at)}</span>
              <button type="button" className="ctl notebook-open" onClick={() => enter({ kind: "link", hash: link(e) })}>Open <ArrowUpRight size={13} /></button>
              <button type="button" className="ctl notebook-x" aria-label="Remove from the log" onClick={() => n.remove(e.id)}><Trash2 size={13} /></button>
            </li>
          ))}
        </ol>
      )}
      {n.unmatched.length > 0 && (
        <div className="notebook-unmatched">
          <h3>Places Earth can't match</h3>
          <ul>
            {n.unmatched.map((u) => (
              <li key={u.id}><span className="placename">{u.target.label}</span> <span className="mono">{formatCoord(u.target.lat, u.target.lon)}</span> · {u.purposeLabel}: no place on Earth earns an A{u.best !== null ? ` (best ${u.best.toFixed(2)})` : ""}.</li>
            ))}
          </ul>
        </div>
      )}
      {(entries.length > 0 || n.unmatched.length > 0) && <button type="button" className="link notebook-clear" onClick={n.clear}>Clear the log</button>}
    </section>
  );
}
