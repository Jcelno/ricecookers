import "maplibre-gl/dist/maplibre-gl.css";

import { type GeoJSONSource, type ImageSource, Map as MlMap, Marker, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { GRADE_HEX, wrapLon } from "@/lib/format";
import type { Basemap, Pin } from "@/lib/types";
import type { Focus } from "@/store";

import type { GlobeHandle, SiteMarker, ViewState } from "./GlobeView";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const MERC = 85.0511287798;
const CORNERS: [[number, number], [number, number], [number, number], [number, number]] = [[-180, MERC], [180, MERC], [180, -MERC], [-180, -MERC]];
// Borders and place names: OpenFreeMap vector tiles (OpenStreetMap data, OpenMapTiles schema).
// Keyless and CORS-enabled; styled here so lettering matches the rest of the interface.
const OFM = "https://tiles.openfreemap.org";
export const LABEL_ATTRIBUTION = "Borders and place names © OpenStreetMap contributors, OpenMapTiles, served by OpenFreeMap";
const LABEL_LAYERS = ["boundary", "label-water", "label-country", "label-state", "label-city"];
const NAME = ["coalesce", ["get", "name:en"], ["get", "name"]] as unknown as string;
const HALO = { "text-halo-color": "rgba(6,8,12,0.85)", "text-halo-width": 1.3 };

interface Props {
  basemap: Basemap | undefined;
  labels: boolean;
  overlayUrl?: string | null;
  opacity?: number;
  dimBase?: boolean;
  pins?: Pin[];
  markers?: SiteMarker[];
  selection?: { lat: number; lon: number; outline?: [number, number][] } | null;
  focus?: Focus | null;
  onPick?: (lat: number, lon: number) => void;
  onCursor?: (c: { lat: number; lon: number } | null) => void;
  onView?: (v: ViewState) => void;
  onStatus?: (s: { ready: boolean; error: string | null }) => void;
}

function styleFor(b: Basemap): StyleSpecification {
  return {
    version: 8,
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      base: { type: "raster", tiles: [b.url], tileSize: 256, maxzoom: b.max_zoom, attribution: b.attribution },
      ofm: { type: "vector", url: `${OFM}/planet`, attribution: LABEL_ATTRIBUTION },
      sel: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#05080c" } },
      { id: "base", type: "raster", source: "base", paint: { "raster-fade-duration": 150 } },
      {
        id: "boundary", type: "line", source: "ofm", "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": "#f6f2e9", "line-opacity": 0.42, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 6, 1.1] },
      },
      {
        id: "label-water", type: "symbol", source: "ofm", "source-layer": "water_name", filter: ["in", ["get", "class"], ["literal", ["ocean", "sea"]]],
        layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": ["interpolate", ["linear"], ["zoom"], 1, 11, 6, 14], "text-letter-spacing": 0.12, "text-max-width": 6 },
        paint: { "text-color": "#a9c9d8", ...HALO },
      },
      {
        id: "label-country", type: "symbol", source: "ofm", "source-layer": "place", filter: ["==", ["get", "class"], "country"],
        layout: { "text-field": NAME, "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 5, 14], "text-max-width": 6.5, "text-padding": 4 },
        paint: { "text-color": "#f6f2e9", ...HALO },
      },
      {
        id: "label-state", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 4.2, filter: ["==", ["get", "class"], "state"],
        layout: { "text-field": NAME, "text-font": ["Noto Sans Regular"], "text-size": 11, "text-letter-spacing": 0.06, "text-max-width": 7 },
        paint: { "text-color": "#d3cfc2", ...HALO },
      },
      {
        id: "label-city", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 4.5,
        filter: ["all", ["in", ["get", "class"], ["literal", ["city", "town"]]], ["<=", ["coalesce", ["get", "rank"], 20], ["interpolate", ["linear"], ["zoom"], 4.5, 3, 8, 10, 11, 20]]],
        layout: { "text-field": NAME, "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 4.5, 10.5, 10, 13], "text-max-width": 7, "text-padding": 3 },
        paint: { "text-color": "#e9e4d6", ...HALO },
      },
      { id: "sel-case", type: "line", source: "sel", paint: { "line-color": "#0b0c0e", "line-width": 5, "line-opacity": 0.8 } },
      { id: "sel-line", type: "line", source: "sel", paint: { "line-color": "#f6f2e9", "line-width": 2 } },
    ],
  };
}

