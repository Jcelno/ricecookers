import { useEffect, useState } from "react";

import { BriefArticle } from "@/components/sheets/Brief";
import { Button, GradeTile, Notice, Spinner } from "@/components/ui/primitives";
import { pct } from "@/lib/format";
import type { Brief, CompareResult, NearbyResult, TwinResult } from "@/lib/types";

interface Snapshot {
  kind: "saved_example"; generated_utc: string; build: string;
  inputs: { target: { body: string; lat: number; lon: number; purpose: string }; near_from: { lat: number; lon: number; label: string }; radius_km: number };
  twin: Pick<TwinResult, "planet" | "purpose" | "dimensions" | "candidates" | "distribution" | "separation_km">;
  compare: CompareResult; brief: Brief; nearby: NearbyResult;
}

/** Shown only when the data service cannot be reached: one saved, real result, clearly labelled as not live. */
export default function OfflineDemo({ onRetry, live = false, onLive }: { onRetry: () => void; live?: boolean; onLive?: () => void }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/demo/snapshot.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then(setSnap, (e) => setErr(String(e.message ?? e)));
  }, []);
  if (err) return <Notice tone="error" title="The saved example is missing too">{err}</Notice>;
  if (!snap) return <Spinner label="Opening the saved example" />;
  const c = snap.compare;
  return (
    <div className="scroll h-full w-full">
      <div className="mx-auto max-w-[820px] px-5 pt-6 pb-12">
        <div data-saved-example>
          <Notice tone={live ? "info" : "warn"} title={live ? "Live data is ready" : "Saved example, not live analysis"}
            action={live ? <Button size="sm" variant="solid" onClick={onLive}>Open the live app</Button> : <Button size="sm" variant="outline" onClick={onRetry}>Try the live service again</Button>}>
            {live ? "The data service has answered. This page still shows the saved example below; open the live app to run your own comparison."
              : <>The RADIUM data service has not answered, so this page shows one result computed earlier by the same code on {snap.generated_utc} (build {snap.build}).
                Every value below is that service's real output, stored unchanged. Maps and photographs need the live app, which opens as soon as the service answers.</>}
          </Notice>
        </div>

        <h1 className="mt-6 font-serif text-[2rem] leading-tight font-medium tracking-[-0.03em] text-regolith-50">
          {c.planet.place.label} on Mars, and its closest Earth analogs for rover mobility
        </h1>
        <p className="tnum mt-1 text-sm text-regolith-300">Target {c.planet.coords}. {snap.twin.distribution.cells.toLocaleString("en-US")} Earth land cells compared.</p>

        <h2 className="mt-6 text-md font-semibold text-regolith-50">Top Earth matches</h2>
        <ol className="mt-1 divide-y divide-[var(--hair)]">
          {snap.twin.candidates.slice(0, 5).map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <span className="tnum w-4 text-xs text-regolith-400">{m.rank}</span>
              <GradeTile grade={m.grade} size="sm" />
              <span className="placename text-md text-regolith-50">{m.place.label}</span>
              <span className="tnum ml-auto text-xs text-regolith-400">{m.coords}</span>
            </li>
          ))}
        </ol>

        <h2 className="mt-6 text-md font-semibold text-regolith-50">Best match compared: {c.earth.place.label}</h2>
        <p className="mt-1 text-sm text-regolith-200">{c.why}</p>
        <ul className="mt-2 divide-y divide-[var(--hair)]">
          {c.match.dimensions.filter((d) => d.weight > 0).map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-1.5 text-sm">
              <GradeTile grade={d.grade} size="xs" /> <span className="text-regolith-100">{d.label}</span>
              <span className="tnum ml-auto text-xs text-regolith-400">{d.score === null ? "not compared" : `${Math.round(d.score * 100)} / 100`}, {pct(d.weight)} of the comparison</span>
            </li>
          ))}
        </ul>

        <h2 className="mt-6 text-md font-semibold text-regolith-50">Best matches within {Math.round(snap.inputs.radius_km).toLocaleString("en-US")} km of {snap.inputs.near_from.label}</h2>
        <ol className="mt-1 divide-y divide-[var(--hair)]">
          {[...snap.nearby.documented, ...snap.nearby.regions].sort((a, b) => (b.similarity?.score ?? -1) - (a.similarity?.score ?? -1)).slice(0, 6).map((r, k) => (
            <li key={k} className="flex items-center gap-3 py-1.5 text-sm">
              <GradeTile grade={r.similarity?.grade ?? null} size="xs" />
              <span className="text-regolith-100">{"name" in r ? `${r.name} (documented site)` : `${r.place} (modelled region)`}</span>
              <span className="tnum ml-auto text-xs text-regolith-400">{Math.round(r.distance_km).toLocaleString("en-US")} km</span>
            </li>
          ))}
        </ol>

        <div className="mt-8 border-t border-[var(--hair)] pt-6"><BriefArticle brief={snap.brief} /></div>
      </div>
    </div>
  );
}
