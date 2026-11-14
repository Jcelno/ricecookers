import { BookOpen, Database, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { formatCoord } from "@/lib/format";
import type { Body, SearchHit } from "@/lib/types";
import { type Mode, useStore } from "@/store";

import { Button, cx } from "./ui/primitives";

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
      <circle cx="16" cy="16" r="6.2" fill="var(--world)" />
      <g stroke="var(--color-regolith-100)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M16 2.6v3.6M16 25.8v3.6M2.6 16h3.6M25.8 16h3.6" />
        <path d="M6.5 6.5l2 2M23.5 23.5l2 2M6.5 25.5l2-2M23.5 8.5l2-2" opacity=".5" />
      </g>
    </svg>
  );
}

const WORLDS: { id: Body; label: string }[] = [
  { id: "moon", label: "Moon" },
  { id: "mars", label: "Mars" },
  { id: "earth", label: "Earth" },
];
const MODES: { id: Mode; label: string; title: string }[] = [
  { id: "explore", label: "Explore", title: "Inspect measurements anywhere on the three worlds" },
  { id: "mission", label: "Design a mission", title: "Grade Moon or Mars sites against mission priorities you set" },
  { id: "twin", label: "Earth Twin", title: "Find places on Earth that resemble a Moon or Mars site" },
];

function Search() {
  const body = useStore((s) => s.body);
  const mode = useStore((s) => s.mode);
  const select = useStore((s) => s.select);
  const pickEarth = useStore((s) => s.pickEarth);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // In Earth Twin mode the search box looks for places on Earth to compare.
  const target: Body = mode === "twin" ? "earth" : body;

  useEffect(() => {
    setQ("");
    setHits([]);
  }, [target]);

  useEffect(() => {
    const coord = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coord) {
      const lat = Number(coord[1]);
      const lon = Number(coord[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 360) setHits([{ name: formatCoord(lat, lon > 180 ? lon - 360 : lon), type: "Coordinates", lat, lon: lon > 180 ? lon - 360 : lon }]);
      return;
    }
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api.search(target, q, ctl.signal).then((r) => { setHits(r); setActive(0); }).catch(() => undefined);
    }, 140);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, target]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const go = (h: SearchHit) => {
    setOpen(false);
    setQ("");
    const span = h.diam_km && h.diam_km > 20 ? Math.min(h.diam_km * 3.5, 6000) : target === "earth" ? 900 : 500;
    if (mode === "twin") void pickEarth(h.lat, h.lon, true);
    else void select(target, h.lat, h.lon, { fly: true, spanKm: span });
  };

  return (
    <div ref={box} className="relative hidden w-[min(300px,22vw)] min-[1180px]:block">
      <SearchIcon size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-regolith-400" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter" && hits[active]) go(hits[active]);
          if (e.key === "Escape") setOpen(false);
        }}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="search-results"
        aria-label={`Search places on ${target === "earth" ? "Earth" : target === "moon" ? "the Moon" : "Mars"}`}
        placeholder={target === "earth" ? "Find a place, or type lat, lon" : target === "moon" ? "Find a crater or mare, or lat, lon" : "Find a crater or plain, or lat, lon"}
        className="focusable h-8 w-full rounded-sm bg-basalt-950/70 pr-7 pl-8 text-sm text-regolith-50 ring-1 ring-[var(--hair)] placeholder:text-regolith-500"
      />
      {q && (
        <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="ctl absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-regolith-400">
          <X size={13} />
        </button>
      )}
      {open && q.trim().length >= 2 && (
        <ul id="search-results" role="listbox" className="surface-float anim-rise scroll absolute top-10 right-0 left-0 z-50 max-h-[60vh] rounded-md py-1 ring-1 ring-[var(--hair)]">
          {hits.length === 0 && <li className="px-3 py-2 text-sm text-regolith-400">No named place matches. Try coordinates such as -4.6, 137.4.</li>}
          {hits.map((h, k) => (
            <li key={`${h.name}-${k}`} role="option" aria-selected={k === active}>
              <button type="button" onMouseEnter={() => setActive(k)} onClick={() => go(h)} aria-current={k === active} className="row-ctl flex w-full items-baseline gap-2 px-3 py-1.5 text-left">
                <span className="placename min-w-0 flex-1 truncate text-md text-regolith-50">{h.name}</span>
                <span className="shrink-0 text-xs text-regolith-400">{h.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TopBar() {
  const body = useStore((s) => s.body);
  const mode = useStore((s) => s.mode);
  const setBody = useStore((s) => s.setBody);
  const setMode = useStore((s) => s.setMode);
  const setSheet = useStore((s) => s.setSheet);

  return (
    <header className="surface hair-b relative z-30 flex h-[var(--top-h)] shrink-0 items-center gap-3 px-3 max-sm:gap-1.5 max-sm:px-2">
      <div className="flex items-center gap-2 pr-1">
        <Mark />
        <span className="text-md font-semibold tracking-[0.14em] text-regolith-50 max-sm:hidden">RADIUM</span>
      </div>

      <nav aria-label="World" className="inline-flex rounded-md bg-basalt-950/70 p-0.5 ring-1 ring-[var(--hair)]">
        {WORLDS.map((w) => (
          <button
            key={w.id}
            type="button"
            aria-pressed={mode !== "twin" && body === w.id}
            onClick={() => setBody(w.id)}
            title={mode === "twin" ? `Leave Earth Twin and explore ${w.label}` : `Explore ${w.label}`}
            className="ctl h-7 rounded-sm px-3 text-sm font-medium text-regolith-300 max-sm:px-2"
          >
            {w.label}
          </button>
        ))}
      </nav>

      <nav aria-label="Mode" className="flex min-w-0 items-center gap-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.title}
            aria-current={mode === m.id ? "page" : undefined}
            onClick={() => setMode(m.id)}
            className={cx("ctl relative h-8 rounded-sm px-2.5 text-sm font-medium whitespace-nowrap max-sm:px-1.5", mode === m.id ? "text-regolith-50" : "text-regolith-400")}
          >
            {m.id === "mission" ? <><span className="max-md:hidden">Design a mission</span><span className="md:hidden">Mission</span></> : m.id === "twin" ? <><span className="max-sm:hidden">Earth Twin</span><span className="sm:hidden">Twin</span></> : m.label}
            {mode === m.id && <span className="absolute inset-x-2.5 -bottom-[10px] h-0.5 rounded-full bg-world" />}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1.5 max-sm:gap-0">
        <Search />
        <Button onClick={() => setSheet("methodology")} title="How RADIUM measures, scores and grades">
          <BookOpen size={15} />
          <span className="hidden lg:inline">Methodology</span>
        </Button>
        <Button className="max-sm:hidden" onClick={() => setSheet("sources")} title="Every dataset RADIUM uses, with its limits">
          <Database size={15} />
          <span className="hidden lg:inline">Data sources</span>
        </Button>
      </div>
    </header>
  );
}
