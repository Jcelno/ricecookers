import "cesium/Build/Cesium/Widgets/widgets.css";

import {
  Cartesian2, Cartesian3, Cartographic, Color, DistanceDisplayCondition, Ellipsoid, EllipsoidTerrainProvider, type Entity,
  GeographicProjection, GeographicTilingScheme, Globe, HorizontalOrigin, ImageryLayer, LabelStyle, Math as CMath, NearFarScalar,
  Rectangle, ScreenSpaceEventHandler, ScreenSpaceEventType, SingleTileImageryProvider, SkyBox, TextureMagnificationFilter,
  TextureMinificationFilter, UrlTemplateImageryProvider, VerticalOrigin, Viewer,
} from "cesium";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { GRADE_HEX, wrapLon } from "@/lib/format";
import type { Grade, Pin, Planet, TileLayer } from "@/lib/types";
import type { Focus } from "@/store";

/** Hide pins that have rotated to the far side or to within a grazing angle of the rim, so a pin or its
 *  label is never drawn half-clipped by the horizon (which reads as a pin floating off the globe). */
const scratchN = new Cartesian3();
const scratchV = new Cartesian3();
function cullToHorizon(v: Viewer, ents: Entity[]) {
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
}

function markerImage(text: string, grade: Grade | null, active: boolean) {
  const s = 56;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 5, 0, Math.PI * 2);
  g.fillStyle = grade ? GRADE_HEX[grade] : "#94938a";
  g.fill();
  g.lineWidth = active ? 5 : 3;
  g.strokeStyle = active ? "#f6f2e9" : "#101216";
  g.stroke();
  g.fillStyle = "#101216";
  g.font = '600 26px "IBM Plex Sans", sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, s / 2, s / 2 + 1);
  return c;
}

