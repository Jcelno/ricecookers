import "cesium/Build/Cesium/Widgets/widgets.css";
import "./globe-pins.css";

import {
  Cartesian2, Cartesian3, Cartographic, Color, ConstantProperty, CustomDataSource, DistanceDisplayCondition, Ellipsoid, EllipsoidTerrainProvider, type Entity,
  GeographicProjection, GeographicTilingScheme, Globe, HorizontalOrigin, ImageryLayer, LabelStyle, Math as CMath, NearFarScalar, PolylineDashMaterialProperty,
  Rectangle, SceneTransforms, ScreenSpaceEventHandler, ScreenSpaceEventType, SingleTileImageryProvider, SkyBox, SplitDirection, TextureMagnificationFilter,
  TextureMinificationFilter, UrlTemplateImageryProvider, VerticalOrigin, Viewer,
} from "cesium";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { GRADE_HEX, wrapLon } from "@/lib/format";
import { clusterPoints, motionDuration, placeFanMarkers, sphericalCenter } from "@/lib/markers";
import type { Grade, Pin, Planet, TileLayer } from "@/lib/types";
import { useStore, type Focus } from "@/store";
import { emitTour, onTour } from "@/lib/tour/events";

/** Hide pins that have rotated to the far side or to within a grazing angle of the rim, so a pin or its
 *  label is never drawn half-clipped by the horizon (which reads as a pin floating off the globe). */
const scratchN = new Cartesian3();
const scratchV = new Cartesian3();
function cullToHorizon(v: Viewer, ents: Entity[]) {
  if (v.isDestroyed()) return;
  const cam = v.camera.positionWC;
  const now = v.clock.currentTime;
  let changed = false;
  for (const e of ents) {
    const pos = e.position?.getValue(now);
    if (!pos) continue;
    Cartesian3.normalize(pos, scratchN);
    Cartesian3.normalize(Cartesian3.subtract(cam, pos, scratchV), scratchV);
    const show = Cartesian3.dot(scratchN, scratchV) > 0.12; // about 7° above the local horizon
    if (e.show !== show) { e.show = show; changed = true; }
  }
  if (changed) v.scene.requestRender();
}

// Planetocentric coordinates on a sphere, matching the LOLA and MOLA products
// (Cesium's built-in Mars ellipsoid is flattened, which would shift latitudes).
const ELLIPSOID: Record<Planet, Ellipsoid> = {
  moon: new Ellipsoid(1_737_400, 1_737_400, 1_737_400),
  mars: new Ellipsoid(3_396_000, 3_396_000, 3_396_000),
};
const HOME: Record<Planet, { lon: number; lat: number }> = { moon: { lon: 8, lat: 6 }, mars: { lon: -62, lat: 4 } };

export interface ImageOverlay { key: string; url: string; rect: [number, number, number, number] }
export interface SiteMarker { id: string; lat: number; lon: number; text: string; grade: Grade | null; active?: boolean; name?: string; rank?: number; newLead?: boolean; score?: number | null;
  /** Earth map only: draw as a numbered pin (the rank) with its grade letter, and drop it in when first shown. */
  numbered?: boolean }
export interface ViewState { lat: number; lon: number; degPerPx: number; heightKm: number }
export interface GlobeHandle { zoom: (factor: number) => void; home: () => void;
  /** Earth map only: where a place is drawn, in CSS pixels inside the map, or null when it is off screen. */
  project?: (lat: number, lon: number) => { x: number; y: number } | null }
const NO_PINS: Pin[] = [];
const NO_MARKERS: SiteMarker[] = [];

interface Props {
  body: Planet;
  base: TileLayer | undefined;
  tileOverlay?: TileLayer | null;
  images?: ImageOverlay[];
  opacity?: number;
  dimBase?: boolean;
  pins?: Pin[];
  markers?: SiteMarker[];
  selection?: { lat: number; lon: number; outline?: [number, number][] } | null;
  focus?: Focus | null;
  interactive?: boolean;
  onPick?: (lat: number, lon: number, source?: "marker" | "click") => void;
  onCursor?: (c: { lat: number; lon: number } | null) => void;
  onView?: (v: ViewState) => void;
  onStatus?: (s: { ready: boolean; error: string | null }) => void;
  /** Swipe comparison: data overlays draw only right of this fraction of the width (null = everywhere). */
  split?: number | null;
  /** Dataset coverage outlines as lon/lat rings, drawn dashed. */
  coverage?: [number, number][][];
}

function markerImage(text: string, grade: Grade | null, active: boolean, cluster = false) {
  const s = 72;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.shadowColor = "#0009"; g.shadowBlur = 5; g.shadowOffsetY = 2;
  g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 7, 0, Math.PI * 2);
  g.fillStyle = grade ? GRADE_HEX[grade] : cluster ? "#14283d" : "#415166";
  g.fill();
  g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.lineWidth = active ? 5 : 3;
  g.strokeStyle = "#e4edf5"; g.stroke();
  if (cluster) { g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 13, 0, Math.PI * 2); g.lineWidth = 1.5; g.stroke(); }
  g.fillStyle = grade ? "#101216" : "#f0f5fa";
  g.font = '700 28px "IBM Plex Sans", sans-serif';
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, s / 2, s / 2 + 1);
  return c;
}

