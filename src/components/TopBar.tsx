import { BookOpen, Bookmark, CircleHelp, Database, Link2, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { currentLink } from "@/lib/deeplink";
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
const MODES: { id: Mode; label: string; short: string; title: string }[] = [
  { id: "explore", label: "Explore", short: "Explore", title: "Inspect measurements anywhere on the three worlds" },
  { id: "mission", label: "Mission Planner", short: "Planner", title: "Grade Moon or Mars sites against mission priorities you set, and compare scenarios" },
  { id: "twin", label: "Earth Analogs", short: "Analogs", title: "Find and compare places on Earth that resemble a Moon or Mars site" },
  { id: "compare", label: "Compare", short: "Compare", title: "The selected Moon or Mars site and Earth place side by side" },
  { id: "near", label: "Near Me", short: "Near Me", title: "Find documented analog sites, or the best matches, near a place on Earth" },
];

function Menu() {
  const setSheet = useStore((s) => s.setSheet);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", off);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", off); window.removeEventListener("keydown", esc); };
  }, [open]);
  const go = (sheet: "methodology" | "sources" | "intro") => { setOpen(false); setSheet(sheet); };
  const share = async () => {
    try { await navigator.clipboard.writeText(currentLink()); setNote("Link copied"); } catch { setNote("Copy failed: use the address bar"); }
    setTimeout(() => { setNote(null); setOpen(false); }, 1600);
  };
  const item = "ctl flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-regolith-100";
  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title="Methods, data sources, help and sharing">
        <Database size={15} />
        <span className="hidden xl:inline">Science &amp; Data</span>
      </Button>
      {open && (
        <div role="menu" className="surface-float anim-fade absolute top-[calc(100%+6px)] right-0 z-50 w-60 rounded-md p-1 ring-1 ring-[var(--hair)]">
          <button role="menuitem" type="button" className={item} onClick={() => go("methodology")}><BookOpen size={15} /> Methodology</button>
          <button role="menuitem" type="button" className={item} onClick={() => go("sources")}><Database size={15} /> Data sources</button>
          <button role="menuitem" type="button" className={item} onClick={() => go("intro")}><CircleHelp size={15} /> Guide to RADIUM</button>
          <button role="menuitem" type="button" className={item} onClick={() => void share()}><Link2 size={15} /> {note ?? "Copy a link to this view"}</button>
        </div>
      )}
    </div>
  );
}

function Saved() {
  const saved = useStore((s) => s.saved);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", off);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", off); window.removeEventListener("keydown", esc); };
  }, [open]);
  const st = useStore.getState();
  const n = saved.sites.length + saved.missions.length;
  const W = { moon: "Moon", mars: "Mars", earth: "Earth" } as const;
  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen(!open)} aria-expanded={open} title="Places and missions you saved in this browser">
        <Bookmark size={15} />
        <span className="hidden 2xl:inline">Saved</span>
        {n > 0 && <span className="tnum rounded-full bg-basalt-700 px-1.5 text-2xs text-regolith-100">{n}</span>}
      </Button>
      {open && (
        <div className="surface-float anim-fade absolute top-[calc(100%+6px)] right-0 z-50 max-h-[70vh] w-80 overflow-auto rounded-md p-2 ring-1 ring-[var(--hair)]">
          <div className="px-1.5 pb-1 text-2xs text-regolith-400">Saved in this browser only. Nothing is sent anywhere.</div>
          <div className="px-1.5 pt-1 text-xs font-semibold text-regolith-100">Places</div>
          {saved.sites.length === 0 ? <p className="px-1.5 py-1 text-2xs text-regolith-500">Use Save on any place to keep it here.</p> : (
            <ul>{saved.sites.map((s, i) => (
              <li key={`${s.body}${s.lat}${s.lon}`} className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs">
                <button type="button" className="row-ctl min-w-0 flex-1 rounded-sm px-1 py-0.5 text-left" onClick={() => { setOpen(false); st.setBody(s.body); st.setMode("explore"); void st.select(s.body, s.lat, s.lon, { fly: true, spanKm: s.body === "earth" ? 900 : 500 }); }}>
                  <span className="placename block truncate text-sm text-regolith-50">{s.label}</span><span className="text-2xs text-regolith-400">{W[s.body]}, {s.lat.toFixed(2)}, {s.lon.toFixed(2)}</span>
                </button>
                <button type="button" className="ctl rounded-sm px-1.5 py-1 text-2xs text-regolith-300" onClick={() => st.addCompare(s)}>Compare</button>
                <button type="button" className="ctl grid size-6 place-items-center rounded-sm text-regolith-400" aria-label={`Remove ${s.label}`} onClick={() => st.removeSaved("sites", i)}><X size={12} /></button>
              </li>
            ))}</ul>
          )}
          <div className="mt-1 px-1.5 pt-1 text-xs font-semibold text-regolith-100">Missions</div>
          {saved.missions.length === 0 ? <p className="px-1.5 py-1 text-2xs text-regolith-500">Save a mission from the Mission Planner's last step.</p> : (
            <ul>{saved.missions.map((m, i) => (
              <li key={m.id} className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs">
                <button type="button" className="row-ctl min-w-0 flex-1 rounded-sm px-1 py-0.5 text-left" onClick={() => {
                  setOpen(false);
                  useStore.setState((x) => ({ rawWeights: { ...x.rawWeights, [m.mission]: m.weights }, limitsOn: { ...x.limitsOn, [m.mission]: m.limits } }));
                  st.setMission(m.mission); st.setMode("mission");
                  if (m.site) void st.select(m.site.body, m.site.lat, m.site.lon, { fly: true, spanKm: 500 });
                }}>
                  <span className="block truncate text-sm text-regolith-50">{m.name}</span><span className="text-2xs text-regolith-400">{m.created}{m.site ? `, ${m.site.label}` : ""}</span>
                </button>
                <button type="button" className="ctl grid size-6 place-items-center rounded-sm text-regolith-400" aria-label={`Remove ${m.name}`} onClick={() => st.removeSaved("missions", i)}><X size={12} /></button>
              </li>
            ))}</ul>
          )}
        </div>
      )}
    </div>
  );
}

