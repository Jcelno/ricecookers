import { Download, ExternalLink, Link2, Printer, X } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";

import { Button, GradeTile, IconButton, Notice, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { currentLink } from "@/lib/deeplink";
import { pct } from "@/lib/format";
import type { Brief, BriefDim, Pair } from "@/lib/types";
import { useStore } from "@/store";

const val = (v: number | null, dec: number, text?: string) => (text ? text : v === null || v === undefined ? "no data" : v.toFixed(dec));

function Pairs({ pairs, world }: { pairs: Pair[]; world: string }) {
  if (!pairs.length) return null;
  return (
    <table className="mt-1.5 w-full table-fixed text-xs">
      <thead><tr className="text-left text-regolith-500"><th className="w-[46%] py-0.5 font-normal" /><th className="py-0.5 text-right font-medium">{world}</th><th className="py-0.5 pl-2 text-right font-medium">Earth</th></tr></thead>
      <tbody>
        {pairs.map((p) => (
          <tr key={p.label} className="border-t border-[var(--hair)]">
            <td className="py-0.5 pr-2 text-regolith-300">{p.label}{p.unit ? ` (${p.unit})` : ""}</td>
            <td className="tnum py-0.5 text-right text-regolith-100">{val(p.planet, p.dec, p.planet_text)}</td>
            <td className="tnum py-0.5 pl-2 text-right text-regolith-100">{val(p.earth, p.dec, p.earth_text)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Dim({ d, world }: { d: BriefDim; world: string }) {
  return (
    <li className="brief-block py-2.5">
      <div className="flex items-center gap-2.5">
        <GradeTile grade={d.grade} size="sm" />
        <span className="text-sm font-medium text-regolith-50">{d.label}</span>
        <span className="tnum ml-auto text-2xs text-regolith-400">{pct(d.weight)} of this purpose's comparison</span>
      </div>
      <Pairs pairs={d.pairs} world={world} />
      {d.note && <p className="mt-1 text-2xs text-regolith-400">{d.note}</p>}
      {d.sources.length > 0 && (
        <p className="mt-1 text-2xs leading-snug text-regolith-400">
          Data: {d.sources.map((s, k) => <span key={s.id}>{k > 0 && "; "}<a className="link" href={s.url} target="_blank" rel="noreferrer">{s.name}</a>{s.evidence ? ` (${s.evidence})` : ""}</span>)}
        </p>
      )}
    </li>
  );
}

const H = ({ children }: { children: ReactNode }) => <h3 className="mt-6 mb-1 font-serif text-xl font-medium tracking-[-0.02em] text-regolith-50">{children}</h3>;
const List = ({ items }: { items: string[] }) => <ul className="list-disc space-y-0.5 pl-5 text-sm leading-relaxed text-regolith-200">{items.map((i) => <li key={i}>{i}</li>)}</ul>;

/** The brief itself, used by the sheet and by the offline saved example. */
export function BriefArticle({ brief, link }: { brief: Brief; link?: string }) {
  const world = brief.target.body === "moon" ? "Moon" : "Mars";
  return (
      <article className="print-area mx-auto max-w-[720px]">
        <p className="text-xs text-regolith-400">Research Test Brief, experiment proposal</p>
        <h2 className="mt-1 font-serif text-[2rem] leading-[1.12] font-medium tracking-[-0.03em] text-regolith-50" style={{ fontVariationSettings: '"opsz" 48' }}>{brief.title}</h2>
        <div className="mt-3"><Notice tone="warn">{brief.disclaimer}</Notice></div>
        {!brief.usable && brief.usable_note && <div className="mt-2"><Notice tone="error" title="Weak basis for this test">{brief.usable_note}</Notice></div>}
    
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-regolith-400">{world} target</dt><dd className="text-regolith-100"><span className="placename">{brief.target.label}</span>, <span className="tnum">{brief.target.coords}</span>, one {Math.round(brief.target.cell_km[0])} km cell</dd>
          <dt className="text-regolith-400">Earth place</dt><dd className="text-regolith-100"><span className="placename">{brief.earth.label}</span>, <span className="tnum">{brief.earth.coords}</span>, one {Math.round(brief.earth.cell_km[0])} km cell{brief.earth.documented ? `. ${brief.earth.documented.name} (documented analog site) is ${Math.round(brief.earth.documented.distance_km)} km away.` : ". Not a documented analog site; found by the data alone."}</dd>
          <dt className="text-regolith-400">Purpose</dt><dd className="text-regolith-100">{brief.purpose.label}</dd>
          <dt className="text-regolith-400">Similarity</dt><dd className="flex items-center gap-2 text-regolith-100"><GradeTile grade={brief.match.grade} size="sm" /> {brief.match.meaning ?? "Not graded"}, from {pct(brief.match.coverage)} of the weighted comparison. RADIUM's own scale, not a NASA rating.</dd>
        </dl>
    
        <H>Goal</H><p className="text-sm leading-relaxed text-regolith-200">{brief.goal}</p>
        <H>Research question</H><p className="text-sm leading-relaxed text-regolith-200">{brief.question} <span className="text-regolith-400">(A question to test, not a finding.)</span></p>
    
        <H>Why this place may be useful</H>
        {brief.why_useful.length ? <ul className="divide-y divide-[var(--hair)]">{brief.why_useful.map((d) => <Dim key={d.id} d={d} world={world} />)}</ul>
          : <p className="text-sm text-regolith-300">No compared dimension reaches grade B here.</p>}
    
        <H>Known mismatches</H>
        {brief.mismatches.length > 0 && <ul className="divide-y divide-[var(--hair)]">{brief.mismatches.map((d) => <Dim key={d.id} d={d} world={world} />)}</ul>}
        <ul className="mt-2 space-y-1.5">
          {brief.cannot_reproduce.map((b) => (
            <li key={b.label} className="brief-block text-sm leading-snug"><span className="font-medium text-regolith-50">{b.label}:</span> <span className="tnum text-regolith-200">{b.planet} vs {b.earth}.</span> <span className="text-regolith-300">{b.text}</span></li>
          ))}
        </ul>
        {brief.not_assessed.length > 0 && (<><H>Not assessed</H><List items={brief.not_assessed.map((n) => `${n.label}: ${n.text}`)} /></>)}
    
        <H>Proposed protocol ({brief.protocol.setting === "either" ? "field or laboratory" : brief.protocol.setting})</H>
        <dl className="space-y-2 text-sm leading-relaxed">
          <div><dt className="text-regolith-400">Test article or instrument class</dt><dd className="text-regolith-200">{brief.protocol.instrument_class}</dd></div>
          <div><dt className="text-regolith-400">Keep controlled</dt><dd><List items={brief.protocol.controlled} /></dd></div>
          <div><dt className="text-regolith-400">Measure</dt><dd><List items={brief.protocol.measured} /></dd></div>
          <div><dt className="text-regolith-400">Data to collect</dt><dd><List items={brief.protocol.data_to_collect} /></dd></div>
          <div><dt className="text-regolith-400">How to compare</dt><dd className="text-regolith-200">{brief.protocol.comparison}</dd></div>
          <div><dt className="text-regolith-400">What would be informative</dt><dd className="text-regolith-200">{brief.protocol.informative_outcome}</dd></div>
          <div><dt className="text-regolith-400">Needs a laboratory</dt><dd className="text-regolith-200">{brief.protocol.laboratory_needs}</dd></div>
        </dl>
    
        <H>Preparation and constraints</H><List items={brief.preparation} />
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {Object.entries(brief.unknowns).map(([k, v]) => (<Fragment key={k}><dt className="text-regolith-400">{k.replace("_", " ").replace(/^./, (c) => c.toUpperCase())}</dt><dd className="text-regolith-200">{v}</dd></Fragment>))}
        </dl>
    
        {brief.earth.documented && (<><H>Published work at the nearby site</H><p className="text-sm text-regolith-200">{brief.earth.documented.name}: {brief.earth.documented.source}</p></>)}
    
        <footer className="hair-t mt-8 pt-3 text-2xs leading-relaxed text-regolith-500">
          Generated {brief.meta.generated_utc} by RADIUM {brief.meta.radium_version} (build {brief.meta.build}) from the Earth Twin comparison for these settings: {Object.entries(brief.meta.settings).map(([k, v]) => `${k}=${v}`).join(", ")}.
          Every value above comes from the datasets linked beside it; see the app's Data sources page for licences and limits.{" "}
          {link && <a className="link inline-flex items-center gap-0.5" href={link}>Reopen this brief <ExternalLink size={10} /></a>}
        </footer>
      </article>
  );
}

export default function BriefSheet({ onClose }: { onClose: () => void }) {
  const req = useStore((s) => s.brief);
  const [setting, setSetting] = useState("either");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!req) return;
    const ac = new AbortController();
    setErr(null);
    api.brief({ ...req, setting }, ac.signal).then(setBrief, (e) => { if (e?.name !== "AbortError") setErr(e.message); });
    return () => ac.abort();
  }, [req, setting]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(currentLink()); setCopied("Link copied"); } catch { setCopied("Copy failed: use the address bar"); }
    setTimeout(() => setCopied(null), 2200);
  };
  const download = () => {
    if (!brief) return;
    const blob = new Blob([JSON.stringify(brief, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `radium-test-brief-${brief.purpose.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const world = brief?.target.body === "moon" ? "Moon" : "Mars";

  return (
    <div className="brief-overlay anim-fade fixed inset-0 z-50 flex justify-center bg-black/70 p-0 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Research Test Brief" className="brief-dialog anim-sheet surface flex h-full w-full max-w-[880px] flex-col rounded-none shadow-[var(--shadow-float)] outline-none sm:rounded-lg">
        <div className="no-print hair-b flex flex-wrap items-center gap-2 px-5 py-3">
          <span className="text-sm font-semibold text-regolith-50">Research Test Brief</span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-regolith-300">
            Setting
            <select value={setting} onChange={(e) => setSetting(e.target.value)} className="field h-7 w-auto">
              <option value="either">Field or lab</option><option value="field">Field</option><option value="lab">Laboratory</option>
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!brief}><Printer size={13} /> Print or save as PDF</Button>
          <Button size="sm" variant="outline" onClick={() => void copy()}><Link2 size={13} /> {copied ?? "Copy link"}</Button>
          <Button size="sm" variant="outline" onClick={download} disabled={!brief}><Download size={13} /> JSON</Button>
          <IconButton label="Close the brief" onClick={onClose}><X size={17} /></IconButton>
        </div>
        <div className="brief-scroll scroll flex-1 px-6 pt-5 pb-10 sm:px-10">
          {!req ? <Notice tone="info">Open a brief from an Earth Twin comparison or a Near Me result.</Notice>
            : err ? <Notice tone="error" title="The brief could not be built">{err}</Notice>
              : !brief ? <Spinner label="Assembling the brief from the comparison" />
                : (
                  <BriefArticle brief={brief} link={currentLink()} />
                )}
        </div>
      </div>
    </div>
  );
}