export const GlobeView = forwardRef<GlobeHandle, Props>(function GlobeView(
  { body, base, tileOverlay, images = [], opacity = 0.85, dimBase = false, pins = NO_PINS, markers = NO_MARKERS, selection, focus, interactive = true, onPick, onCursor, onView, onStatus, split = null, coverage },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const markerHost = useRef<HTMLDivElement>(null);
  const tourStep = useRef<string | null>(null);
  const resetGesture = useRef<(() => void) | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const baseRef = useRef<ImageryLayer | null>(null);
  const tileRef = useRef<ImageryLayer | null>(null);
  const imgRef = useRef(new Map<string, ImageryLayer>());
  const pinEntities = useRef<Entity[]>([]);
  const siteSource = useRef<CustomDataSource | null>(null);
  const markerEntities = useRef<Entity[]>([]);
  const selEntities = useRef<Entity[]>([]);
  const lookup = useRef(new Map<string, { lat: number; lon: number }>());
  const cb = useRef({ onPick, onCursor, onView, onStatus });
  cb.current = { onPick, onCursor, onView, onStatus };
  const lastFocus = useRef(0);
  const requestedSelection = useStore(s => s.selection);
  const [hoverTitle, setHoverTitle] = useState<string | null>(null);
  const [imageryError, setImageryError] = useState<string | null>(null);

  // ------------------------------------------------------------------ viewer
  useEffect(() => {
    if (!host.current) return;
    const ellipsoid = ELLIPSOID[body];
    let v: Viewer;
    try {
      Ellipsoid.default = ellipsoid;
      v = new Viewer(host.current, {
        ellipsoid,
        globe: new Globe(ellipsoid),
        mapProjection: new GeographicProjection(ellipsoid),
        terrainProvider: new EllipsoidTerrainProvider({ ellipsoid }),
        baseLayer: false,
        skyBox: SkyBox.createEarthSkyBox(),
        skyAtmosphere: false,
        animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, infoBox: false,
        sceneModePicker: false, selectionIndicator: false, navigationHelpButton: false, fullscreenButton: false,
        scene3DOnly: true,
        requestRenderMode: true,
        maximumRenderTimeChange: Number.POSITIVE_INFINITY,
        creditContainer: document.createElement("div"),
        useBrowserRecommendedResolution: false,
        contextOptions: { webgl: { alpha: false, preserveDrawingBuffer: true } },
      });
    } catch (e) {
      cb.current.onStatus?.({ ready: false, error: "This browser could not start WebGL, which the 3D globe needs." });
      console.error(e);
      return;
    }
    const scene = v.scene;
    v.resolutionScale = Math.min(window.devicePixelRatio || 1, 2) / (window.devicePixelRatio || 1);
    scene.backgroundColor = Color.BLACK;
    scene.globe.baseColor = Color.fromCssColorString("#0c0d10");
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = false;
    // 2 px of allowed error: visually indistinguishable at these mosaic resolutions, and noticeably fewer tile
    // requests per view (measured in scripts/dev-perf.mjs). A larger cache avoids refetching when panning back.
    scene.globe.maximumScreenSpaceError = 2;
    scene.globe.tileCacheSize = 300;
    scene.fog.enabled = false;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    const ctl = scene.screenSpaceCameraController;
    ctl.minimumZoomDistance = body === "moon" ? 3_000 : 6_000;
    ctl.maximumZoomDistance = ellipsoid.maximumRadius * 8;
    ctl.inertiaSpin = 0.86;
    ctl.inertiaZoom = 0.7;
    // Top-down only: the graticule tapes, scale and cell outlines all assume the camera looks straight down.
    ctl.enableTilt = false;
    ctl.enableLook = false;
    v.camera.setView({ destination: Cartesian3.fromDegrees(HOME[body].lon, HOME[body].lat, ellipsoid.maximumRadius * (interactive ? 1.75 : 1.75), ellipsoid) });
    v.camera.percentageChanged = 0.002;

    const pickLatLon = (pos: Cartesian2) => {
      if (v.isDestroyed()) return null;
      const c = v.camera.pickEllipsoid(pos, ellipsoid);
      if (!c) return null;
      const g = Cartographic.fromCartesian(c, ellipsoid);
      return { lat: CMath.toDegrees(g.latitude), lon: wrapLon(CMath.toDegrees(g.longitude)) };
    };

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((e: { position: Cartesian2 }) => {
      const hit = scene.pick(e.position);
      if (hit && Array.isArray(hit.id)) {
        const places = (hit.id as Entity[]).map(e => lookup.current.get(e.id)).filter((p): p is { lat: number; lon: number } => !!p);
        if (places.length) {
          const center = sphericalCenter(places);
          const height = Math.max(ctl.minimumZoomDistance, v.camera.positionCartographic.height * 0.4);
          resetGesture.current?.();
          v.camera.flyTo({ destination: Cartesian3.fromDegrees(center.lon, center.lat, height, ellipsoid), duration: motionDuration(650) / 1000, complete: () => { if (!v.isDestroyed()) emitTour("map:zoomed", { body, altitudeKm: v.camera.positionCartographic.height / 1000 }); } });
          return;
        }
      }
      const id = hit && (hit.id as Entity | undefined)?.id;
      const known = typeof id === "string" ? lookup.current.get(id) : undefined;
      if (known) return cb.current.onPick?.(known.lat, known.lon, "marker");
      const p = pickLatLon(e.position);
      if (p) cb.current.onPick?.(p.lat, p.lon, "click");
    }, ScreenSpaceEventType.LEFT_CLICK);
    let raf = 0;
    handler.setInputAction((e: { endPosition: Cartesian2 }) => {
      const pos = Cartesian2.clone(e.endPosition);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        cb.current.onCursor?.(pickLatLon(pos));
        const hit = scene.pick(pos);
        const title = hit && Array.isArray(hit.id) ? `${hit.id.length} locations • select to zoom into cluster` : hit?.id?.name ?? null;
        setHoverTitle(title);
        scene.canvas.style.cursor = hit?.id ? "pointer" : "grab";
      });
    }, ScreenSpaceEventType.MOUSE_MOVE);
    const leave = () => { cb.current.onCursor?.(null); setHoverTitle(null); };
    scene.canvas.addEventListener("mouseleave", leave);

    // Completion follows changed camera coordinates after a physical gesture, never a scripted flight.
    let gestureUntil = 0;
    let pointerStart: { x: number; y: number } | null = null;
    let dragged = false;
    let zoomGesture = false;
    let lastCamera = Cartographic.clone(v.camera.positionCartographic);
    const pointers = new Set<number>();
    const down = (event: PointerEvent) => {
      pointers.add(event.pointerId);
      pointerStart = { x: event.clientX, y: event.clientY };
      dragged = false;
      zoomGesture = pointers.size > 1;
      lastCamera = Cartographic.clone(v.camera.positionCartographic);
      gestureUntil = performance.now() + 1600;
    };
    const move = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId) || !pointerStart) return;
      if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) dragged = true;
      if (pointers.size > 1) zoomGesture = true;
      gestureUntil = performance.now() + 1600;
    };
    const up = (event: PointerEvent) => { pointers.delete(event.pointerId); gestureUntil = performance.now() + 800; };
    const wheel = () => { dragged = false; zoomGesture = true; gestureUntil = performance.now() + 1600; };
    resetGesture.current = () => { gestureUntil = 0; dragged = false; zoomGesture = false; };
    scene.canvas.addEventListener("pointerdown", down);
    scene.canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    scene.canvas.addEventListener("wheel", wheel, { passive: true });
    const report = () => {
      if (v.isDestroyed()) return; // a queued camera event can arrive after the viewer is torn down
      const w = scene.canvas.clientWidth;
      const h = scene.canvas.clientHeight;
      const centre = pickLatLon(new Cartesian2(w / 2, h / 2));
      const currentCamera = v.camera.positionCartographic;
      const height = currentCamera.height;
      if (performance.now() < gestureUntil) {
        const deltaAngle = Math.abs(currentCamera.latitude - lastCamera.latitude) + Math.abs(currentCamera.longitude - lastCamera.longitude);
        if (dragged && deltaAngle > 0.00001) emitTour("map:moved", { body, altitudeKm: height / 1000 });
        if (zoomGesture && Math.abs(height - lastCamera.height) > 1) emitTour("map:zoomed", { body, altitudeKm: height / 1000 });
      }
      lastCamera = Cartographic.clone(currentCamera);
      if (!centre) return;
      const side = pickLatLon(new Cartesian2(w / 2 + 40, h / 2));
      let degPerPx = (2 * Math.atan((height / ellipsoid.maximumRadius) * Math.tan(v.camera.frustum instanceof Object && "fovy" in v.camera.frustum ? (v.camera.frustum as any).fovy / 2 : 0.5)) * 180) / Math.PI / h;
      if (side) {
        const a = Cartographic.fromDegrees(centre.lon, centre.lat);
        const b = Cartographic.fromDegrees(side.lon, side.lat);
        const ang = Math.acos(Math.min(1, Math.sin(a.latitude) * Math.sin(b.latitude) + Math.cos(a.latitude) * Math.cos(b.latitude) * Math.cos(a.longitude - b.longitude)));
        if (ang > 0) degPerPx = CMath.toDegrees(ang) / 40;
      }
      cb.current.onView?.({ lat: centre.lat, lon: centre.lon, degPerPx, heightKm: height / 1000 });
    };
    const cull = () => cullToHorizon(v, [...pinEntities.current, ...markerEntities.current]);
    const offCull = v.camera.changed.addEventListener(cull);
    const offMoveEnd = v.camera.moveEnd.addEventListener(cull);
    const offChanged = v.camera.changed.addEventListener(report);
    const offTile = scene.globe.tileLoadProgressEvent.addEventListener((n: number) => n === 0 && scene.requestRender());

    const ro = new ResizeObserver(() => {
      v.resize();
      scene.requestRender();
      report();
    });
    ro.observe(host.current);
    const fontsReady = document.fonts?.ready.then(() => !v.isDestroyed() && scene.requestRender());
    void fontsReady;

    viewerRef.current = v;
    setViewer(v);
    if (import.meta.env.DEV && interactive) (window as unknown as { __cesium?: Viewer }).__cesium = v; // for screenshot scripts
    cb.current.onStatus?.({ ready: true, error: null });
    let firstFrame = true;
    const offFrame = scene.postRender.addEventListener(() => {
      if (!firstFrame) return;
      firstFrame = false;
      emitTour("ready:frame", { body });
    });
    scene.requestRender();
    const reportTimer = window.setTimeout(report, 60);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(reportTimer);
      offFrame();
      scene.canvas.removeEventListener("pointerdown", down);
      scene.canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      scene.canvas.removeEventListener("wheel", wheel);
      ro.disconnect();
      offChanged();
      offCull();
      offMoveEnd();
      offTile();
      scene.canvas.removeEventListener("mouseleave", leave);
      handler.destroy();
      baseRef.current = tileRef.current = null;
      imgRef.current.clear();
      pinEntities.current = [];
      markerEntities.current = [];
      selEntities.current = [];
      lookup.current.clear();
      viewerRef.current = null;
      resetGesture.current = null;
      setViewer(null);
      if (!v.isDestroyed()) v.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  useEffect(() => {
    if (!viewer || !interactive) return;
    let frame = 0;
    let last = 0;
    let welcome = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
    const rotate = (now: number) => {
      if (!welcome || reduced.matches || viewer.isDestroyed()) { stop(); return; }
      if (last) viewer.camera.rotateRight(Math.min((now - last) / 1000, 0.05) * 0.012);
      last = now;
      viewer.scene.requestRender();
      frame = requestAnimationFrame(rotate);
    };
    const update = () => { if (welcome && !reduced.matches && !frame) frame = requestAnimationFrame(rotate); else if (!welcome || reduced.matches) stop(); };
    const off = onTour(event => {
      if (event.type !== "tutorial:changed") return;
      if (event.payload.running !== undefined) tourStep.current = event.payload.running ? event.payload.stepId ?? null : null;
      else if (event.payload.stepId && tourStep.current) tourStep.current = event.payload.stepId;
      if (event.payload.welcome !== undefined) welcome = event.payload.welcome;
      update();
    });
    reduced.addEventListener("change", update);
    return () => { stop(); off(); reduced.removeEventListener("change", update); };
  }, [viewer, interactive]);

  useImperativeHandle(ref, () => ({
    zoom: (factor) => {
      const v = viewerRef.current;
      if (!v) return;
      resetGesture.current?.();
      const h = v.camera.positionCartographic.height;
      const target = Math.max(v.scene.screenSpaceCameraController.minimumZoomDistance, Math.min(v.scene.screenSpaceCameraController.maximumZoomDistance, h * factor));
      const c = v.camera.positionCartographic;
      v.camera.flyTo({ destination: Cartesian3.fromRadians(c.longitude, c.latitude, target, ELLIPSOID[body]), duration: motionDuration(450) / 1000, complete: () => { if (!v.isDestroyed() && Math.abs(v.camera.positionCartographic.height - h) > 1) emitTour("map:zoomed", { body, altitudeKm: v.camera.positionCartographic.height / 1000 }); } });
    },
    home: () => {
      const v = viewerRef.current;
      if (!v) return;
      resetGesture.current?.();
      v.camera.flyTo({ destination: Cartesian3.fromDegrees(HOME[body].lon, HOME[body].lat, ELLIPSOID[body].maximumRadius * 1.75, ELLIPSOID[body]), duration: motionDuration(1100) / 1000 });
    },
  }), [body]);

  const tiles = (l: TileLayer) => {
    const [w, s, e, n] = l.bbox;
    return new UrlTemplateImageryProvider({
      url: l.url,
      tilingScheme: new GeographicTilingScheme({ ellipsoid: ELLIPSOID[body] }),
      maximumLevel: l.max_level,
      rectangle: Rectangle.fromDegrees(Math.max(-180, w), Math.max(-90, s), Math.min(180, e), Math.min(90, n)),
      credit: l.attribution,
    });
  };

  // --------------------------------------------------------------- base layer
  useEffect(() => {
    if (!viewer || !base) return;
    setImageryError(null);
    const provider = tiles(base);
    const offError = provider.errorEvent.addEventListener(() => setImageryError(`Imagery unavailable: ${base.provider || "Solar System Treks"}`));
    const layer = new ImageryLayer(provider);
    viewer.imageryLayers.add(layer, 0);
    if (baseRef.current) viewer.imageryLayers.remove(baseRef.current, true);
    baseRef.current = layer;
    layer.saturation = dimBase ? 0.1 : 1;
    layer.brightness = dimBase ? 0.62 : 1;
    viewer.scene.requestRender();
    return offError;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, base?.id]);

  useEffect(() => {
    if (!viewer || !baseRef.current) return;
    baseRef.current.saturation = dimBase ? 0.1 : 1;
    baseRef.current.brightness = dimBase ? 0.62 : 1;
    viewer.scene.requestRender();
  }, [viewer, dimBase]);

  // ------------------------------------------------ NASA Trek rendered overlay
  useEffect(() => {
    if (!viewer) return;
    if (tileRef.current) {
      viewer.imageryLayers.remove(tileRef.current, true);
      tileRef.current = null;
    }
    let offError: (() => void) | undefined;
    if (tileOverlay) {
      const provider = tiles(tileOverlay);
      offError = provider.errorEvent.addEventListener(() => setImageryError(`Overlay unavailable: ${tileOverlay.provider || "Solar System Treks"}`));
      const layer = new ImageryLayer(provider, { alpha: opacity });
      layer.splitDirection = splitRef.current === null ? SplitDirection.NONE : SplitDirection.RIGHT;
      viewer.imageryLayers.add(layer, 1);
      tileRef.current = layer;
    }
    viewer.scene.requestRender();
    return () => offError?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, tileOverlay?.id]);

  // ------------------------------------------------- RADIUM grid image overlays
  const imageKey = images.map((i) => i.key).join("|");
  const wantRef = useRef(new Set<string>());
  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    const want = new Map(images.map((i) => [i.key, i]));
    wantRef.current = new Set(want.keys());
    // Old images stay on screen until their replacements have loaded, so changing weights or layers never flashes
    // an empty globe. Anything no longer wanted is removed once something new is drawn (or at once if nothing is).
    const prune = () => {
      for (const [key, layer] of imgRef.current) {
        if (!wantRef.current.has(key)) {
          viewer.imageryLayers.remove(layer, true);
          imgRef.current.delete(key);
        }
      }
    };
    const pending = images.filter((img) => !imgRef.current.has(img.key));
    if (pending.length === 0 || images.length === 0) prune();
    let left = pending.length;
    for (const img of pending) {
      SingleTileImageryProvider.fromUrl(img.url, { rectangle: Rectangle.fromDegrees(...img.rect) })
        .then((provider) => {
          if (cancelled || viewer.isDestroyed() || imgRef.current.has(img.key)) return;
          const layer = new ImageryLayer(provider, {
            alpha: opacity,
            magnificationFilter: TextureMagnificationFilter.NEAREST,
            minificationFilter: TextureMinificationFilter.LINEAR,
          });
          layer.splitDirection = splitRef.current === null ? SplitDirection.NONE : SplitDirection.RIGHT;
          viewer.imageryLayers.add(layer);
          imgRef.current.set(img.key, layer);
        })
        .catch((e) => console.warn("overlay failed to load", img.url, e))
        .finally(() => {
          left -= 1;
          if (!cancelled && !viewer.isDestroyed() && left === 0) prune();
          if (!viewer.isDestroyed()) viewer.scene.requestRender();
        });
    }
    viewer.scene.requestRender();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, imageKey]);

  // ------------------------------------------------------ swipe comparison
  const splitRef = useRef<number | null>(split);
  splitRef.current = split;
  useEffect(() => {
    if (!viewer) return;
    const dir = split === null ? SplitDirection.NONE : SplitDirection.RIGHT;
    if (tileRef.current) tileRef.current.splitDirection = dir;
    for (const l of imgRef.current.values()) l.splitDirection = dir;
    if (split !== null) viewer.scene.splitPosition = split;
    viewer.scene.requestRender();
  }, [viewer, split]);

  // ------------------------------------------------------ coverage outlines
  const covRef = useRef<Entity[]>([]);
  const covKey = coverage ? coverage.length : 0;
  useEffect(() => {
    if (!viewer) return;
    for (const e of covRef.current) viewer.entities.remove(e);
    covRef.current = (coverage ?? []).map((ring) =>
      viewer.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights(ring.flatMap(([lo, la]) => [lo, la, ELLIPSOID[body].maximumRadius * 0.0003]), ELLIPSOID[body]),
          width: 1.6,
          material: new PolylineDashMaterialProperty({ color: Color.fromCssColorString("#eef4f8").withAlpha(0.85), dashLength: 10 }),
        },
      }),
    );
    viewer.scene.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, covKey, body]);

  useEffect(() => {
    if (!viewer) return;
    if (tileRef.current) tileRef.current.alpha = opacity;
    for (const l of imgRef.current.values()) l.alpha = opacity;
    viewer.scene.requestRender();
  }, [viewer, opacity]);

  // Curated sites and model outputs share screen-space clustering. Cesium recomputes
  // clusters when the camera moves, including rotation and zoom; horizon culling
  // prevents far-side sites from appearing in the visible hemisphere.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const E = ELLIPSOID[body], R = E.maximumRadius;
    const source = new CustomDataSource(`${body}-research-sites`);
    siteSource.current = source;
    const activeEntities: Entity[] = [];
    source.clustering.enabled = true;
    source.clustering.pixelRange = 20;
    source.clustering.minimumClusterSize = 2;
    source.clustering.clusterLabels = true;
    source.clustering.clusterBillboards = true;
    const offCluster = source.clustering.clusterEvent.addEventListener((entities, cluster) => {
      cluster.label.show = false;
      cluster.point.show = false;
      cluster.billboard.show = true;
      cluster.billboard.image = markerImage(String(entities.length), null, false, true).toDataURL();
      cluster.billboard.width = 38;
      cluster.billboard.height = 38;
      cluster.billboard.verticalOrigin = VerticalOrigin.CENTER;
      cluster.billboard.id = entities;
    });
    const make = (lat: number, lon: number, text: string, grade: Grade | null, name: string, active: boolean, label?: string) => {
      const e = (active ? viewer.entities : source.entities).add({
        name,
        position: Cartesian3.fromDegrees(lon, lat, R * 0.0006, E),
        billboard: { image: markerImage(text, grade, active), width: 32, height: 32, verticalOrigin: VerticalOrigin.CENTER },
        ...(label ? { label: {
          text: label, font: '500 12px "IBM Plex Sans", sans-serif',
          fillColor: Color.fromCssColorString("#f0f5fa"), outlineColor: Color.fromCssColorString("#09121e"),
          outlineWidth: 4, style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: HorizontalOrigin.LEFT, verticalOrigin: VerticalOrigin.CENTER,
          pixelOffset: new Cartesian2(18, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, R * 0.8),
        } } : {}),
      });
      if (active) activeEntities.push(e);
      lookup.current.set(e.id, { lat, lon });
      return e;
    };
    pinEntities.current = pins.filter(p => !markers.some(m => Math.abs(m.lat - p.lat) < 0.0001 && Math.abs(wrapLon(m.lon - p.lon)) < 0.0001)).map(p => {
      const status = p.verification_status === "review_needed" ? "evidence review needed" : p.kind === "landing" ? "historical landing site" : "geological research site";
      const active = !!selection && Math.abs(selection.lat - p.lat) < 0.05 && Math.abs(wrapLon(selection.lon - p.lon)) < 0.05;
      return make(p.lat, p.lon, "•", null, `${p.name}: ${status}; not yet scored`, active, p.name);
    });
    markerEntities.current = markers.map(m => make(m.lat, m.lon, m.grade ?? "•", m.grade, `${m.grade ? `Mission suitability grade ${m.grade}` : "Insufficient data; not graded"} · result ${m.id}`, !!m.active));
    cullToHorizon(viewer, [...pinEntities.current, ...markerEntities.current]);
    let disposed = false;
    void viewer.dataSources.add(source).then(() => {
      if (!viewer.isDestroyed()) {
        if (disposed) viewer.dataSources.remove(source, true);
        else viewer.scene.requestRender();
      }
    });
    return () => {
      offCluster();
      disposed = true;
      for (const e of source.entities.values) lookup.current.delete(e.id);
      for (const e of activeEntities) {
        lookup.current.delete(e.id);
        if (!viewer.isDestroyed()) viewer.entities.remove(e);
      }
      if (!viewer.isDestroyed()) viewer.dataSources.remove(source, true);
      pinEntities.current = []; markerEntities.current = [];
      if (siteSource.current === source) siteSource.current = null;
    };
  }, [viewer, pins, markers, body, selection?.lat, selection?.lon]);

  // Nearby pins fan their chips around exact projected ground dots. At overview zoom,
  // Cesium's native clusters remain the fallback so dense hemispheres stay navigable.
  useEffect(() => {
    if (!viewer || !markerHost.current) return;
    const holder = markerHost.current;
    const E = ELLIPSOID[body];
    const requested = requestedSelection;
    const selectedPoint = requested?.body === body ? requested : selection;
    const sites = [
      ...markers.map((marker, index) => ({ ...marker, name: marker.name ?? `Candidate ${index + 1}`, priority: marker.rank ?? index + 1, active: !!marker.active })),
      ...pins.filter(pin => !markers.some(marker => Math.abs(marker.lat - pin.lat) < .0001 && Math.abs(wrapLon(marker.lon - pin.lon)) < .0001)).map(pin => ({ ...pin, grade: null, text: "·", priority: 1000, active: !!selectedPoint && Math.abs(selectedPoint.lat - pin.lat) < .0001 && Math.abs(wrapLon(selectedPoint.lon - pin.lon)) < .0001 })),
    ];
    const entries = sites.map(site => {
      const wrapper = document.createElement("div"); wrapper.className = "globe-fan-marker";
      wrapper.dataset.active = String(site.active);
      const chip = document.createElement("button"); chip.type = "button"; chip.className = "globe-fan-chip";
      chip.dataset.tourMarker = site.id; chip.textContent = site.grade ?? "·";
      const label = `${site.name}: ${site.grade ? `mission suitability grade ${site.grade}` : "not scored"}; select location`;
      chip.setAttribute("aria-label", label); chip.title = label;
      if (site.grade) { chip.style.background = GRADE_HEX[site.grade]; chip.style.color = "var(--color-basalt-950)"; }
      const dot = document.createElement("button"); dot.type = "button"; dot.className = "globe-fan-dot";
      dot.dataset.tourGround = site.id; dot.setAttribute("aria-label", label); dot.title = label;
      const leader = document.createElementNS("http://www.w3.org/2000/svg", "svg"); leader.classList.add("globe-fan-leader"); leader.setAttribute("aria-hidden", "true");
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line"); line.setAttribute("x1", "0"); line.setAttribute("y1", "0"); leader.append(line);
      const nameplate = document.createElement("span"); nameplate.className = "globe-fan-name"; nameplate.textContent = site.name; nameplate.hidden = true;
      const pick = (event: MouseEvent) => { event.stopPropagation(); cb.current.onPick?.(site.lat, site.lon, "marker"); };
      chip.addEventListener("click", pick); dot.addEventListener("click", pick);
      wrapper.append(leader, dot, chip, nameplate); holder.append(wrapper);
      return { ...site, wrapper, chip, dot, line, nameplate, position: Cartesian3.fromDegrees(site.lon, site.lat, E.maximumRadius * .0006, E) };
    });
    const pulse = document.createElement("div"); pulse.className = "globe-click-pulse"; pulse.hidden = true; holder.append(pulse);
    let frame = 0, timer = 0, last = 0, previousFan: boolean | null = null;
    const update = () => {
      frame = 0; last = performance.now();
      if (viewer.isDestroyed()) return;
      const cam = viewer.camera.positionWC;
      const heightRatio = viewer.camera.positionCartographic.height / E.maximumRadius;
      const fan = heightRatio < .8;
      if (fan !== previousFan) {
        previousFan = fan;
        if (siteSource.current) siteSource.current.clustering.enabled = !fan;
        for (const entity of [...pinEntities.current, ...markerEntities.current]) {
          if (entity.billboard) entity.billboard.show = new ConstantProperty(!fan);
          if (entity.label) entity.label.show = new ConstantProperty(!fan);
        }
        viewer.scene.requestRender();
      }
      const scale = Math.max(.7, Math.min(1.08, 1.08 - heightRatio * .35));
      const visible = entries.flatMap(entry => {
        Cartesian3.normalize(entry.position, scratchN);
        Cartesian3.normalize(Cartesian3.subtract(cam, entry.position, scratchV), scratchV);
        const facing = Cartesian3.dot(scratchN, scratchV);
        const point = facing > 0 ? SceneTransforms.worldToWindowCoordinates(viewer.scene, entry.position) : undefined;
        entry.wrapper.hidden = true;
        entry.nameplate.hidden = true;
        if (!point || point.x < 0 || point.y < 0 || point.x > holder.clientWidth || point.y > holder.clientHeight) return [];
        entry.wrapper.style.opacity = String(Math.min(1, facing / .16));
        return [{ ...entry, x: point.x, y: point.y }];
      });
      const display = fan ? visible : clusterPoints(visible, 40).flatMap(group => group.length === 1 ? group : tourStep.current === "select-site" ? group.filter(entry => entry.name === "Gale") : []);
      const slots = placeFanMarkers(display, holder.clientWidth, holder.clientHeight, scale);
      for (const entry of display) {
        const slot = slots.find(value => value.id === entry.id)!;
        entry.wrapper.hidden = false;
        entry.wrapper.dataset.mode = fan ? "fan" : "cluster";
        entry.wrapper.dataset.folded = String(fan && slot.folded);
        entry.wrapper.style.transform = `translate(${entry.x}px,${entry.y}px)`;
        entry.wrapper.style.zIndex = entry.active ? "4" : "2";
        const dx = fan ? slot.dx : 0, dy = fan ? slot.dy : 0;
        entry.chip.style.left = `${dx}px`; entry.chip.style.top = `${dy}px`;
        entry.chip.style.width = `${slot.width}px`; entry.chip.style.height = `${slot.height}px`; entry.chip.style.fontSize = `${Math.max(10, 12 * scale)}px`;
        entry.chip.tabIndex = fan && !slot.folded ? 0 : -1;
        entry.dot.tabIndex = fan && slot.folded ? 0 : -1;
        entry.line.setAttribute("x2", String(dx)); entry.line.setAttribute("y2", String(dy + slot.height / 2));
        if (entry.active) {
          const labelWidth = Math.min(200, entry.name.length * 7.5 + 16), labelHeight = 26;
          const choices = [
            { left: dx + slot.width / 2 + 7, top: dy - labelHeight / 2 },
            { left: dx - slot.width / 2 - labelWidth - 7, top: dy - labelHeight / 2 },
            { left: -labelWidth / 2, top: 14 },
            { left: dx - labelWidth / 2, top: dy - slot.height / 2 - labelHeight - 7 },
          ];
          const position = choices.find(candidate => entry.x + candidate.left >= 8 && entry.x + candidate.left + labelWidth <= holder.clientWidth - 8 && entry.y + candidate.top >= 8 && entry.y + candidate.top + labelHeight <= holder.clientHeight - 8 && !slots.some(other => other.id !== entry.id && !other.folded && entry.x + candidate.left < other.x + other.dx + other.width / 2 && entry.x + candidate.left + labelWidth > other.x + other.dx - other.width / 2 && entry.y + candidate.top < other.y + other.dy + other.height / 2 && entry.y + candidate.top + labelHeight > other.y + other.dy - other.height / 2));
          if (position) { entry.nameplate.hidden = false; entry.nameplate.style.left = `${position.left}px`; entry.nameplate.style.top = `${position.top}px`; entry.nameplate.style.width = `${labelWidth}px`; }
        }
      }
      pulse.hidden = true;
      if (selectedPoint && !sites.some(site => site.active)) {
        const position = Cartesian3.fromDegrees(selectedPoint.lon, selectedPoint.lat, E.maximumRadius * .0006, E);
        Cartesian3.normalize(position, scratchN); Cartesian3.normalize(Cartesian3.subtract(cam, position, scratchV), scratchV);
        const point = Cartesian3.dot(scratchN, scratchV) > 0 ? SceneTransforms.worldToWindowCoordinates(viewer.scene, position) : undefined;
        if (point) { pulse.hidden = false; pulse.style.left = `${point.x}px`; pulse.style.top = `${point.y}px`; }
      }
    };
    const schedule = () => {
      if (frame || timer) return;
      const remaining = Math.max(0, 70 - (performance.now() - last));
      if (remaining) timer = window.setTimeout(() => { timer = 0; frame = requestAnimationFrame(update); }, remaining);
      else frame = requestAnimationFrame(update);
    };
    const off = viewer.scene.postRender.addEventListener(schedule);
    const offTour = onTour(event => { if (event.type === "tutorial:changed") schedule(); });
    const resize = new ResizeObserver(schedule); resize.observe(holder);
    schedule();
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); off(); offTour(); resize.disconnect(); entries.forEach(entry => entry.wrapper.remove()); pulse.remove(); };
  }, [viewer, pins, markers, body, selection?.lat, selection?.lon, requestedSelection?.body, requestedSelection?.lat, requestedSelection?.lon]);

  // ------------------------------------------------------------- selected cell
  const selKey = selection ? `${selection.lat},${selection.lon},${selection.outline?.length ?? 0},${selection.outline?.[0]?.join(",") ?? ""}` : "";
  useEffect(() => {
    if (!viewer) return;
    const E = ELLIPSOID[body];
    const R = E.maximumRadius;
    for (const e of selEntities.current) viewer.entities.remove(e);
    selEntities.current = [];
    if (selection) {
      const lift = R * 0.0004;
      if (selection.outline && selection.outline.length > 2) {
        const flat: number[] = [];
        // densify edges so cell sides follow parallels on the sphere
        const ring = selection.outline;
        for (let k = 0; k < ring.length - 1; k++) {
          const [lo0, la0] = ring[k];
          const [lo1, la1] = ring[k + 1];
          let d = lo1 - lo0;
          if (d > 180) d -= 360;
          if (d < -180) d += 360;
          for (let t = 0; t < 8; t++) flat.push(lo0 + (d * t) / 8, la0 + ((la1 - la0) * t) / 8, lift);
        }
        flat.push(ring[0][0], ring[0][1], lift);
        const pos = Cartesian3.fromDegreesArrayHeights(flat, E);
        selEntities.current.push(
          viewer.entities.add({ polyline: { positions: pos, width: 5, material: Color.fromCssColorString("#0b0c0e").withAlpha(0.75) } }),
          viewer.entities.add({ polyline: { positions: pos, width: 2.2, material: Color.fromCssColorString("#f6f2e9") } }),
        );
      }
      selEntities.current.push(
        viewer.entities.add({
          position: Cartesian3.fromDegrees(selection.lon, selection.lat, lift * 2, E),
          point: { pixelSize: 7, color: Color.fromCssColorString("#f6f2e9"), outlineColor: Color.fromCssColorString("#0b0c0e"), outlineWidth: 2 },
        }),
        // A ring around the selected place so it stands out at any zoom.
        viewer.entities.add({
          position: Cartesian3.fromDegrees(selection.lon, selection.lat, lift * 2, E),
          point: { pixelSize: 22, color: Color.TRANSPARENT, outlineColor: Color.fromCssColorString("#f6f2e9").withAlpha(0.95), outlineWidth: 2.5 },
        }),
      );
    }
    viewer.scene.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, selKey, body]);

  // ------------------------------------------------------------------- fly to
  useEffect(() => {
    if (!viewer || !focus || focus.body !== body || focus.nonce === lastFocus.current) return;
    lastFocus.current = focus.nonce;
    resetGesture.current?.();
    const E = ELLIPSOID[body];
    const span = (focus.spanKm ?? (E.maximumRadius / 1000) * 0.9) * 1000;
    const height = Math.max(viewer.scene.screenSpaceCameraController.minimumZoomDistance * 2, span * 0.87);
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(focus.lon, focus.lat, height, E), duration: motionDuration(1350) / 1000 });
  }, [viewer, focus, body]);

  return <>
    <div ref={host} className="absolute inset-0" aria-label={`${body === "moon" ? "Moon" : "Mars"} globe: drag to rotate, scroll or pinch to zoom. Select a research marker to inspect it.`}/>
    <div ref={markerHost} className="globe-fan-layer" aria-label="Map site markers" />
    {imageryError && <div role="status" className="pointer-events-none absolute top-14 left-3 z-20 max-w-[calc(100%-24px)] rounded-md border border-alert/40 bg-basalt-950/95 px-3 py-2 text-xs text-alert">{imageryError}</div>}
    {hoverTitle && <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 max-w-[70%] -translate-x-1/2 rounded-md bg-basalt-950/95 px-3 py-2 text-center text-xs text-regolith-50 ring-1 ring-[var(--hair)]">{hoverTitle}</div>}
    <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-14 focus-within:left-3 focus-within:z-40 focus-within:max-h-[55%] focus-within:max-w-[300px] focus-within:overflow-y-auto focus-within:rounded-lg focus-within:bg-basalt-900 focus-within:p-3" aria-label="Accessible map locations">
      {[...pins.map(p => ({ id: p.id ?? p.name, lat: p.lat, lon: p.lon, label: `${p.name}: ${p.kind}; select location` })), ...markers.map(m => ({ ...m, label: `${m.grade ? `Mission suitability grade ${m.grade}` : "Not graded"}; result ${m.id}` }))].map(p => <button key={p.id} className="ctl block w-full rounded p-2 text-left text-xs" onClick={() => cb.current.onPick?.(p.lat, p.lon, "marker")}>{p.label}</button>)}
    </div>
  </>;
});
