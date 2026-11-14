import { Home, Minus, Plus } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { EvidenceTag, IconButton, Notice } from "@/components/ui/primitives";
import { overlay as overlayUrl } from "@/lib/api";
import { formatCoord, formatKm, GRADE_COLOR, GRADE_MEANING } from "@/lib/format";
import type { Body, GridLayer, Legend as LegendT, Meta, Planet, TileLayer } from "@/lib/types";
import { shares, useStore } from "@/store";

import { EarthMap, LABEL_ATTRIBUTION } from "./EarthMap";
import { type GlobeHandle, GlobeView, type ImageOverlay, type SiteMarker, type ViewState } from "./GlobeView";
import { Tapes, type TapesHandle } from "./Tapes";

const GLOBAL: [number, number, number, number] = [-180, -90, 180, 90];

export function capRects(meta: Meta) {
  const e = meta.cap.edge_lat;
  return { south: [-180, -90, 180, -e] as [number, number, number, number], north: [-180, e, 180, 90] as [number, number, number, number] };
}

/** PNG overlays for one RADIUM grid variable on a planet (global image plus polar caps on the Moon). */
export function variableImages(meta: Meta, body: Planet, layer: GridLayer): ImageOverlay[] {
  const out: ImageOverlay[] = [];
  if (!layer.polar_only) out.push({ key: `var:${body}:${layer.id}:global`, url: overlayUrl.variable(body, layer.id, "global"), rect: GLOBAL });
  if (body === "moon" && layer.has_polar) {
    const r = capRects(meta);
    out.push({ key: `var:moon:${layer.id}:south`, url: overlayUrl.variable("moon", layer.id, "south"), rect: r.south });
    out.push({ key: `var:moon:${layer.id}:north`, url: overlayUrl.variable("moon", layer.id, "north"), rect: r.north });
  }
  return out;
}

function fmtLegend(v: number, unit: string, fmt?: string | null) {
  if (fmt === "percent") return `${Math.round(v * 100)}%`;
  const a = Math.abs(v);
  const s = a >= 1000 ? v.toLocaleString("en-US") : a >= 10 || Number.isInteger(v) ? String(v) : v.toFixed(a < 1 ? 2 : 1);
  return unit ? `${s} ${unit}` : s;
}

function GradientLegend({ legend, unit, fmt }: { legend: LegendT; unit: string; fmt?: string | null }) {
  return (
    <div>
      <div className="h-2 rounded-xs ring-1 ring-black/40" style={{ background: `linear-gradient(to right, ${legend.stops.join(",")})` }} />
      <div className="tnum mt-1 flex justify-between text-2xs text-regolith-300">
        <span>{fmtLegend(legend.min, unit, fmt)}</span>
        {legend.log && <span className="text-regolith-500">logarithmic scale</span>}
        <span>{fmtLegend(legend.max, unit, fmt)}</span>
      </div>
    </div>
  );
}

export function GradeLegend({ note }: { note?: string }) {
  const meta = useStore((s) => s.meta);
  return (
    <div>
      <div className="flex gap-1">
        {meta?.grades.map((g) => (
          <div key={g.grade} className="min-w-0 flex-1">
            <div className="grid h-5 place-items-center rounded-xs text-2xs font-semibold text-basalt-950" style={{ background: GRADE_COLOR[g.grade] }}>
              {g.grade}
            </div>
            <div className="mt-0.5 truncate text-center text-[10px] text-regolith-400">{GRADE_MEANING[g.grade]}</div>
          </div>
        ))}
      </div>
      {note && <p className="mt-1.5 text-2xs leading-snug text-regolith-400">{note}</p>}
    </div>
  );
}

function LegendCard({ children, title, sub }: { children: React.ReactNode; title: string; sub?: React.ReactNode }) {
  return (
    <div className="surface-float anim-rise pointer-events-auto w-[272px] rounded-md p-3 ring-1 ring-[var(--hair)]">
      <div className="text-sm leading-tight font-semibold text-regolith-50">{title}</div>
      {sub && <div className="mt-0.5 mb-2 text-2xs leading-snug text-regolith-300">{sub}</div>}
      {children}
    </div>
  );
}

