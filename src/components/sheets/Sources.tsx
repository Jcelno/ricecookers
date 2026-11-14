import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { EvidenceTag, Notice, Sheet, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { Evidence, Source } from "@/lib/types";

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
      <div className="px-6 py-5">
        {error && <Notice tone="error" title="The registry could not be loaded">{error}</Notice>}
        {!data && !error && <Spinner label="Loading the registry" />}
        {data &&
          GROUPS.map(([id, label]) => {
            const list = data.sources.filter((s) => (id === "all" ? s.body === "all" || s.id === "earth_basemaps" || s.id === "natural_earth" : s.body === id && s.id !== "earth_basemaps" && s.id !== "natural_earth"));
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
        {data && (
          <section className="mb-4">
            <h3 className="mb-1 font-serif text-[1.375rem] font-medium tracking-[-0.02em] text-regolith-50">Audited and not used</h3>
            <p className="mb-3 max-w-[70ch] text-sm leading-relaxed text-regolith-300">Sources that were checked and left out, with the reason. Several would improve RADIUM and are the obvious next additions.</p>
            <ul className="grid gap-2 lg:grid-cols-2">
              {data.not_used.map((n) => (
                <li key={n.name} className="rounded-md px-4 py-3 text-xs leading-relaxed ring-1 ring-[var(--hair)]">
                  <span className="block font-semibold text-regolith-100">{n.name}</span>
                  <span className="text-regolith-300">{n.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  );
}