function pinElement(p: Pin) {
  const el = document.createElement("button");
  el.type = "button";
  const graded = p.grade !== undefined;
  el.title = graded ? `${p.name}: documented analog site, ${p.grade ? `grade ${p.grade}` : "not graded"} for the selected site` : `${p.name}: documented analog site`;
  el.setAttribute("aria-label", `${p.name}, documented analog site`);
  // MapLibre places markers by writing `transform` on this element, so it must never be rotated itself:
  // the CSS `rotate` property composes with that transform and swings the pin away from its location.
  // The diamond is drawn by an inner element instead.
  el.style.cssText = "width:20px;height:20px;padding:0;border:0;background:none;cursor:pointer;display:grid;place-items:center";
  const d = document.createElement("span");
  d.style.cssText =
    `display:block;width:${graded ? 13 : 12}px;height:${graded ? 13 : 12}px;border-radius:2px;transform:rotate(45deg);` +
    (graded
      ? `background:${p.grade ? GRADE_HEX[p.grade] : "#94938a"};border:1.5px solid #101216;box-shadow:0 0 0 1.5px rgba(246,242,233,.85),0 1px 5px rgba(0,0,0,.7);`
      : "background:rgba(16,18,22,.55);border:1.5px solid #f6f2e9;box-shadow:0 1px 4px rgba(0,0,0,.6);") +
    "pointer-events:none";
  el.appendChild(d);
  return el;
}

function markerElement(m: SiteMarker) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = m.text;
  el.setAttribute("aria-label", `Match ${m.text}`);
  const s = m.active ? 30 : 24;
  el.style.cssText = `width:${s}px;height:${s}px;border-radius:50%;padding:0;font:600 12px "IBM Plex Sans",sans-serif;color:#101216;cursor:pointer;background:${m.grade ? GRADE_HEX[m.grade] : "#94938a"};border:${m.active ? "3px solid #f6f2e9" : "2px solid #101216"};box-shadow:0 2px 8px rgba(0,0,0,.65)`;
  return el;
}