export const GlobeView = forwardRef<GlobeHandle, Props>(function GlobeView(
  { body, base, tileOverlay, images = [], opacity = 0.85, dimBase = false, pins = [], markers = [], selection, focus, interactive = true, onPick, onCursor, onView, onStatus },
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
    scene.globe.maximumScreenSpaceError = 1.5;
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
      const c = v.camera.pickEllipsoid(pos, ellipsoid);
      if (!c) return null;
      const g = Cartographic.fromCartesian(c, ellipsoid);
      return { lat: CMath.toDegrees(g.latitude), lon: wrapLon(CMath.toDegrees(g.longitude)) };
    };

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((e: { position: Cartesian2 }) => {
      const hit = scene.pick(e.position);
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
      raf = requestAnimationFrame(() => cb.current.onCursor?.(pickLatLon(pos)));
    }, ScreenSpaceEventType.MOUSE_MOVE);
    const leave = () => cb.current.onCursor?.(null);
    scene.canvas.addEventListener("mouseleave", leave);

    const report = () => {
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
      v.camera.flyTo({ destination: Cartesian3.fromRadians(c.longitude, c.latitude, target, ELLIPSOID[body]), duration: 0.45 });
    },
    home: () => {
      const v = viewerRef.current;
      if (!v) return;
      v.camera.flyTo({ destination: Cartesian3.fromDegrees(HOME[body].lon, HOME[body].lat, ELLIPSOID[body].maximumRadius * 1.75, ELLIPSOID[body]), duration: 1.1 });
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
      viewer.imageryLayers.add(layer, 1);
      tileRef.current = layer;
    }
    viewer.scene.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, tileOverlay?.id]);

  // ------------------------------------------------- RADIUM grid image overlays
  const imageKey = images.map((i) => i.key).join("|");
  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    const want = new Map(images.map((i) => [i.key, i]));
    for (const [key, layer] of imgRef.current) {
      if (!want.has(key)) {
        viewer.imageryLayers.remove(layer, true);
        imgRef.current.delete(key);
      }
    }
    for (const img of images) {
      if (imgRef.current.has(img.key)) continue;
      SingleTileImageryProvider.fromUrl(img.url, { rectangle: Rectangle.fromDegrees(...img.rect) })
        .then((provider) => {
          if (cancelled || viewer.isDestroyed() || imgRef.current.has(img.key)) return;
          const layer = new ImageryLayer(provider, {
            alpha: opacity,
            magnificationFilter: TextureMagnificationFilter.NEAREST,
            minificationFilter: TextureMinificationFilter.LINEAR,
          });
          viewer.imageryLayers.add(layer);
          imgRef.current.set(img.key, layer);
          viewer.scene.requestRender();
        })
        .catch((e) => console.warn("overlay failed to load", img.url, e));
    }
    viewer.scene.requestRender();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, imageKey]);

  useEffect(() => {
    if (!viewer) return;
    if (tileRef.current) tileRef.current.alpha = opacity;
    for (const l of imgRef.current.values()) l.alpha = opacity;
    viewer.scene.requestRender();
  }, [viewer, opacity]);

  // ---------------------------------------------------------------------- pins
  useEffect(() => {
    if (!viewer) return;
    const E = ELLIPSOID[body];
    const R = E.maximumRadius;
    for (const e of pinEntities.current) {
      lookup.current.delete(e.id);
      viewer.entities.remove(e);
    }
    pinEntities.current = pins.map((p) => {
      const landing = p.kind === "landing";
      const ent = viewer.entities.add({
        position: Cartesian3.fromDegrees(p.lon, p.lat, R * 0.0006, E),
        point: {
          pixelSize: landing ? 8 : 7,
          color: landing ? Color.fromCssColorString("#f6f2e9") : Color.fromCssColorString("#101216").withAlpha(0.35),
          outlineColor: landing ? Color.fromCssColorString("#101216") : Color.fromCssColorString("#f6f2e9"),
          outlineWidth: landing ? 2 : 1.5,
          scaleByDistance: new NearFarScalar(R * 0.3, 1.25, R * 6, 0.7),
        },
        label: {
          text: p.name,
          font: landing ? '500 13px "IBM Plex Sans", sans-serif' : 'italic 500 15px "Newsreader Variable", Georgia, serif',
          fillColor: Color.fromCssColorString("#f6f2e9"),
          outlineColor: Color.fromCssColorString("#0b0c0e"),
          outlineWidth: 4,
          style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.CENTER,
          pixelOffset: new Cartesian2(9, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, landing ? R * 4.2 : R * 2.2),
          scaleByDistance: new NearFarScalar(R * 0.3, 1, R * 4, 0.82),
        },
      });
      lookup.current.set(ent.id, { lat: p.lat, lon: p.lon });
      return ent;
    });
    cullToHorizon(viewer, pinEntities.current);
    viewer.scene.requestRender();
  }, [viewer, pins, body]);

  // -------------------------------------------------------------- ranked sites
  useEffect(() => {
    if (!viewer) return;
    const E = ELLIPSOID[body];
    const R = E.maximumRadius;
    for (const e of markerEntities.current) {
      lookup.current.delete(e.id);
      viewer.entities.remove(e);
    }
    markerEntities.current = markers.map((m) => {
      const ent = viewer.entities.add({
        position: Cartesian3.fromDegrees(m.lon, m.lat, R * 0.001, E),
        billboard: {
          image: markerImage(m.text, m.grade, !!m.active),
          width: m.active ? 30 : 24,
          height: m.active ? 30 : 24,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(R * 0.2, 1.15, R * 6, 0.8),
        },
      });
      lookup.current.set(ent.id, { lat: m.lat, lon: m.lon });
      return ent;
    });
    cullToHorizon(viewer, markerEntities.current);
    viewer.scene.requestRender();
  }, [viewer, markers, body]);

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
          point: { pixelSize: 6, color: Color.fromCssColorString("#f6f2e9"), outlineColor: Color.fromCssColorString("#0b0c0e"), outlineWidth: 2 },
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
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(focus.lon, focus.lat, height, E), duration: 1.35 });
  }, [viewer, focus, body]);

  return <div ref={host} className="absolute inset-0" />;
});