function Share() {
  const [note, setNote] = useState<string | null>(null);
  const share = async () => {
    try { await navigator.clipboard.writeText(currentLink()); setNote("Copied"); } catch { setNote("Copy failed"); }
    setTimeout(() => setNote(null), 1800);
  };
  return (
    <Button className="max-sm:hidden" onClick={() => void share()} title="Copy a link that reopens this exact view">
      <Link2 size={15} />
      <span className="hidden 2xl:inline" aria-live="polite">{note ?? "Share"}</span>
    </Button>
  );
}

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
  // In Earth Analogs and Near Me the search box looks for places on Earth.
  const target: Body = mode === "twin" || mode === "near" ? "earth" : body;
  const saved = useStore((s) => s.saved.sites);
  const analogs = useStore((s) => s.pins.earth);

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
    const ql = q.trim().toLowerCase();
    // Saved places on this world and, on Earth, documented analog sites are searched locally and listed first.
    const local: SearchHit[] = [
      ...saved.filter((x) => x.body === target && x.label.toLowerCase().includes(ql)).map((x) => ({ name: x.label, type: "Saved place", lat: x.lat, lon: x.lon })),
      ...(target === "earth" ? analogs.filter((a) => a.name.toLowerCase().includes(ql)).map((a) => ({ name: a.name, type: "Documented analog site", lat: a.lat, lon: a.lon })) : []),
    ];
    setHits(local);
    const t = setTimeout(() => {
      api.search(target, q, ctl.signal).then((r) => { setHits([...local, ...r.map((h) => ({ ...h, type: h.type === "place" ? "City or town" : h.type }))]); setActive(0); }).catch(() => undefined);
    }, 140);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, target, saved, analogs]);

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
    else if (mode === "near") useStore.getState().setNear({ nearLoc: { lat: h.lat, lon: h.lon, source: "search", label: h.name } });
    else void select(target, h.lat, h.lon, { fly: true, spanKm: span });
  };

  return (
    <div ref={box} className="relative hidden w-[min(260px,18vw)] min-[1180px]:block">
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
          <li className="px-3 pt-1 pb-1.5 text-2xs text-regolith-500">{target === "earth" ? (mode === "near" ? "Places on Earth: sets your Near Me starting point" : "Places on Earth") : `Named features on ${target === "moon" ? "the Moon (IAU)" : "Mars (IAU)"}`}</li>
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
            aria-pressed={(mode === "explore" || mode === "mission") && body === w.id}
            onClick={() => setBody(w.id)}
            title={mode === "twin" ? `Leave Earth Twin and explore ${w.label}` : `Explore ${w.label}`}
            className="ctl h-7 rounded-sm px-3 text-sm font-medium text-regolith-300 max-sm:px-2"
          >
            {w.label}
          </button>
        ))}
      </nav>

      <nav aria-label="Mode" className="no-scrollbar flex min-w-0 items-center gap-0.5 max-sm:overflow-x-auto">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.title}
            aria-current={mode === m.id ? "page" : undefined}
            onClick={() => setMode(m.id)}
            className={cx("ctl relative h-8 rounded-sm px-2.5 text-sm font-medium whitespace-nowrap max-sm:px-1.5", mode === m.id ? "text-regolith-50" : "text-regolith-400")}
          >
            <span className="max-lg:hidden">{m.label}</span><span className="lg:hidden">{m.short}</span>
            {mode === m.id && <span className="absolute inset-x-2.5 -bottom-[10px] h-0.5 rounded-full bg-world" />}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1.5 max-sm:gap-0">
        <Search />
        <Saved />
        <Share />
        <Button className="max-sm:hidden" onClick={() => setSheet("intro")} title="A short guide to using RADIUM">
          <CircleHelp size={15} />
          <span className="hidden 2xl:inline">Help</span>
        </Button>
        <Menu />
      </div>
    </header>
  );
}
