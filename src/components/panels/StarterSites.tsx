import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { AssessmentGrade } from "@/components/ui/Assessment";
import { GradeTile } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { Body, CellInfo } from "@/lib/types";
import { useStore } from "@/store";

const STARTERS: { body: Body; id: string; title: string; note: string }[] = [
  { body: "moon", id: "moon-feature-Shackleton", title: "Try Shackleton", note: "Catalog crater centre; a rim site needs a separate selection." },
  { body: "mars", id: "mars-feature-Gale", title: "Try Gale Crater", note: "Explore the regional terrain around a rover destination." },
  { body: "earth", id: "earth-analog-0", title: "Try Atacama", note: "Yungay field region; catalog coordinates need review." },
];

/** Catalog coordinates and live cell assessments; no authored preview grades. */
export default function StarterSites() {
  const pins = useStore(s => s.pins);
  const meta = useStore(s => s.meta);
  const missionId = useStore(s => s.missionId);
  const weights = useStore(s => s.rawWeights);
  const limits = useStore(s => s.limitsOn);
  const [previews, setPreviews] = useState<Record<string, CellInfo | "unavailable">>({});
  useEffect(() => {
    const controller = new AbortController();
    setPreviews({});
    for (const starter of STARTERS) {
      const pin = pins[starter.body].find(p => p.id === starter.id);
      if (!pin || starter.body === "earth") continue;
      const mission = meta?.missions.find(m => m.id === missionId && m.body === starter.body) ?? meta?.missions.find(m => m.body === starter.body);
      if (!mission) continue;
      void api.cell(starter.body, pin.lat, pin.lon, { mission: mission.id, weights: weights[mission.id], limits: limits[mission.id] }, controller.signal)
        .then(cell => { if (!controller.signal.aborted) setPreviews(current => ({ ...current, [starter.id]: cell })); })
        .catch(() => { if (!controller.signal.aborted) setPreviews(current => ({ ...current, [starter.id]: "unavailable" })); });
    }
    return () => controller.abort();
  }, [pins, meta, missionId, weights, limits]);
  return <section className="mt-4" aria-label="Starter research sites" data-starter-sites>
    <div className="mb-2 flex items-center justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-regolith-100">Start with a place</h3><p className="mt-0.5 text-2xs text-regolith-400">Three worlds, one evidence trail.</p></div>
      <svg viewBox="0 0 96 42" className="h-11 w-24 shrink-0" aria-hidden="true"><path d="M3 33Q24 11 47 26T93 18" fill="none" stroke="currentColor" className="text-regolith-500" strokeDasharray="2 4"/><circle cx="17" cy="20" r="10" fill="#bbc4d0"/><circle cx="14" cy="16" r="3" fill="#7b8796"/><circle cx="22" cy="23" r="2" fill="#7b8796"/><circle cx="48" cy="27" r="11" fill="#cd9276"/><path d="m39 24 7 2 3-4 7 5" fill="none" stroke="#865b4b" strokeWidth="2"/><circle cx="79" cy="15" r="12" fill="#6f9ea8"/><path d="m73 6 6 2-3 6 8 2-4 8-7-3 2-7-5-3" fill="#9db592"/></svg>
    </div>
    <ul className="space-y-2">{STARTERS.map(starter => {
      const pin = pins[starter.body].find(p => p.id === starter.id);
      const preview = previews[starter.id];
      const cell = preview && preview !== "unavailable" ? preview : null;
      const suitability = cell?.suitability;
      const mission = meta?.missions.find(m => m.id === suitability?.mission);
      return <li key={starter.id}><button type="button" data-starter={starter.body} disabled={!pin} className="row-ctl flex w-full items-center gap-3 rounded-md border border-[var(--hair)] bg-basalt-800/50 p-3 text-left disabled:opacity-50" onClick={() => {
        if (!pin) return;
        const st = useStore.getState();
        st.setBody(starter.body);
        void useStore.getState().select(starter.body, pin.lat, pin.lon, { source: "catalog", fly: true, spanKm: starter.body === "earth" ? 900 : 700 });
      }}>
        {suitability ? <AssessmentGrade size="sm" grade={suitability.grade} coverage={suitability.coverage} minCoverage={suitability.min_coverage} excluded={suitability.excluded} /> : <GradeTile size="sm" grade={null} />}
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-regolith-100">{starter.title}</span>
          <span className="mt-0.5 block text-2xs text-regolith-300" data-starter-preview>{starter.body === "earth" ? "Not assessed · Earth mission suitability is not defined" : !pin ? "Catalog unavailable" : preview === "unavailable" ? "Preview unavailable · open to retry" : !suitability ? "Loading live mission grade…" : `${suitability.excluded ? "Ruled out" : suitability.grade ? `Grade ${suitability.grade}` : "Insufficient data"} · ${mission?.label ?? "Mission suitability"}`}</span>
          <span className="mt-1 block text-2xs leading-snug text-regolith-400">{starter.note}</span>
        </span><ArrowUpRight size={14} className="shrink-0 text-regolith-500" />
      </button></li>;
    })}</ul>
    <p className="mt-2 text-2xs leading-relaxed text-regolith-500">Live planetary previews use the current mission settings where applicable. Open a place for coverage, evidence and native resolution.</p>
  </section>;
}
