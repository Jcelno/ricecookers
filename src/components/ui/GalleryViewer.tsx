import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Locate, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GalleryFrame, OrbitalContext } from "@/lib/gallery";
import "./gallery.css";

const TYPE = { orbital: "Orbital view", ground: "Ground view", photograph: "Archive photograph", map: "Map tile" } as const;
export default function GalleryViewer({ frames, initialIndex = 0, orbital, onClose }: { frames: GalleryFrame[]; initialIndex?: number; orbital?: OrbitalContext; onClose: () => void }) {
  const [index, setIndex] = useState(Math.min(initialIndex, frames.length - 1));
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const points = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ startX: 0, startY: 0, lastX: 0, lastY: 0, distance: 0, scale: 1, pinched: false });
  const frame = frames[index] ?? frames[0];
  const step = useCallback((amount: number) => setIndex((old) => (old + amount + frames.length) % frames.length), [frames.length]);
  const controls = useRef({ onClose, step }); controls.current = { onClose, step };
  useEffect(() => { setScale(1); setPan({ x: 0, y: 0 }); points.current.clear(); }, [frame?.id]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.querySelector<HTMLButtonElement>('[aria-label="Close gallery"]')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); controls.current.onClose(); }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); controls.current.step(event.key === "ArrowRight" ? 1 : -1); }
      if (event.key === "Tab" && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')].filter((node) => node.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !box.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !box.current.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  if (!frame) return null;
  const viewpoint = orbital?.viewpoint ?? orbital;
  const unavailable = frame.unavailable ?? (failed.has(frame.id) ? `Image unavailable from ${frame.archive}. The source link and attribution remain available.` : null);
  const zoom = (next: number) => { const value = Math.max(1, Math.min(6, next)); setScale(value); if (value === 1) setPan({ x: 0, y: 0 }); };
  const distance = () => { const [a, b] = [...points.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  return createPortal(<div ref={box} role="dialog" aria-modal="true" aria-label="Photograph gallery" className="radium-gallery" data-gallery-viewer>
    <header className="gallery-header"><div><span className={`gallery-type gallery-type-${frame.kind ?? "photograph"}`}>{TYPE[frame.kind ?? "photograph"]}</span><span className="gallery-counter" aria-live="polite">{index + 1} of {frames.length}</span></div><div className="gallery-zoom"><button aria-label="Zoom image out" disabled={scale <= 1 || !!unavailable} onClick={() => zoom(scale - .5)}><Minus size={17} /></button><span>{Math.round(scale * 100)}%</span><button aria-label="Zoom image in" disabled={scale >= 6 || !!unavailable} onClick={() => zoom(scale + .5)}><Plus size={17} /></button><button aria-label="Reset image zoom" disabled={scale === 1} onClick={() => zoom(1)}><RotateCcw size={16} /></button></div><button aria-label="Close gallery" className="gallery-close" onClick={onClose}><X size={22} /></button></header>
    <div ref={stage} className="gallery-stage" onPointerDown={(event) => {
      if (event.target instanceof Element && event.target.closest("button,a")) return;
      event.currentTarget.setPointerCapture(event.pointerId); points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.current.size === 1) gesture.current = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, distance: 0, scale, pinched: false };
      if (points.current.size === 2) { gesture.current.distance = distance(); gesture.current.scale = scale; gesture.current.pinched = true; }
    }} onPointerMove={(event) => {
      if (!points.current.has(event.pointerId)) return;
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.current.size >= 2 && gesture.current.distance > 0) zoom(gesture.current.scale * distance() / gesture.current.distance);
      else if (scale > 1) { const bounds = event.currentTarget.getBoundingClientRect(); const maxX = bounds.width * (scale - 1) / 2, maxY = bounds.height * (scale - 1) / 2; const dx = event.clientX - gesture.current.lastX, dy = event.clientY - gesture.current.lastY; setPan((old) => ({ x: Math.max(-maxX, Math.min(maxX, old.x + dx)), y: Math.max(-maxY, Math.min(maxY, old.y + dy)) })); }
      gesture.current.lastX = event.clientX; gesture.current.lastY = event.clientY;
    }} onPointerUp={(event) => {
      if (!points.current.has(event.pointerId)) return;
      points.current.delete(event.pointerId);
      if (!points.current.size && !gesture.current.pinched && scale === 1) { const dx = event.clientX - gesture.current.startX, dy = event.clientY - gesture.current.startY; if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1); }
    }} onPointerCancel={(event) => points.current.delete(event.pointerId)}>
      {frames.length > 1 && <button className="gallery-arrow gallery-previous" aria-label="Previous photograph" onClick={() => step(-1)}><ChevronLeft size={30} /></button>}
      {unavailable ? <div className="gallery-unavailable"><ImageOff size={35} /><h2>Imagery unavailable</h2><p>{unavailable}</p></div> : <div className={`gallery-image-wrap ${frame.marker ? "gallery-orbital-image" : ""}`} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}><img key={frame.id} src={frame.full} alt={frame.title} draggable="false" referrerPolicy="no-referrer" onError={() => setFailed((old) => new Set(old).add(frame.id))} />{frame.marker && <span className="gallery-cell-ring" aria-label="Analysis cell centre" style={{ left: `${frame.marker.x * 100}%`, top: `${frame.marker.y * 100}%` }} />}</div>}
      {frames.length > 1 && <button className="gallery-arrow gallery-next" aria-label="Next photograph" onClick={() => step(1)}><ChevronRight size={30} /></button>}
    </div>
    <footer className="gallery-footer"><div className="gallery-caption"><h2>{frame.title}</h2><p>{frame.credit} · {frame.licenseUrl ? <a href={frame.licenseUrl} target="_blank" rel="noreferrer">{frame.license}</a> : frame.license} · {frame.archive}</p>{frame.note && <p>{frame.note}</p>}<div className="gallery-source-links"><a href={frame.page} target="_blank" rel="noreferrer">Original and source terms<ExternalLink size={12} /></a>{orbital?.body === "earth" && <><a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${viewpoint?.lat},${viewpoint?.lon}`} target="_blank" rel="noreferrer">Google Street View<ExternalLink size={12} /></a><a href={`https://www.google.com/maps/search/?api=1&query=${viewpoint?.lat},${viewpoint?.lon}`} target="_blank" rel="noreferrer">Google Maps<ExternalLink size={12} /></a></>}</div>{orbital?.body === "earth" && <p className="gallery-external-note">Google links are external context, not RADIUM data; Street View coverage is not guaranteed.</p>}{!frame.marker && <p className="gallery-external-note">View type is interpreted from archive metadata; an unspecified viewpoint stays labelled “Archive photograph”.</p>}</div>
      <div className="gallery-thumbnails" role="group" aria-label="Choose gallery image">{frames.map((item, i) => <button key={item.id} aria-label={`View image ${i + 1}: ${item.title}`} aria-current={i === index ? "true" : undefined} onClick={() => setIndex(i)}>{item.thumb && !failed.has(item.id) ? <img src={item.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Locate size={22} />}<span>{i + 1}</span></button>)}</div>
    </footer>
  </div>, document.body);
}
