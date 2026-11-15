import { Columns2, X } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import { useStore } from "@/store";

const DOT = { moon: "#cfd9e6", mars: "#dc9877", earth: "#6fbcce" } as const;

/** Places waiting to be compared, visible from every view so the selection is never lost. */
export function CompareTray() {
  const list = useStore((s) => s.compareList);
  const mode = useStore((s) => s.mode);
  const { removeCompare, clearCompare, setMode } = useStore.getState();
  if (!list.length || mode === "compare") return null;
  return (
    <div className="pointer-events-none absolute top-2 left-1/2 z-40 w-max max-w-[calc(100%-24px)] -translate-x-1/2">
      <div className="surface-float anim-rise pointer-events-auto flex items-center gap-1.5 rounded-full py-1 pr-1 pl-3 ring-1 ring-[var(--hair-strong)]" role="region" aria-label="Places to compare">
        <Columns2 size={14} className="shrink-0 text-regolith-300" />
        <span className="text-xs text-regolith-300 max-sm:hidden">Compare</span>
        <ul className="no-scrollbar flex min-w-0 gap-1 overflow-x-auto">
          {list.map((s, i) => (
            <li key={`${s.body}${s.lat}${s.lon}`} className="flex shrink-0 items-center gap-1 rounded-full bg-basalt-800 py-0.5 pr-0.5 pl-2 text-xs text-regolith-100">
              <span className="size-2 rounded-full" data-new-lead={s.newLead ? "true" : undefined} style={s.newLead ? { background: "transparent", border: "1px dashed var(--color-world)", width: 10, height: 10 } : { background: DOT[s.body] }} title={s.newLead ? "New lead: computed screening result, not a verified field site" : undefined} aria-hidden />
              <span className="max-w-[140px] truncate">{s.label}</span>
              <button type="button" className="ctl grid size-5 place-items-center rounded-full text-regolith-400" aria-label={`Remove ${s.label} from Compare`} onClick={() => removeCompare(i)}><X size={11} /></button>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="solid" className="rounded-full" onClick={() => setMode("compare")}>Open</Button>
        <button type="button" className="ctl rounded-full px-2 text-2xs text-regolith-400" onClick={clearCompare}>Clear</button>
      </div>
    </div>
  );
}
