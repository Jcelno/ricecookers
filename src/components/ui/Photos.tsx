import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { cx } from "@/components/ui/primitives";
import type { Photo, PhotoSet } from "@/lib/photos";
import { consumeGalleryRequest, type OrbitalContext } from "@/lib/gallery";
import { orbitalFrame } from "@/components/panels/OrbitalTile";
const GalleryViewer = lazy(() => import("./GalleryViewer"));

type State = { status: "loading" } | { status: "ready"; set: PhotoSet } | { status: "error"; message: string };

/** Loads a set of real photographs and shows them as captioned plates. `load` must be stable for a given `id`. */
export function Photos({ id, load, compact = false, hideEmpty = false, orbital }: { id: string; load: () => Promise<PhotoSet>; compact?: boolean; hideEmpty?: boolean; orbital?: OrbitalContext }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [open, setOpen] = useState<number | null>(null);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const drop = (pid: string) => setBroken((b) => new Set(b).add(pid));
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    setOpen(null);
    setBroken(new Set());
    loader.current().then(
      (set) => live && setState({ status: "ready", set }),
      (e: unknown) => live && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
    return () => { live = false; };
  }, [id]);

  useEffect(() => {
    const requested = () => { if (consumeGalleryRequest(id)) setOpen(0); };
    window.addEventListener("radium:gallery", requested); requested();
    return () => window.removeEventListener("radium:gallery", requested);
  }, [id]);
  const first = orbital ? orbitalFrame(orbital) : null;
  const availablePhotos = state.status === "ready" ? state.set.photos.filter((photo) => !broken.has(photo.id)) : [];
  const frames = [...(first ? [first] : []), ...availablePhotos];
  const renderPlates = () => {
  if (state.status === "loading") {
    return (
      <div className="px-4 pb-4" aria-busy="true">
        <div className={cx("plate-skeleton w-full rounded-sm", compact ? "aspect-[16/9]" : "aspect-[3/2]")} />
        <div className="mt-2 grid grid-cols-3 gap-1.5">{[0, 1, 2].map((k) => <div key={k} className="plate-skeleton aspect-square rounded-sm" />)}</div>
        <span className="sr-only">Looking for photographs</span>
      </div>
    );
  }
  if (state.status === "error") {
    if (hideEmpty) return null;
    return <p className="px-4 pb-4 text-xs leading-snug text-regolith-400">Photographs could not be loaded ({state.message}). The archive may be busy; reopen this place to try again.</p>;
  }
  const { basis } = state.set;
  const photos = state.set.photos.filter((p) => !broken.has(p.id)); // a file that fails to load is dropped, not shown broken
  if (!photos.length) {
    if (hideEmpty) return null;
    return <p className="px-4 pb-4 text-xs leading-snug text-regolith-400">{state.set.photos.length ? "The photographs found for this place could not be loaded." : basis}</p>;
  }
  const [lead, ...rest] = photos;
  return (
    <div className="px-4 pb-4">
      <figure>
        <button type="button" onClick={() => setOpen(first ? 1 : 0)} className="plate group block w-full overflow-hidden rounded-sm" aria-label={`Open photograph: ${lead.title}`}>
          <img src={lead.thumb} alt={lead.title} loading="lazy" onError={() => drop(lead.id)} referrerPolicy="no-referrer" className={cx("plate-img w-full object-cover", compact ? "aspect-[16/9]" : "aspect-[3/2]")} />
        </button>
        <figcaption className="mt-1.5">
          <span className="placename block text-sm leading-snug text-regolith-100 [overflow-wrap:anywhere]">{lead.title}</span>
          <Credit p={lead} />
        </figcaption>
      </figure>
      {rest.length > 0 && (
        <ul className="mt-2.5 grid grid-cols-3 gap-1.5">
          {rest.slice(0, compact ? 3 : 6).map((p, k) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(k + 1 + (first ? 1 : 0))} className="plate block w-full overflow-hidden rounded-sm" aria-label={`Open photograph: ${p.title}`}>
                <img src={p.thumb} alt={p.title} loading="lazy" onError={() => drop(p.id)} referrerPolicy="no-referrer" className="plate-img aspect-square w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-2xs leading-snug text-regolith-500">{basis} Real photographs only; illustrations and AI-generated images are left out.</p>
    </div>
  );
  };
  return <>{renderPlates()}{open !== null && frames.length > 0 && <Suspense fallback={<div role="status" className="fixed inset-0 z-[120] grid place-items-center bg-basalt-950/95 text-regolith-200">Opening the image gallery</div>}><GalleryViewer frames={frames} initialIndex={open} orbital={orbital} onClose={() => setOpen(null)} /></Suspense>}</>;
}

function Credit({ p }: { p: Photo }) {
  return (
    <span className="mt-0.5 block text-2xs leading-snug text-regolith-400 [overflow-wrap:anywhere]">
      {p.credit}, {p.licenseUrl ? <a className="link" href={p.licenseUrl} target="_blank" rel="noreferrer">{p.license}</a> : p.license}, via{" "}
      <a className="link" href={p.page} target="_blank" rel="noreferrer">{p.archive}</a>
    </span>
  );
}

