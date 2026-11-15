import { Printer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, GradeTile, IconButton, Notice } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { currentLink } from "@/lib/deeplink";
import { GRADE_MEANING, pct } from "@/lib/format";
import type { Source } from "@/lib/types";
import { shares, useStore } from "@/store";

/** Printable preliminary mission report, assembled from the planner's live state. Nothing here is computed anew. */
export default function MissionReport({ onClose }: { onClose: () => void }) {
  const meta = useStore((s) => s.meta)!;
  const st = useStore();
  const mission = meta.missions.find((m) => m.id === st.missionId)!;
  const raw = st.rawWeights[st.missionId] ?? {};
  const share = shares(raw);
  const limits = st.limitsOn[st.missionId] ?? [];
  const sites = st.rank && st.rank.mission === st.missionId ? st.rank.sites : [];
  const dest = st.cell && st.cell.body === mission.body ? st.cell : null;
  const [sources, setSources] = useState<Source[]>([]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { api.sources().then((r) => setSources(r.sources.filter((x) => x.body === mission.body)), () => setSources([])); }, [mission.body]);
  useEffect(() => {
    box.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const H = ({ children }: { children: React.ReactNode }) => <h3 className="mt-6 mb-1.5 font-serif text-xl font-medium tracking-[-0.02em] text-regolith-50">{children}</h3>;

  return (
    <div className="brief-overlay anim-fade fixed inset-0 z-50 flex justify-center bg-black/70 p-0 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Mission report" className="brief-dialog anim-sheet surface flex h-full w-full max-w-[880px] flex-col shadow-[var(--shadow-float)] outline-none sm:rounded-lg">
        <div className="no-print hair-b flex items-center gap-2 px-5 py-3">
          <span className="text-sm font-semibold text-regolith-50">Preliminary mission report</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.print()}><Printer size={13} /> Print or save as PDF</Button>
          <IconButton label="Close the report" onClick={onClose}><X size={17} /></IconButton>
        </div>
        <div className="brief-scroll scroll flex-1 px-6 pt-5 pb-10 sm:px-10">
          <article className="print-area mx-auto max-w-[720px]">
            <p className="text-xs text-regolith-400">RADIUM preliminary mission report, {new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</p>
            <h2 className="mt-1 font-serif text-[2rem] leading-[1.12] font-medium tracking-[-0.03em] text-regolith-50">{mission.label}{dest ? `: ${dest.place.label}` : ""}</h2>
            <div className="mt-3"><Notice tone="warn">A preliminary screening from public data at 2 to 30 km resolution. Grades are RADIUM's own scale for comparing options. This is not a landing, construction or safety assessment, and not a NASA product.</Notice></div>

            <H>Destination</H>
            {dest ? (
              <div className="text-sm text-regolith-200">
                <p><span className="placename">{dest.place.label}</span> on {mission.body === "moon" ? "the Moon" : "Mars"}, <span className="tnum">{dest.coords}</span>, one {Math.round(dest.cell.size_km[0])} km cell.</p>
                {dest.suitability && (
                  <>
                    <p className="mt-1 flex items-center gap-2"><GradeTile grade={dest.suitability.excluded ? null : dest.suitability.grade} size="sm" />{dest.suitability.excluded ? `Ruled out: ${dest.suitability.failed_limits.map((l) => l.label).join("; ")}` : dest.suitability.grade ? `${GRADE_MEANING[dest.suitability.grade]} suitability, from ${pct(dest.suitability.coverage)} of the weighted criteria.` : "Not enough data to grade."}</p>
                    <table className="mt-2 w-full text-xs"><tbody>
                      {dest.suitability.factors.map((f) => (
                        <tr key={f.id} className="border-t border-[var(--hair)]"><td className="py-1 pr-2">{f.label}</td><td className="py-1"><GradeTile grade={f.grade} size="xs" /></td><td className="py-1 text-regolith-400">{f.inputs.map((i) => `${i.label}: ${i.value === null ? "no data" : `${i.value.toFixed(i.dec)}${i.unit ? ` ${i.unit}` : ""}`}`).join("; ")}</td></tr>
                      ))}
                    </tbody></table>
                  </>
                )}
              </div>
            ) : <p className="text-sm text-regolith-300">No single site selected; see the candidate list.</p>}

            <H>Mission and criteria</H>
            <p className="text-sm text-regolith-200">{mission.summary}</p>
            <table className="mt-2 w-full text-xs">
              <thead><tr className="text-left text-regolith-400"><th className="py-1">Criterion</th><th className="py-1">Share</th><th className="py-1">Rule</th></tr></thead>
              <tbody>{mission.criteria.map((c) => <tr key={c.id} className="border-t border-[var(--hair)] align-top"><td className="py-1 pr-2">{c.label}</td><td className="tnum py-1 pr-2">{pct(share[c.id] ?? 0)}</td><td className="py-1 text-regolith-300">{c.rule}</td></tr>)}</tbody>
            </table>
            <p className="mt-2 text-xs text-regolith-300">Hard limits on: {mission.limits.filter((l) => limits.includes(l.id)).map((l) => `${l.label} (${l.rule})`).join("; ") || "none"}.</p>

            <H>Candidate sites</H>
            {sites.length ? (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-regolith-400"><th className="py-1">#</th><th className="py-1">Site</th><th className="py-1">Grade</th><th className="py-1">Criteria</th></tr></thead>
                <tbody>{sites.map((x) => (
                  <tr key={x.id} className="border-t border-[var(--hair)] align-top">
                    <td className="tnum py-1 pr-2">{x.rank}</td>
                    <td className="py-1 pr-2"><span className="placename">{x.place}</span><span className="tnum block text-regolith-400">{x.coords}</span></td>
                    <td className="py-1 pr-2"><GradeTile grade={x.grade} size="xs" /></td>
                    <td className="py-1 text-regolith-300">{x.factors.map((f) => `${f.short} ${f.grade ?? "–"}`).join(", ")}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="text-sm text-regolith-300">No ranking loaded. Open step 4 of the planner first.</p>}
            {st.rank && <p className="mt-2 text-xs text-regolith-400">{st.rank.stats.graded.toLocaleString("en-US")} cells graded, {st.rank.stats.excluded.toLocaleString("en-US")} ruled out by limits. Listed sites are kept apart so they are different places.</p>}

            <H>Data sources</H>
            <ul className="space-y-1 text-xs text-regolith-200">{sources.map((x) => <li key={x.id}><a className="link" href={x.url}>{x.name}</a>, {x.agency}. {x.spatial_resolution}. <span className="text-regolith-400">{x.limitations}</span></li>)}</ul>

            <H>Limitations</H>
            <ul className="list-disc space-y-1 pl-5 text-sm text-regolith-200">
              <li>Cells are 2 to 30 km across: boulders, small craters and local slopes that matter for landing are not resolved.</li>
              <li>Ice evidence is indirect (hydrogen, permanent shadow, temperature); no indicator here is a detection of recoverable ice.</li>
              <li>Mars temperature, pressure, sunlight and dust are climate-model values for a typical year.</li>
              <li>Weights and hard limits are choices made in this plan; different priorities give different rankings.</li>
            </ul>
            <footer className="hair-t mt-8 pt-3 text-2xs text-regolith-500">Reopen this plan: <a className="link" href={currentLink()}>{currentLink().slice(0, 90)}…</a></footer>
          </article>
        </div>
      </div>
    </div>
  );
}