export function Stage() {
  const meta = useStore((s) => s.meta)!;
  const body = useStore((s) => s.body);
  const mode = useStore((s) => s.mode);
  const layerState = useStore((s) => s.layers[s.body]);
  const allPins = useStore((s) => s.pins[s.body]);
  const cell = useStore((s) => s.cell);
  const selection = useStore((s) => s.selection);
  const focus = useStore((s) => s.focus);
  const cursor = useStore((s) => s.cursor);
  const rank = useStore((s) => s.rank);
  const missionId = useStore((s) => s.missionId);
  const raw = useStore((s) => s.rawWeights[s.missionId]);
  const limits = useStore((s) => s.limitsOn[s.missionId]);
  const showSuitability = useStore((s) => s.showSuitability);
  const select = useStore((s) => s.select);
  const setCursor = useStore((s) => s.setCursor);

  const handle = useRef<GlobeHandle>(null);
  const tapes = useRef<TapesHandle>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const [status, setStatus] = useState<{ ready: boolean; error: string | null }>({ ready: false, error: null });
  const viewTick = useRef(0);

  const onView = useCallback((v: ViewState) => {
    tapes.current?.draw(v);
    const now = performance.now();
    if (now - viewTick.current > 250) {
      viewTick.current = now;
      setView(v);
    }
  }, []);
  const onPick = useCallback((lat: number, lon: number) => void select(useStore.getState().body, lat, lon), [select]);
  const onCursor = useCallback((c: { lat: number; lon: number } | null) => setCursor(c ? { body: useStore.getState().body, ...c } : null), [setCursor]);

  const inMission = mode === "mission" && body !== "earth";
  const mission = meta.missions.find((m) => m.id === missionId);

  // ---- which overlay is on -------------------------------------------------
  const tileLayers = body === "earth" ? [] : meta.layers[body].tiles;
  const gridLayers = meta.layers[body].grid;
  const base = body === "earth" ? undefined : (tileLayers.find((t) => t.id === layerState.base) ?? tileLayers[0]);
  const basemap = body === "earth" ? (meta.layers.earth.tiles.find((b) => b.id === layerState.base) ?? meta.layers.earth.tiles[0]) : undefined;
  const ov = layerState.overlay;
  const tileOverlay: TileLayer | null = !inMission && ov?.kind === "tiles" ? (tileLayers.find((t) => t.id === ov.id) ?? null) : null;
  const gridOverlay: GridLayer | null = !inMission && ov?.kind === "grid" ? (gridLayers.find((g) => g.id === ov.id) ?? null) : null;

  const weightKey = JSON.stringify(raw ?? {});
  const limitKey = (limits ?? []).join(",");
  const images: ImageOverlay[] = useMemo(() => {
    if (body === "earth") return [];
    if (inMission && showSuitability && raw) {
      const out: ImageOverlay[] = [{ key: `suit:${missionId}:${weightKey}:${limitKey}:g`, url: overlayUrl.suitability(missionId, raw, limits, "global"), rect: GLOBAL }];
      if (body === "moon") {
        const r = capRects(meta);
        out.push({ key: `suit:${missionId}:${weightKey}:${limitKey}:s`, url: overlayUrl.suitability(missionId, raw, limits, "south"), rect: r.south });
        out.push({ key: `suit:${missionId}:${weightKey}:${limitKey}:n`, url: overlayUrl.suitability(missionId, raw, limits, "north"), rect: r.north });
      }
      return out;
    }
    if (gridOverlay) return variableImages(meta, body, gridOverlay);
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, inMission, showSuitability, missionId, weightKey, limitKey, gridOverlay?.id, meta]);

  const earthOverlay = body === "earth" && gridOverlay ? overlayUrl.variable("earth", gridOverlay.id) : null;
  const dataOverlayOn = images.length > 0 || !!earthOverlay;

  const pins = useMemo(
    () => allPins.filter((p) => (p.kind === "landing" && layerState.pins.landing) || (p.kind === "feature" && layerState.pins.feature) || (p.kind === "analog" && layerState.pins.analog)),
    [allPins, layerState.pins.landing, layerState.pins.feature, layerState.pins.analog],
  );

  const markers: SiteMarker[] = useMemo(() => {
    if (!inMission || !rank || rank.mission !== missionId) return [];
    return rank.sites.map((s) => ({
      id: s.id, lat: s.lat, lon: s.lon, text: String(s.rank), grade: s.grade,
      active: !!cell && cell.body === body && Math.abs(cell.cell.lat - s.lat) < 1e-6 && Math.abs(cell.cell.lon - s.lon) < 1e-6,
    }));
  }, [inMission, rank, missionId, cell, body]);

  const sel = useMemo(() => {
    if (cell && cell.body === body) return { lat: cell.cell.lat, lon: cell.cell.lon, outline: cell.cell.outline };
    if (selection && selection.body === body) return { lat: selection.lat, lon: selection.lon };
    return null;
  }, [cell, selection, body]);

  const sharesNow = shares(raw);
  const attribution =
    body === "earth"
      ? `${basemap?.attribution ?? ""}${layerState.labels ? `. ${LABEL_ATTRIBUTION}` : ""}.`
      : `Imagery: ${base?.title ?? ""}, ${base?.provider ?? "NASA"}${tileOverlay ? `. Overlay: ${tileOverlay.title}` : ""}`;

  return (
    <div className="relative h-full min-w-0 flex-1 overflow-hidden bg-void" data-stage>
      {body === "earth" ? (
        <EarthMap
          ref={handle} basemap={basemap} labels={layerState.labels} overlayUrl={earthOverlay} opacity={layerState.opacity} dimBase={dataOverlayOn}
          pins={pins} selection={sel} focus={focus} onPick={onPick} onCursor={onCursor} onView={onView} onStatus={setStatus}
        />
      ) : (
        <GlobeView
          key={body} ref={handle} body={body} base={base} tileOverlay={tileOverlay} images={images} opacity={layerState.opacity} dimBase={dataOverlayOn}
          pins={pins} markers={markers} selection={sel} focus={focus} onPick={onPick} onCursor={onCursor} onView={onView} onStatus={setStatus}
        />
      )}

      <Tapes ref={tapes} />

      {status.error && (
        <div className="absolute inset-0 z-20 grid place-items-center p-6">
          <div className="max-w-sm">
            <Notice tone="error" title="The map could not start">{status.error} Try a current version of Chrome, Edge, Firefox or Safari with hardware acceleration turned on.</Notice>
          </div>
        </div>
      )}

      {/* map controls */}
      <div className="surface-float absolute top-3 right-3 z-20 flex flex-col rounded-md ring-1 ring-[var(--hair)]">
        <IconButton label="Zoom in" onClick={() => handle.current?.zoom(0.5)}><Plus size={16} /></IconButton>
        <IconButton label="Zoom out" onClick={() => handle.current?.zoom(2)}><Minus size={16} /></IconButton>
        <IconButton label="Reset the view" onClick={() => handle.current?.home()}><Home size={15} /></IconButton>
      </div>

      {/* legend for whatever data layer is drawn */}
      <div className="pointer-events-none absolute bottom-11 left-[72px] z-20 flex flex-col gap-2">
        {inMission && showSuitability && mission && (
          <LegendCard title={`${mission.label}: suitability`} sub="A RADIUM assessment for exploring options, not a mission approval.">
            <GradeLegend note="Dark cells are ruled out by a hard limit. Clear cells have too little data to grade." />
            <p className="mt-1.5 text-2xs leading-snug text-regolith-400">
              Weights now: {mission.criteria.map((c) => `${c.short} ${Math.round((sharesNow[c.id] ?? 0) * 100)}%`).join(", ")}.
            </p>
          </LegendCard>
        )}
        {gridOverlay && (
          <LegendCard
            title={gridOverlay.title}
            sub={<span className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><EvidenceTag kind={gridOverlay.evidence} /><span>{gridOverlay.res}</span></span>}
          >
            {(gridOverlay.legend ?? gridOverlay.polar_legend) && <GradientLegend legend={(gridOverlay.legend ?? gridOverlay.polar_legend)!} unit={gridOverlay.unit} fmt={gridOverlay.fmt} />}
            {body === "moon" && gridOverlay.legend && gridOverlay.polar_legend && (gridOverlay.polar_legend.min !== gridOverlay.legend.min || gridOverlay.polar_legend.max !== gridOverlay.legend.max) && (
              <div className="mt-2">
                <div className="mb-1 text-2xs text-regolith-400">Within 305 km of the poles (2.4 km cells)</div>
                <GradientLegend legend={gridOverlay.polar_legend} unit={gridOverlay.unit} fmt={gridOverlay.fmt} />
              </div>
            )}
            <p className="mt-1.5 text-2xs leading-snug text-regolith-400">
              {gridOverlay.source ? `Source: ${meta.sources_index[gridOverlay.source]?.name ?? gridOverlay.source}. ` : "Calculated by RADIUM. "}
              Clear cells have no data{body === "earth" ? " or are open water" : ""}.
              {gridOverlay.polar_only ? " Drawn only near the poles, where this product exists." : ""}
            </p>
          </LegendCard>
        )}
        {tileOverlay && (
          <LegendCard title={tileOverlay.title} sub={tileOverlay.provider}>
            <p className="text-2xs leading-snug text-regolith-300">{tileOverlay.legend_note ?? tileOverlay.description}</p>
            <p className="mt-1.5 text-2xs leading-snug text-regolith-400">A rendered map from NASA, shown as supplied. RADIUM does not read values from it.</p>
          </LegendCard>
        )}
      </div>

      {/* pointer read-out and credits */}
      <div className="pointer-events-none absolute right-3 bottom-9 z-20 flex max-w-[54%] flex-col items-end gap-1">
        <StatusStrip body={body} cursor={cursor} view={view} />
        <div className="text-right text-[10px] leading-tight text-regolith-400 [text-shadow:0_1px_2px_#000]">{attribution}</div>
      </div>
    </div>
  );
}

export function StatusStrip({ body, cursor, view }: { body: Body; cursor: { body: Body; lat: number; lon: number } | null; view: ViewState | null }) {
  const meta = useStore((s) => s.meta)!;
  const km = view ? ((view.degPerPx * Math.PI) / 180) * meta.bodies[body].radius_km * 100 : null;
  const here = cursor && cursor.body === body;
  if (!view && !here) return null;
  return (
    <div className="tnum cond hidden items-center gap-3 rounded-xs bg-black/65 px-2 py-1 text-2xs text-regolith-200 sm:flex" aria-hidden>
      <span>{here ? `Pointer ${formatCoord(cursor.lat, cursor.lon)}` : view ? `Centre ${formatCoord(view.lat, view.lon)}` : ""}</span>
      {km ? <span className="text-regolith-400">100 px ≈ {formatKm(km)}</span> : null}
    </div>
  );
}
