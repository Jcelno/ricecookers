import {
  BookOpen,
  Check,
  CircleHelp,
  Database,
  Globe2,
  Link2,
  Search as SearchIcon,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "@/lib/api";
import { copyCurrentViewLink } from "@/lib/sharing";
import { formatCoord } from "@/lib/format";
import type { Body, SearchHit } from "@/lib/types";
import { useStore } from "@/store";
import { Button, cx } from "./ui/primitives";
import {
  classification,
  RegistrySelect,
  SiteCatalog,
} from "./catalog/SiteCatalog";

function Menu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" data-tour="science">
      <Button
        onClick={() => setOpen(!open)}
        aria-label="Science & Data"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Database size={16} />
        <span className="max-lg:hidden">Science & Data</span>
      </Button>
      {open && (
        <div
          role="menu"
          className="surface-float absolute right-0 top-11 z-50 w-52 rounded-lg p-2 ring-1 ring-[var(--hair)]"
        >
          {(
            [
              ["methodology", "Methodology", BookOpen],
              ["sources", "Data Sources", Database],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="menuitem"
              className="ctl flex w-full items-center gap-2 rounded-md p-3 text-left"
              onClick={() => {
                useStore.getState().setSheet(id);
                setOpen(false);
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function Share() {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "failed">(
    "idle",
  );
  const [url, setUrl] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const share = async () => {
    setState("copying");
    const result = await copyCurrentViewLink();
    setUrl(result.url);
    setState(result.copied ? "copied" : "failed");
    clearTimeout(timer.current);
    if (result.copied) timer.current = setTimeout(() => setState("idle"), 2600);
  };
  return (
    <div className="relative" data-tour="share">
      <Button
        variant="outline"
        onClick={() => void share()}
        disabled={state === "copying"}
        aria-label="Copy View Link"
        title="Copy View Link"
      >
        {state === "copied" ? <Check size={14} /> : <Link2 size={14} />}
        <span aria-live="polite">
          {state === "copied" ? (
            "Copied!"
          ) : state === "copying" ? (
            "Copying…"
          ) : (
            <>
              <span className="max-sm:hidden">Copy View </span>
              <span className="sm:hidden">Copy </span>Link
            </>
          )}
        </span>
      </Button>
      {state === "failed" && (
        <div className="surface-float absolute right-0 top-11 z-50 w-[min(320px,90vw)] rounded-lg p-4 ring-1 ring-[var(--hair)]">
          <p className="mb-2 text-xs" role="status">
            Automatic copying is unavailable. Select and copy this link:
          </p>
          <input
            aria-label="View link to copy manually"
            className="field w-full"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
          />
          <Button className="mt-2" size="sm" onClick={() => setState("idle")}>
            Close
          </Button>
        </div>
      )}
    </div>
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
  const analogs = useStore((s) => s.pins[target]);

  useEffect(() => {
    setQ("");
    setHits([]);
  }, [target]);

  useEffect(() => {
    const coord = q.match(
      /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/,
    );
    if (coord) {
      const lat = Number(coord[1]);
      const lon = Number(coord[2]);
      if (Math.abs(lat) <= 90 && lon >= -180 && lon <= 360)
        setHits([
          {
            name: formatCoord(lat, lon > 180 ? lon - 360 : lon),
            type: "Coordinates",
            lat,
            lon: lon > 180 ? lon - 360 : lon,
          },
        ]);
      else setHits([]);
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
      ...saved
        .filter((x) => x.body === target && x.label.toLowerCase().includes(ql))
        .map((x) => ({
          name: x.label,
          type: "Saved place",
          lat: x.lat,
          lon: x.lon,
        })),
      ...analogs
        .filter((a) =>
          `${a.name} ${a.note} ${a.theme ?? ""}`.toLowerCase().includes(ql),
        )
        .map((a) => ({
          name: a.name,
          type: classification(a),
          lat: a.lat,
          lon: a.lon,
        })),
    ];
    setHits(local);
    const t = setTimeout(() => {
      api
        .search(target, q, ctl.signal)
        .then((r) => {
          setHits(
            [
              ...local,
              ...r.map((h) => ({
                ...h,
                type: h.type === "place" ? "City or town" : h.type,
              })),
            ].filter(
              (h, i, a) =>
                a.findIndex(
                  (x) =>
                    Math.abs(x.lat - h.lat) < 0.001 &&
                    Math.abs(x.lon - h.lon) < 0.001,
                ) === i,
            ),
          );
          setActive(0);
        })
        .catch(() => undefined);
    }, 140);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, target, saved, analogs]);

  useEffect(() => {
    const close = (e: MouseEvent) =>
      !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const go = (h: SearchHit) => {
    setOpen(false);
    setQ("");
    const span =
      h.diam_km && h.diam_km > 20
        ? Math.min(h.diam_km * 3.5, 6000)
        : target === "earth"
          ? 900
          : 500;
    if (mode === "twin") void pickEarth(h.lat, h.lon, true);
    else if (mode === "near")
      useStore
        .getState()
        .setNear({
          nearLoc: { lat: h.lat, lon: h.lon, source: "search", label: h.name },
        });
    else void select(target, h.lat, h.lon, { fly: true, spanKm: span });
  };

  return (
    <div
      ref={box}
      className="relative w-[min(310px,30vw)] min-w-[160px] max-sm:w-full"
    >
      <SearchIcon
        size={14}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-regolith-400"
      />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          }
          if (e.key === "Enter" && hits[active]) go(hits[active]);
          if (e.key === "Escape") setOpen(false);
        }}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="search-results"
        aria-label={`Search places on ${target === "earth" ? "Earth" : target === "moon" ? "the Moon" : "Mars"}`}
        placeholder={
          target === "earth"
            ? "Find a place, or type lat, lon"
            : target === "moon"
              ? "Find a crater or mare, or lat, lon"
              : "Find a crater or plain, or lat, lon"
        }
        className="focusable h-8 w-full rounded-sm bg-basalt-950/70 pr-7 pl-8 text-sm text-regolith-50 ring-1 ring-[var(--hair)] placeholder:text-regolith-500"
      />
      {q && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setQ("")}
          className="ctl absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-regolith-400"
        >
          <X size={13} />
        </button>
      )}
      {open && q.trim().length >= 2 && (
        <ul
          id="search-results"
          role="listbox"
          className="surface-float anim-rise scroll absolute top-10 right-0 left-0 z-50 max-h-[60vh] rounded-md py-1 ring-1 ring-[var(--hair)]"
        >
          <li className="px-3 pt-1 pb-1.5 text-2xs text-regolith-500">
            {target === "earth"
              ? mode === "near"
                ? "Places on Earth: sets your Near Me starting point"
                : "Places on Earth"
              : `Named features on ${target === "moon" ? "the Moon (IAU)" : "Mars (IAU)"}`}
          </li>
          {hits.length === 0 && (
            <li className="px-3 py-2 text-sm text-regolith-400">
              No named place matches. Try coordinates such as -4.6, 137.4.
            </li>
          )}
          {hits.map((h, k) => (
            <li
              key={`${h.name}-${k}`}
              role="option"
              aria-selected={k === active}
            >
              <button
                type="button"
                onMouseEnter={() => setActive(k)}
                onClick={() => go(h)}
                aria-current={k === active}
                className="row-ctl flex w-full items-baseline gap-2 px-3 py-1.5 text-left"
              >
                <span className="placename min-w-0 flex-1 truncate text-md text-regolith-50">
                  {h.name}
                </span>
                <span className="shrink-0 text-xs text-regolith-400">
                  {h.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TopBar() {
  const s = useStore(
    useShallow((s) => ({
      body: s.body,
      mode: s.mode,
      saved: s.saved,
      pins: s.pins,
      twinOrigin: s.twinOrigin,
      purpose: s.purpose,
      meta: s.meta,
      saveNotice: s.saveNotice,
      persistenceError: s.persistenceError,
      setBody: s.setBody,
      setMode: s.setMode,
      setSheet: s.setSheet,
      setPurpose: s.setPurpose,
      setTarget: s.setTarget,
    })),
  );
  const [catalog, setCatalog] = useState(false);
  const analog = ["twin", "compare", "near"].includes(s.mode);
  useEffect(() => {
    if (!s.saveNotice) return;
    const timer = setTimeout(
      () => useStore.setState({ saveNotice: null }),
      4500,
    );
    return () => clearTimeout(timer);
  }, [s.saveNotice]);
  const n =
    s.saved.sites.length + s.saved.missions.length + s.saved.comparisons.length;
  const target = s.twinOrigin;
  const targetPin = target
    ? s.pins[target.body].find(
        (p) =>
          Math.abs(p.lat - target.lat) < 0.001 &&
          Math.abs(p.lon - target.lon) < 0.001,
      )
    : null;
  return (
    <>
      <header className="app-header surface" data-tour="navigation">
        <button
          className="brand ctl"
          aria-label="RADIUM home"
          onClick={() => s.setMode("explore")}
        >
          <img src="/radium.svg" alt="" width="30" height="30" />
          <span>
            <strong>RADIUM</strong>
            <small>NASA Space Apps Challenge</small>
          </span>
        </button>
        <nav aria-label="Primary navigation" className="primary-nav">
          {(
            [
              { id: "explore", label: "Explore" },
              { id: "mission", label: "Mission Planner" },
              { id: "twin", label: "Earth Analogs" },
              { id: "saved", label: "Saved" },
            ] as const
          ).map((m) => (
            <button
              data-tour={`nav-${m.id}`}
              className="ctl"
              key={m.id}
              aria-current={
                (m.id === "twin" ? analog : s.mode === m.id)
                  ? "page"
                  : undefined
              }
              onClick={() => s.setMode(m.id)}
            >
              {m.label}
              {m.id === "saved" && n > 0 && (
                <span className="nav-count">{n}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <Share />
          <Menu />
          <Button
            data-tour="help"
            aria-label="Help and interactive tutorial"
            title="Help and interactive tutorial"
            onClick={() => s.setSheet("intro")}
          >
            <CircleHelp size={17} />
            <span className="max-xl:hidden">Help</span>
          </Button>
        </div>
      </header>
      <div className="workspace-bar" data-tour="workspace">
        {analog ? (
          <nav className="workspace-tabs" aria-label="Earth Analogs workspace">
            {(
              [
                { id: "twin", label: "Discover" },
                { id: "compare", label: "Compare" },
                { id: "near", label: "Near Me" },
              ] as const
            ).map((t) => (
              <button
                className="ctl"
                key={t.id}
                aria-current={s.mode === t.id ? "page" : undefined}
                onClick={() => s.setMode(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        ) : (
          <nav aria-label="World" data-tour="worlds" className="world-switch">
            {(["moon", "mars", "earth"] as Body[]).map((b) => (
              <button
                className="ctl"
                key={b}
                aria-pressed={s.body === b}
                onClick={() => {
                  s.setBody(b);
                  if (s.mode === "saved") s.setMode("explore");
                }}
              >
                <span className={`planet-dot ${b}`} />
                {b[0].toUpperCase() + b.slice(1)}
              </button>
            ))}
          </nav>
        )}
        <div className="workspace-context">
          {analog ? (
            <>
              <RegistrySelect
                label="Planetary target"
                placeholder={
                  target
                    ? `${target.body === "moon" ? "Moon" : "Mars"}: ${formatCoord(target.lat, target.lon)}`
                    : undefined
                }
                worlds={["moon", "mars"]}
                value={
                  targetPin && target ? `${target.body}:${targetPin.id}` : ""
                }
                onSelect={(p, b) => {
                  if (b !== "earth")
                    s.setTarget({ body: b, lat: p.lat, lon: p.lon });
                }}
              />
              {target && (
                <label className="registry-select">
                  <span>Research purpose</span>
                  <select
                    data-tour="purpose"
                    className="field"
                    aria-label="Research purpose"
                    value={s.purpose}
                    onChange={(e) => s.setPurpose(e.target.value)}
                  >
                    {s.meta?.purposes[target.body].map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <Search />
          )}
        </div>
        <Button
          data-tour="catalog-button"
          variant="outline"
          onClick={() => setCatalog(true)}
        >
          <Globe2 size={15} />
          <span className="max-sm:hidden">Research </span>Sites
          <span className="text-2xs opacity-70">
            {Object.values(s.pins).reduce((a, p) => a + p.length, 0)}
          </span>
        </Button>
      </div>
      {s.saveNotice && (
        <div className="save-toast" role="status">
          {s.persistenceError ?? s.saveNotice}
        </div>
      )}
      {catalog && <SiteCatalog onClose={() => setCatalog(false)} />}
    </>
  );
}
