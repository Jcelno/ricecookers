import { useEffect, useState } from "react";
import type { OrbitalContext, GalleryFrame } from "@/lib/gallery";

/** A real tile from the active imagery source; no resampling of scientific values. */
export function orbitalFrame({ body, lat, lon, layer }: OrbitalContext): GalleryFrame | null {
  if (!layer) return null;
  const frame: GalleryFrame = {
    id: `orbital:${body}:${lat},${lon}:${layer.id}`, title: `${layer.title} around the selected cell`, kind: body === "earth" && !/sentinel|imagery|satellite|cloudless/i.test(`${layer.id} ${layer.title}`) ? "map" : "orbital",
    credit: layer.attribution, archive: layer.provider, license: "Provider terms apply; follow the source link",
    page: "capabilities" in layer ? layer.capabilities : layer.url, full: "", thumb: "",
  };
  if (body !== "earth" && Math.abs(lat) > 65) return { ...frame, unavailable: "Flat image tiles are too distorted this close to the pole to show a fair picture. Use the 3D globe to inspect this area." };
  let url: string, px: number, py: number, widthKm: number;
  if (body === "earth") {
    const zoom = Math.min("max_zoom" in layer ? layer.max_zoom : 9, 9);
    const tile = earthTile(layer.url, lat, lon, zoom);
    url = tile.url; px = tile.px; py = tile.py;
    widthKm = 40075 * Math.cos(lat * Math.PI / 180) / 2 ** zoom;
  } else {
    const level = Math.min("max_level" in layer ? layer.max_level : 5, 5);
    const nx = 2 ** (level + 1), ny = 2 ** level;
    const xf = (((lon + 180) % 360 + 360) % 360 / 360) * nx, yf = ((90 - lat) / 180) * ny;
    url = layer.url.replace("{z}", String(level)).replace("{x}", String(Math.min(nx - 1, Math.floor(xf)))).replace("{y}", String(Math.min(ny - 1, Math.floor(yf))));
    px = xf - Math.floor(xf); py = yf - Math.floor(yf);
    const radius = body === "moon" ? 1737.4 : 3389.5;
    widthKm = 2 * Math.PI * radius / nx * Math.cos(lat * Math.PI / 180);
  }
  return { ...frame, full: url, thumb: url, page: "capabilities" in layer ? layer.capabilities : url, marker: { x: px, y: py }, note: `One source tile, about ${Math.round(widthKm)} km across (computed from tile geometry). The ring marks the analysis-cell centre, not a ground photograph's viewpoint.` };
}
export function OrbitalTile(props: OrbitalContext) {
  const frame = orbitalFrame(props);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [frame?.id]);
  if (!frame) return null;
  if (frame.unavailable) return <p className="rounded-sm bg-basalt-800 px-3 py-2 text-xs leading-snug text-regolith-300">{frame.unavailable}</p>;
  if (failed) return <p className="text-xs text-regolith-400">The image tile could not be loaded. Imagery is unavailable from {frame.archive}.</p>;
  return <figure><div className="relative overflow-hidden rounded-sm ring-1 ring-[var(--hair)]"><img src={frame.full} alt={frame.title} loading="lazy" onError={() => setFailed(true)} className="block aspect-square w-full object-cover" referrerPolicy="no-referrer" />{frame.marker && <span className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgb(0_0_0/0.6)]" style={{ left: `${frame.marker.x * 100}%`, top: `${frame.marker.y * 100}%` }} aria-hidden />}</div><figcaption className="mt-1 text-2xs leading-snug text-regolith-400">{frame.kind === "map" ? "Map" : "Orbital"} view: {props.layer?.title}. {frame.note} {frame.credit}</figcaption></figure>;
}
/** URL and in-tile position of the Web Mercator tile containing a point. */
export function earthTile(template: string, lat: number, lon: number, z: number) {
  const n = 2 ** z, safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const xf = (((lon + 180) % 360 + 360) % 360 / 360) * n;
  const r = safeLat * Math.PI / 180;
  const yf = Math.max(0, Math.min(n - 1e-8, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n));
  return { url: template.replace("{z}", String(z)).replace("{x}", String(Math.floor(xf))).replace("{y}", String(Math.floor(yf))), px: xf % 1, py: yf % 1 };
}
