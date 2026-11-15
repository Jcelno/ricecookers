import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { EvidenceTag, Notice, Sheet, Spinner } from "@/components/ui/primitives";
import { SiteEvidence } from "@/components/catalog/SiteCatalog";
import { useStore } from "@/store";
import { api } from "@/lib/api";
import type { Body, Evidence, Source } from "@/lib/types";

const ACCESS: Record<string, string> = {
  file: "Data file download",
  store: "Cloud array store",
  service: "Query service",
  imagery: "Map imagery",
};
const GROUPS: [string, string][] = [["moon", "Moon"], ["mars", "Mars"], ["earth", "Earth"], ["all", "Names and imagery"]];
const EVIDENCE = new Set(["observed", "inferred", "modelled", "computed", "interpreted"]);

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-regolith-500">{k}</dt>
      <dd className="text-regolith-200">{children}</dd>
    </>
  );
}

export default function Sources({ onClose }: { onClose: () => void }) {
  const pins = useStore(s => s.pins);
  const [query,setQuery] = useState(""); const [world,setWorld] = useState("all"); const [role,setRole] = useState("all");
  const matches = (v: unknown) => JSON.stringify(v).toLowerCase().includes(query.toLowerCase());
  const sites=Object.entries(pins).flatMap(([body,list])=>list.map(p=>({...p,body:body as Body})));
  const [data, setData] = useState<{ sources: Source[]; not_used: { name: string; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.sources().then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <Sheet
      title="Data sources"
      subtitle="Every dataset behind a number in RADIUM, as the pipeline uses it. Each entry states what the data can and cannot support."
      onClose={onClose}
    >
      <div className="px-6 py-5" data-tour="sources">
        <div className="mb-5 flex flex-wrap gap-2"><input className="field min-w-48 flex-1" aria-label="Search sources" placeholder="Search datasets, sites, agencies or research" value={query} onChange={e=>setQuery(e.target.value)}/><select className="field w-auto" aria-label="Source world" value={world} onChange={e=>setWorld(e.target.value)}><option value="all">All worlds</option><option value="moon">Moon</option><option value="mars">Mars</option><option value="earth">Earth</option></select><select className="field w-auto" aria-label="Source role" value={role} onChange={e=>setRole(e.target.value)}><option value="all">All source roles</option><option value="model">Measurements and calculations</option><option value="imagery">Imagery</option><option value="sites">Site history and analog research</option><option value="excluded">Evaluated, excluded</option></select></div>
        <p className="mb-6 text-sm leading-relaxed text-regolith-300">Numerical datasets support the calculations below. Site references establish location identity, history and documented research use; they do not supply a similarity grade. Imagery is visual context unless a listed dataset explicitly says otherwise.</p>
        {error && <Notice tone="error" title="The registry could not be loaded">{error}</Notice>}
        {!data && !error && <Spinner label="Loading the registry" />}
        {data &&
          GROUPS.map(([id, label]) => {
            const list = data.sources.filter(s => matches(s) && (world === "all" || s.body === world || s.body === "all") && role !== "sites" && role !== "excluded" && (role !== "imagery" || s.access === "imagery") && (role !== "model" || s.access !== "imagery")).filter((s) => (id === "all" ? s.body === "all" || s.id === "earth_basemaps" || s.id === "natural_earth" : s.body === id && s.id !== "earth_basemaps" && s.id !== "natural_earth"));
            if (!list.length) return null;
            return (
              <section key={id} className="mb-8">
                <h3 className="mb-3 font-serif text-[1.375rem] font-medium tracking-[-0.02em] text-regolith-50">{label}</h3>
                <div className="grid gap-3 lg:grid-cols-2">
                  {list.map((s) => (
                    <article key={s.id} className="rounded-md bg-basalt-800 p-4 ring-1 ring-[var(--hair)]">
                      <h4 className="text-sm leading-snug font-semibold text-regolith-50">{s.name}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-regolith-300">{s.purpose}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-regolith-300">
                        {EVIDENCE.has(s.evidence) && <EvidenceTag kind={s.evidence as Evidence} />}
                        <span>{ACCESS[s.access] ?? s.access}</span>
                        <a className="link inline-flex items-center gap-1" href={s.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={11} /></a>
                      </div>
                      <dl className="mt-3 grid grid-cols-[92px_1fr] gap-x-3 gap-y-1.5 text-xs leading-relaxed">
                        <Row k="Agency">{s.agency}</Row>
                        <Row k="Variables">{s.variables.join("; ")}</Row>
                        <Row k="Units">{s.units}</Row>
                        <Row k="Resolution">{s.spatial_resolution}</Row>
                        <Row k="Coverage">{s.coverage}</Row>
                        <Row k="Period">{s.temporal_coverage}</Row>
                        <Row k="Coordinates">{s.crs}</Row>
                        <Row k="Format">{s.format}</Row>
                        <Row k="Licence">{s.license}</Row>
                        <Row k="Processing">{s.processing}</Row>
                        <Row k="Limits"><span className="text-regolith-100">{s.limitations}</span></Row>
                      </dl>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        {data && (role === "all" || role === "excluded") && (
          <section className="mb-4">
            <h3 className="mb-1 font-serif text-[1.375rem] font-medium tracking-[-0.02em] text-regolith-50">Audited and not used</h3>
            <p className="mb-3 max-w-[70ch] text-sm leading-relaxed text-regolith-300">Sources that were checked and left out, with the reason. Several would improve RADIUM and are the obvious next additions.</p>
            <ul className="grid gap-2 lg:grid-cols-2">
              {data.not_used.filter(matches).map((n) => (
                <li key={n.name} className="rounded-md px-4 py-3 text-xs leading-relaxed ring-1 ring-[var(--hair)]">
                  <span className="block font-semibold text-regolith-100">{n.name}</span>
                  <span className="text-regolith-300">{n.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(role === "all" || role === "sites") && <section className="mt-8"><h3 className="mb-2 font-serif text-xl">Site history and analog research</h3><p className="mb-4 text-xs text-regolith-400">Every curated site's evidence record, including coordinate conventions and the limits of its documented purpose.</p><div className="grid gap-3 lg:grid-cols-2">{sites.filter(p=>(world === "all" || p.body === world)&&matches(p)).map(p=><article key={`${p.body}:${p.id}`} className="catalog-card"><h4 className="mb-2 font-serif text-lg text-regolith-50">{p.name} <span className="font-sans text-xs text-regolith-400">({p.body})</span></h4><SiteEvidence site={p}/></article>)}</div></section>}
      </div>
    </Sheet>
  );
}
