import { Keyboard, Play, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, Sheet } from "@/components/ui/primitives";
import { resetCoachMarks } from "@/lib/coach";
import { GUIDE, GUIDE_GROUPS, searchGuide } from "@/lib/guide";
import { useStore } from "@/store";

import "@/components/flow/flow.css";

/** Help: a searchable reference grouped by task. Nothing here has to be finished before using RADIUM. */
export default function Help({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchGuide(q), [q]);
  const act = (run: (s: ReturnType<typeof useStore.getState>) => void) => { onClose(); run(useStore.getState()); };
  return (
    <Sheet title="Help" subtitle="Look something up when you need it. The quickest way to learn RADIUM is to ask it one question from the start screen." onClose={onClose}>
      <div className="help" data-help>
        <div className="help-tools">
          <label className="help-search">
            <Search size={15} aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the field guide" aria-label="Search the field guide" autoFocus />
          </label>
          <Button variant="outline" onClick={() => act((s) => s.enter({ kind: "demo" }))}><Play size={14} /> Watch a 20-second example</Button>
          <Button variant="outline" onClick={() => act((s) => s.startOver())}><RotateCcw size={14} /> Start over</Button>
          <Button variant="outline" onClick={() => { onClose(); window.dispatchEvent(new Event("radium:shortcuts")); }}><Keyboard size={14} /> Keyboard shortcuts</Button>
        </div>
        <p className="help-count mono" aria-live="polite" data-help-count>{q.trim() ? `${hits.length} of ${GUIDE.length} topics match` : `${GUIDE.length} topics in four groups`}</p>
        {GUIDE_GROUPS.map((g) => {
          const topics = hits.filter((t) => t.group === g.id);
          if (!topics.length) return null;
          return (
            <section key={g.id} className="help-group" aria-labelledby={`help-${g.id}`} data-help-group={g.id}>
              <header><h3 id={`help-${g.id}`}>{g.label}</h3><p>{g.blurb}</p></header>
              <ul>
                {topics.map((t) => (
                  <li key={t.id} data-help-topic={t.id}>
                    <h4>{t.title}</h4>
                    <p>{t.body}</p>
                    {t.more && <details><summary>More detail</summary><p>{t.more}</p></details>}
                    {t.action && <button type="button" className="link help-go" onClick={() => act(t.action!.run)}>{t.action.label}</button>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {!hits.length && <p className="help-none">No topic matches “{q}”. Try a single word such as grade, ice or share.</p>}
        <p className="help-foot">
          Tips appear once, at the moment they matter: three on the way to your first comparison.{" "}
          <button type="button" className="link" onClick={() => { resetCoachMarks(); onClose(); }}>Show the tips again</button>
        </p>
      </div>
    </Sheet>
  );
}
