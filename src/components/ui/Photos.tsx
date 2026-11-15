import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cx, IconButton } from "@/components/ui/primitives";
import type { Photo, PhotoSet } from "@/lib/photos";

type State = { status: "loading" } | { status: "ready"; set: PhotoSet } | { status: "error"; message: string };

/** Loads a set of real photographs and shows them as captioned plates. `load` must be stable for a given `id`. */
export function Photos({ id, load, compact = false, hideEmpty = false }: { id: string; load: () => Promise<PhotoSet>; compact?: boolean; hideEmpty?: boolean }) {
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
        <button type="button" onClick={() => setOpen(0)} className="plate group block w-full overflow-hidden rounded-sm" aria-label={`Open photograph: ${lead.title}`}>
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
              <button type="button" onClick={() => setOpen(k + 1)} className="plate block w-full overflow-hidden rounded-sm" aria-label={`Open photograph: ${p.title}`}>
                <img src={p.thumb} alt={p.title} loading="lazy" onError={() => drop(p.id)} referrerPolicy="no-referrer" className="plate-img aspect-square w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-2xs leading-snug text-regolith-500">{basis} Real photographs only; illustrations and AI-generated images are left out.</p>
      {open !== null && <Viewer photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Credit({ p }: { p: Photo }) {
  return (
    <span className="mt-0.5 block text-2xs leading-snug text-regolith-400 [overflow-wrap:anywhere]">
      {p.credit}, {p.licenseUrl ? <a className="link" href={p.licenseUrl} target="_blank" rel="noreferrer">{p.license}</a> : p.license}, via{" "}
      <a className="link" href={p.page} target="_blank" rel="noreferrer">{p.archive}</a>
    </span>
  );
}

function Viewer({ photos, index, onIndex, onClose }: { photos: Photo[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const p = photos[index];
  const box = useRef<HTMLDivElement>(null);
  const step = useCallback((d: number) => onIndex((index + d + photos.length) % photos.length), [index, onIndex, photos.length]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [onClose, step]);

  return createPortal(
    <div ref={box} role="dialog" aria-modal="true" aria-label={p.title} className="anim-fade fixed inset-0 z-[80] flex flex-col bg-[rgb(3_4_6/0.94)]" onClick={onClose}>
      <div className="flex items-center justify-end gap-1 p-3" onClick={(e) => e.stopPropagation()}>
        <span className="tnum mr-auto pl-2 text-xs text-regolith-400">{index + 1} of {photos.length}</span>
        <IconButton label="Close the photograph" onClick={onClose}><X size={18} /></IconButton>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 max-sm:px-2" onClick={(e) => e.stopPropagation()}>
        {photos.length > 1 && (
          <IconButton label="Previous photograph" className="absolute left-3 max-sm:hidden" onClick={() => step(-1)}><ChevronLeft size={22} /></IconButton>
        )}
        <img key={p.id} src={p.full} alt={p.title} referrerPolicy="no-referrer" className="anim-fade max-h-full max-w-full rounded-sm object-contain shadow-[var(--shadow-float)]" />
        {photos.length > 1 && (
          <IconButton label="Next photograph" className="absolute right-3 max-sm:hidden" onClick={() => step(1)}><ChevronRight size={22} /></IconButton>
        )}
      </div>
      <div className="mx-auto w-full max-w-3xl px-5 pt-3 pb-5" onClick={(e) => e.stopPropagation()}>
        <div className="placename text-lg leading-snug text-regolith-50">{p.title}</div>
        <Credit p={p} />
        <a className="link mt-2 inline-flex items-center gap-1 text-xs" href={p.page} target="_blank" rel="noreferrer">
          Open the original and its full licence <ExternalLink size={11} />
        </a>
      </div>
    </div>,
    document.body,
  );
}
