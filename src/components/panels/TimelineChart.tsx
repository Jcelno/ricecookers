import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EvidenceTag, IconButton, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { Body, Timeline } from "@/lib/types";
import { useStore } from "@/store";

/** How one cell changes through the lunar day, the Martian year or the Earth year, with a scrubbable time slider. */
export function TimelineChart({ body, lat, lon }: { body: Body; lat: number; lon: number }) {
  const [t, setT] = useState<Timeline | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [k, setK] = useState(body === "moon" ? 12 : 0);
  const [playing, setPlaying] = useState(false);
  const temp = useStore((s) => s.tempUnit);
  const meta = useStore((s) => s.meta);
  const timer = useRef(0);
  useEffect(() => {
    const ac = new AbortController();
    setErr(null);
    api.timeline(body, lat, lon, ac.signal).then(setT, (e) => { if (e?.name !== "AbortError") setErr(e.message); });
    return () => ac.abort();
  }, [body, lat, lon]);
  useEffect(() => {
    if (!playing || !t) return;
    timer.current = window.setInterval(() => setK((x) => (x + 1) % t.ticks.length), 450);
    return () => window.clearInterval(timer.current);
  }, [playing, t]);
  useEffect(() => { if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPlaying(false); }, [playing]);

  if (err) return <p className="px-4 text-xs text-alert">{err}</p>;
  if (!t) return <div className="px-4"><Spinner /></div>;
  if (!t.series.length || t.series.every((s) => s.observed === 0)) return <p className="px-4 text-xs text-regolith-400">No time-resolved data for this place{body === "earth" ? " (open water is not analysed)" : ""}.</p>;
  const n = t.ticks.length;
  const conv = (v: number, unit: string) => (unit === "K" && temp === "C" ? v - 273.15 : v);
  const shownUnit = (unit: string) => (unit === "K" && temp === "C" ? "°C" : unit);
  const W = 340, H = 120, L = 40, R = 8, T = 8, B = 22;
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);

  return (
    <div className="px-4">
      {t.series.map((s) => {
        const vals = s.values.map((v) => (v === null ? null : conv(v, s.unit)));
        const nums = vals.filter((v): v is number => v !== null);
        if (!nums.length) return null;
        const lo = Math.min(...nums), hi = Math.max(...nums), pad = Math.max(1, (hi - lo) * 0.1);
        const y = (v: number) => T + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - T - B);
        const segs: string[] = [];
        let cur = "";
        vals.forEach((v, i) => { if (v === null) { if (cur) segs.push(cur); cur = ""; return; } cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
        if (cur) segs.push(cur);
        const now = vals[k];
        const src = meta?.sources_index[s.source];
        return (
          <figure key={s.id} className="mb-3">
            <div className="flex items-baseline justify-between gap-2">
              <figcaption className="text-xs text-regolith-200">{s.label}</figcaption>
              <span className="tnum text-sm font-semibold text-regolith-50">{now === null ? <span className="text-xs font-normal text-regolith-500 italic">not observed</span> : `${Math.round(now)} ${shownUnit(s.unit)}`}</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`${s.label} from ${Math.round(lo)} to ${Math.round(hi)} ${shownUnit(s.unit)} across ${t.axis.toLowerCase()}`}>
              {body === "moon" && <rect x={x(6)} y={T} width={x(18) - x(6)} height={H - T - B} fill="color-mix(in srgb, var(--world) 9%, transparent)" />}
              {[lo, hi].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--hair)" /><text x={L - 4} y={y(v) + 3} textAnchor="end" className="tnum fill-regolith-400 text-[9px]">{Math.round(v)}</text></g>)}
              {segs.map((d) => <path key={d} d={d} fill="none" stroke="var(--color-regolith-100)" strokeWidth={1.6} />)}
              {vals.map((v, i) => v === null && <circle key={i} cx={x(i)} cy={H - B - 3} r={2} fill="none" stroke="var(--color-regolith-500)" />)}
              <line x1={x(k)} x2={x(k)} y1={T} y2={H - B} stroke="var(--world)" strokeWidth={1.4} />
              {now !== null && <circle cx={x(k)} cy={y(now)} r={3.5} fill="var(--world)" stroke="#08111f" />}
              {[0, Math.floor((n - 1) / 2), n - 1].map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-regolith-400 text-[9px]">{t.ticks[i]}</text>)}
            </svg>
            <p className="text-2xs leading-snug text-regolith-500"><EvidenceTag kind={s.evidence} /> {s.note} {src ? `Source: ${src.name}.` : ""}{body === "moon" ? " Shaded: local daytime." : ""}</p>
          </figure>
        );
      })}
      <div className="flex items-center gap-2">
        <IconButton label={playing ? "Pause" : "Play through time"} onClick={() => setPlaying(!playing)} className="size-7">{playing ? <Pause size={13} /> : <Play size={13} />}</IconButton>
        <input type="range" min={0} max={n - 1} value={k} onChange={(e) => { setPlaying(false); setK(Number(e.target.value)); }} className="slider" aria-label={t.axis} aria-valuetext={t.ticks[k]} />
        <span className="tnum w-16 shrink-0 text-right text-xs text-regolith-200">{t.ticks[k]}</span>
      </div>
      <p className="mt-0.5 text-2xs text-regolith-500">{t.axis}{body === "earth" ? ". Months follow the calendar; southern-hemisphere summer is December to February." : body === "mars" ? ". Ls 90° is northern summer, Ls 270° southern summer." : "."}</p>
    </div>
  );
}
