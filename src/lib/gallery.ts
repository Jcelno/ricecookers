import type { Basemap, Body, TileLayer } from "./types";
import type { Photo } from "./photos";

export interface OrbitalContext { body: Body; lat: number; lon: number; layer: TileLayer | Basemap | undefined }
export interface GalleryFrame extends Omit<Photo, "archive" | "kind"> {
  archive: string;
  kind?: "ground" | "orbital" | "map" | "photograph";
  note?: string;
  marker?: { x: number; y: number };
  unavailable?: string;
}
let requestedGallery: string | null = null;
/** Also remembers a request made while the location panel is switching back to Overview. */
export function openPhotoGallery(id: string) {
  requestedGallery = id;
  window.dispatchEvent(new CustomEvent("radium:gallery", { detail: { id } }));
}
export function consumeGalleryRequest(id: string) {
  if (requestedGallery !== id) return false;
  requestedGallery = null;
  return true;
}
