import { useState } from "react";

import type { Body, Basemap, TileLayer } from "@/lib/types";

/**
 * One real orbital image tile around the selected cell, with the cell centre marked.
 * Moon and Mars: the NASA Trek mosaic in use (geographic tiling, 2 × 1 tiles at level 0).
 * Earth: the satellite basemap in use (Web Mercator tiles).
 */
export function OrbitalTile({ body, lat, lon, layer }: { body: Body; lat: number; lon: number; layer: TileLayer | Basemap | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!layer) return null;
  if (body !== "earth" && Math.abs(lat) > 65) {
    // Mosaic tiles are latitude/longitude grids: this close to a pole one tile is stretched into streaks.
    return <p className="rounded-sm bg-basalt-800 px-3 py-2 text-xs leading-snug text-regolith-300">Flat image tiles are too distorted this close to the pole to show a fair picture. The 3D map shows this area without distortion: use Explore and zoom in.</p>;
  }
  let url: string, px: number, py: number, scaleKm: string;
  if (body === "earth") {
    const z = Math.min((layer as Basemap).max_zoom ?? 9, 9);
    const n = 2 ** z;
    const xf = ((lon + 180) / 360) * n;
    const r = (lat * Math.PI) / 180;
    const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
    url = layer.url.replace("{z}", String(z)).replace("{x}", String(Math.floor(xf))).replace("{y}", String(Math.floor(yf)));
    px = xf - Math.floor(xf); py = yf - Math.floor(yf);
    scaleKm = `about ${Math.round((40075 * Math.cos(r)) / n)} km across`;
  } else {
    const L = Math.min((layer as TileLayer).max_level ?? 5, 5);
    const nx = 2 ** (L + 1), ny = 2 ** L;
    const xf = ((lon + 180) / 360) * nx;
    const yf = ((90 - lat) / 180) * ny;
    url = layer.url.replace("{z}", String(L)).replace("{x}", String(Math.min(nx - 1, Math.floor(xf)))).replace("{y}", String(Math.min(ny - 1, Math.floor(yf))));
    px = xf - Math.floor(xf); py = yf - Math.floor(yf);
    const R = body === "moon" ? 1737.4 : 3389.5;
    scaleKm = `about ${Math.round(((2 * Math.PI * R) / nx) * Math.cos((lat * Math.PI) / 180))} km across`;
  }
  if (failed) return <p className="text-xs text-regolith-400">The orbital image tile could not be loaded. The map above shows the same mosaic.</p>;
  return (
    <figure>
      <div className="relative overflow-hidden rounded-sm ring-1 ring-[var(--hair)]">
        <img src={url} alt={`Orbital image around the selected cell, ${layer.title}`} loading="lazy" onError={() => setFailed(true)} className="block aspect-square w-full object-cover" referrerPolicy="no-referrer" />
        <span className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgb(0_0_0/0.6)]" style={{ left: `${px * 100}%`, top: `${py * 100}%` }} aria-hidden />
      </div>
      <figcaption className="mt-1 text-2xs leading-snug text-regolith-400">Orbital view: {layer.title}, one map tile ({scaleKm}). The ring marks the cell centre. {"provider" in layer ? layer.provider : ""}</figcaption>
    </figure>
  );
}

/** URL and in-tile position of the Web Mercator tile containing a point (Earth basemaps). */
export function earthTile(template: string, lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const xf = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { url: template.replace("{z}", String(z)).replace("{x}", String(Math.floor(xf))).replace("{y}", String(Math.floor(yf))), px: xf % 1, py: yf % 1 };
}