export const EarthMap = forwardRef<GlobeHandle, Props>(function EarthMap(
  { basemap, labels, overlayUrl, opacity = 0.85, dimBase = false, pins = [], markers = [], selection, focus, onPick, onCursor, onView, onStatus },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(0);
  const pinMarkers = useRef<Marker[]>([]);
  const siteMarkers = useRef<Marker[]>([]);
  const cb = useRef({ onPick, onCursor, onView, onStatus });
  cb.current = { onPick, onCursor, onView, onStatus };
  const lastFocus = useRef(0);
  const baseId = basemap?.id;

  useEffect(() => {
    if (!host.current || !basemap) return;
    let map: MlMap;
    try {
      map = new MlMap({
        container: host.current,
        style: styleFor(basemap),
        center: [12, 22],
        zoom: 1.55,
        minZoom: 0.6,
        maxZoom: 12.5,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: true,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
    } catch (e) {
      console.error(e);
      cb.current.onStatus?.({ ready: false, error: "This browser could not start WebGL, which the map needs." });
      return;
    }
    map.touchZoomRotate.disableRotation();
    const report = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      cb.current.onView?.({ lat: c.lat, lon: wrapLon(c.lng), degPerPx: 360 / (512 * 2 ** z), heightKm: 0 });
    };
    map.on("move", report);
    map.on("click", (e) => cb.current.onPick?.(e.lngLat.lat, wrapLon(e.lngLat.lng)));
    map.on("mousemove", (e) => cb.current.onCursor?.({ lat: e.lngLat.lat, lon: wrapLon(e.lngLat.lng) }));
    map.on("mouseout", () => cb.current.onCursor?.(null));
    map.on("load", () => {
      mapRef.current = map;
      if (import.meta.env.DEV) (window as unknown as { __maplibre?: MlMap }).__maplibre = map; // for screenshot scripts
      setReady((n) => n + 1);
      cb.current.onStatus?.({ ready: true, error: null });
      report();
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      pinMarkers.current.forEach((m) => m.remove());
      siteMarkers.current.forEach((m) => m.remove());
      pinMarkers.current = [];
      siteMarkers.current = [];
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId]);

  useImperativeHandle(ref, () => ({
    zoom: (factor) => mapRef.current?.zoomTo(mapRef.current.getZoom() - Math.log2(factor), { duration: 350 }),
    home: () => mapRef.current?.flyTo({ center: [12, 22], zoom: 1.55, duration: 900 }),
  }), []);

  // labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const id of LABEL_LAYERS) map.setLayoutProperty(id, "visibility", labels ? "visible" : "none");
  }, [ready, labels]);

  // base dimming so data colours read clearly over imagery
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setPaintProperty("base", "raster-saturation", dimBase ? -0.85 : 0);
    map.setPaintProperty("base", "raster-brightness-max", dimBase ? 0.6 : 1);
  }, [ready, dimBase]);

  // RADIUM grid overlay (one Web-Mercator image pinned by its corners)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("ov") as ImageSource | undefined;
    if (!overlayUrl) {
      if (map.getLayer("ov")) map.removeLayer("ov");
      if (src) map.removeSource("ov");
      return;
    }
    if (src) src.updateImage({ url: overlayUrl, coordinates: CORNERS });
    else {
      map.addSource("ov", { type: "image", url: overlayUrl, coordinates: CORNERS });
      map.addLayer({ id: "ov", type: "raster", source: "ov", paint: { "raster-opacity": opacity, "raster-resampling": "nearest", "raster-fade-duration": 0 } }, "boundary");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, overlayUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("ov")) map.setPaintProperty("ov", "raster-opacity", opacity);
  }, [ready, opacity, overlayUrl]);

  // documented analog sites
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pinMarkers.current.forEach((m) => m.remove());
    pinMarkers.current = pins.map((p) => {
      const el = pinElement(p);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        cb.current.onPick?.(p.lat, p.lon);
      });
      return new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
    });
  }, [ready, pins]);

  // ranked matches
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    siteMarkers.current.forEach((m) => m.remove());
    siteMarkers.current = markers.map((s) => {
      const el = markerElement(s);
      el.style.zIndex = s.active ? "3" : "2";
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        cb.current.onPick?.(s.lat, s.lon);
      });
      return new Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map);
    });
  }, [ready, markers]);

  // selected cell outline
  const selKey = selection ? `${selection.lat},${selection.lon},${selection.outline?.[0]?.join(",") ?? ""}` : "";
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("sel") as GeoJSONSource | undefined;
    if (!src) return;
    const ring = selection?.outline;
    src.setData({
      type: "FeatureCollection",
      features: ring && ring.length > 2 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } }] : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selKey]);

  // fly to
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus || focus.body !== "earth" || focus.nonce === lastFocus.current) return;
    lastFocus.current = focus.nonce;
    const span = focus.spanKm ?? 2500;
    const zoom = Math.max(1.2, Math.min(11, Math.log2((40075 * Math.cos((focus.lat * Math.PI) / 180)) / span) + 1.2));
    map.flyTo({ center: [focus.lon, Math.max(-84, Math.min(84, focus.lat))], zoom, duration: 1300, essential: true });
  }, [ready, focus]);

  // MapLibre's stylesheet sets `position: relative` on its container, so the
  // sized box has to be a wrapper rather than the container itself.
  return (
    <div className="absolute inset-0">
      <div ref={host} className="size-full" />
    </div>
  );
});
