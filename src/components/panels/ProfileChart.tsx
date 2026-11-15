import { useEffect, useState } from "react";

import { Segmented, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { Body, Profile } from "@/lib/types";
import { useStore } from "@/store";

/** Cell-mean elevation along a north–south or east–west line through the selected cell. Gaps are cells without data. */
export function ProfileChart({ body, lat, lon }: { body: Body; lat: number; lon: number }) {
  const [axis, setAxis] = useState<"ns" | "ew">("ns");
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const meta = useStore((s) => s.meta);
  useEffect(() => {
    const ac = new AbortController();
    setErr(null);
    api.profile(body, lat, lon, axis, ac.signal).then(setP, (e) => { if (e?.name !== "AbortError") setErr(e.message); });
    return () => ac.abort();
  }, [body, lat, lon, axis]);

  const W = 340, H = 150, L = 44, R = 8, T = 8, B = 26;
  let chart = null;
  if (p) {
    const vals = p.points.map((q) => q.elev_m).filter((v): v is number => v !== null);
    if (vals.length < 2) chart = <p className="text-xs text-regolith-400">No elevation data along this line.</p>;
    else {
      const lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max(50, (hi - lo) * 0.08);
      const x0 = p.points[0].offset_km, x1 = p.points[p.points.length - 1].offset_km;
      const x = (d: number) => L + ((d - x0) / (x1 - x0 || 1)) * (W - L - R);
      const y = (v: number) => T + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - T - B);
      // Break the line where a cell has no data instead of drawing across the gap.
      const segs: string[] = [];
      let cur = "";
      for (const q of p.points) {
        if (q.elev_m === null) { if (cur) segs.push(cur); cur = ""; continue; }
        cur += `${cur ? "L" : "M"}${x(q.offset_km).toFixed(1)},${y(q.elev_m).toFixed(1)}`;
      }
      if (cur) segs.push(cur);
      // Negative offsets are rows above (north of) the cell, or columns to its west.
      const ends = axis === "ns" ? ["N", "S"] : ["W", "E"];
      chart = (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Elevation from ${Math.round(lo)} to ${Math.round(hi)} metres along a ${axis === "ns" ? "north–south" : "east–west"} line`}>
          {[lo, (lo + hi) / 2, hi].map((v) => (
            <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--hair)" /><text x={L - 5} y={y(v) + 3} textAnchor="end" className="tnum fill-regolith-400 text-[9px]">{Math.round(v).toLocaleString("en-US")}</text></g>
          ))}
          <line x1={x(0)} x2={x(0)} y1={T} y2={H - B} stroke="var(--world)" strokeDasharray="3 3" />
          {segs.map((d) => <path key={d} d={d} fill="none" stroke="var(--color-regolith-100)" strokeWidth={1.6} />)}
          <text x={L} y={H - 8} className="tnum fill-regolith-400 text-[9px]">{Math.abs(Math.round(x0))} km {ends[0]}</text>
          <text x={x(0)} y={H - 8} textAnchor="middle" className="fill-regolith-300 text-[9px]">this cell</text>
          <text x={W - R} y={H - 8} textAnchor="end" className="tnum fill-regolith-400 text-[9px]">{Math.round(x1)} km {ends[1]}</text>
        </svg>
      );
    }
  }
  const src = p && meta?.sources_index[p.source];
  return (
    <div className="px-4 pb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-regolith-300">Elevation (m), cell means</span>
        <Segmented size="sm" label="Profile direction" value={axis} onChange={setAxis} options={[{ value: "ns", label: "N–S" }, { value: "ew", label: "E–W" }]} />
      </div>
      {err ? <p className="text-xs text-alert">{err}</p> : p ? chart : <Spinner />}
      {p && <p className="mt-1 text-2xs leading-snug text-regolith-500">{Math.round(p.cell_km[0])} km cells{src ? `, from ${src.name}` : ""}. {p.note}</p>}
    </div>
  );
}
