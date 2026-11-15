import "cesium/Build/Cesium/Widgets/widgets.css";

import {
  Cartesian2, Cartesian3, Cartographic, Color, CustomDataSource, DistanceDisplayCondition, Ellipsoid, EllipsoidTerrainProvider, type Entity,
  GeographicProjection, GeographicTilingScheme, Globe, HorizontalOrigin, ImageryLayer, LabelStyle, Math as CMath, NearFarScalar, PolylineDashMaterialProperty,
  Rectangle, ScreenSpaceEventHandler, ScreenSpaceEventType, SingleTileImageryProvider, SkyBox, SplitDirection, TextureMagnificationFilter,
  TextureMinificationFilter, UrlTemplateImageryProvider, VerticalOrigin, Viewer,
} from "cesium";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { GRADE_HEX, wrapLon } from "@/lib/format";
import { motionDuration, sphericalCenter } from "@/lib/markers";
import type { Grade, Pin, Planet, TileLayer } from "@/lib/types";
import type { Focus } from "@/store";

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
export interface SiteMarker { id: string; lat: number; lon: number; text: string; grade: Grade | null; active?: boolean }
export interface ViewState { lat: number; lon: number; degPerPx: number; heightKm: number }
export interface GlobeHandle { zoom: (factor: number) => void; home: () => void }
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
  onPick?: (lat: number, lon: number) => void;
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
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const baseRef = useRef<ImageryLayer | null>(null);
  const tileRef = useRef<ImageryLayer | null>(null);
  const imgRef = useRef(new Map<string, ImageryLayer>());
  const pinEntities = useRef<Entity[]>([]);
  const markerEntities = useRef<Entity[]>([]);
  const selEntities = useRef<Entity[]>([]);
  const lookup = useRef(new Map<string, { lat: number; lon: number }>());
  const cb = useRef({ onPick, onCursor, onView, onStatus });
  cb.current = { onPick, onCursor, onView, onStatus };
  const lastFocus = useRef(0);
  const [hoverTitle, setHoverTitle] = useState<string | null>(null);

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
          v.camera.flyTo({ destination: Cartesian3.fromDegrees(center.lon, center.lat, height, ellipsoid), duration: motionDuration(650) / 1000 });
          return;
        }
      }
      const id = hit && (hit.id as Entity | undefined)?.id;
      const known = typeof id === "string" ? lookup.current.get(id) : undefined;
      if (known) return cb.current.onPick?.(known.lat, known.lon);
      const p = pickLatLon(e.position);
      if (p) cb.current.onPick?.(p.lat, p.lon);
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

    const report = () => {
      if (v.isDestroyed()) return; // a queued camera event can arrive after the viewer is torn down
      const w = scene.canvas.clientWidth;
      const h = scene.canvas.clientHeight;
      const centre = pickLatLon(new Cartesian2(w / 2, h / 2));
      const height = v.camera.positionCartographic.height;
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
    setTimeout(report, 60);

    return () => {
      cancelAnimationFrame(raf);
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
      setViewer(null);
      if (!v.isDestroyed()) v.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  useImperativeHandle(ref, () => ({
    zoom: (factor) => {
      const v = viewerRef.current;
      if (!v) return;
      const h = v.camera.positionCartographic.height;
      const target = Math.max(v.scene.screenSpaceCameraController.minimumZoomDistance, Math.min(v.scene.screenSpaceCameraController.maximumZoomDistance, h * factor));
      const c = v.camera.positionCartographic;
      v.camera.flyTo({ destination: Cartesian3.fromRadians(c.longitude, c.latitude, target, ELLIPSOID[body]), duration: motionDuration(450) / 1000 });
    },
    home: () => {
      const v = viewerRef.current;
      if (!v) return;
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
    const layer = new ImageryLayer(tiles(base));
    viewer.imageryLayers.add(layer, 0);
    if (baseRef.current) viewer.imageryLayers.remove(baseRef.current, true);
    baseRef.current = layer;
    layer.saturation = dimBase ? 0.1 : 1;
    layer.brightness = dimBase ? 0.62 : 1;
    viewer.scene.requestRender();
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
    if (tileOverlay) {
      const layer = new ImageryLayer(tiles(tileOverlay), { alpha: opacity });
      layer.splitDirection = splitRef.current === null ? SplitDirection.NONE : SplitDirection.RIGHT;
      viewer.imageryLayers.add(layer, 1);
      tileRef.current = layer;
    }
    viewer.scene.requestRender();
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
    };
  }, [viewer, pins, markers, body, selection?.lat, selection?.lon]);

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
    const E = ELLIPSOID[body];
    const span = (focus.spanKm ?? (E.maximumRadius / 1000) * 0.9) * 1000;
    const height = Math.max(viewer.scene.screenSpaceCameraController.minimumZoomDistance * 2, span * 0.87);
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(focus.lon, focus.lat, height, E), duration: motionDuration(1350) / 1000 });
  }, [viewer, focus, body]);

  return <>
    <div ref={host} className="absolute inset-0" aria-label={`${body === "moon" ? "Moon" : "Mars"} globe: drag to rotate, scroll or pinch to zoom. Select a research marker to inspect it.`}/>
    {hoverTitle && <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 max-w-[70%] -translate-x-1/2 rounded-md bg-basalt-950/95 px-3 py-2 text-center text-xs text-regolith-50 ring-1 ring-[var(--hair)]">{hoverTitle}</div>}
    <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-14 focus-within:left-3 focus-within:z-40 focus-within:max-h-[55%] focus-within:max-w-[300px] focus-within:overflow-y-auto focus-within:rounded-lg focus-within:bg-basalt-900 focus-within:p-3" aria-label="Accessible map locations">
      {[...pins.map(p => ({ id: p.id ?? p.name, lat: p.lat, lon: p.lon, label: `${p.name}: ${p.kind}; select location` })), ...markers.map(m => ({ ...m, label: `${m.grade ? `Mission suitability grade ${m.grade}` : "Not graded"}; result ${m.id}` }))].map(p => <button key={p.id} className="ctl block w-full rounded p-2 text-left text-xs" onClick={() => cb.current.onPick?.(p.lat, p.lon)}>{p.label}</button>)}
    </div>
  </>;
});
