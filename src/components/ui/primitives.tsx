import { ChevronDown, Loader2, X } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from "react";

import { GRADE_COLOR, GRADE_MEANING } from "@/lib/format";
import type { Evidence, Grade } from "@/lib/types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ----------------------------------------------------------------- buttons */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ghost" | "solid" | "outline"; size?: "sm" | "md" };

export function Button({ variant = "ghost", size = "md", className, children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "ctl inline-flex items-center justify-center gap-1.5 rounded-sm font-medium whitespace-nowrap select-none",
        size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm",
        variant === "solid" && "bg-world text-world-ink",
        variant === "outline" && "border border-[var(--hair-strong)] text-regolith-100",
        variant === "ghost" && "text-regolith-200",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={cx("ctl inline-grid size-8 place-items-center rounded-sm text-regolith-200", className)}>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- segmented */
export function Segmented<T extends string>({
  value, onChange, options, label, size = "md",
}: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[]; label: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-md bg-basalt-950/70 p-0.5 ring-1 ring-[var(--hair)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          title={o.title}
          disabled={o.disabled}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("ctl rounded-sm font-medium text-regolith-300", size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-sm")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- switch */
export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="row-ctl flex cursor-pointer items-start gap-3 rounded-sm px-2 py-1.5">
      <span className="relative mt-0.5 inline-block h-4 w-7 shrink-0">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 cursor-pointer opacity-0" />
        <span className={cx("absolute inset-0 rounded-full ring-1 ring-[var(--hair-strong)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--world)]", checked ? "bg-world" : "bg-basalt-600")} />
        <span
          className="absolute top-0.5 left-0.5 size-3 rounded-full bg-regolith-50 shadow"
          style={{ transform: checked ? "translateX(12px)" : "none", transition: "transform 160ms var(--ease-spring)", background: checked ? "var(--world-ink)" : undefined }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-regolith-100">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-regolith-400">{hint}</span>}
      </span>
    </label>
  );
}

/* ----------------------------------------------------------------- sections */
export function Section({
  title, count, defaultOpen = true, children, aside,
}: { title: ReactNode; count?: ReactNode; defaultOpen?: boolean; children: ReactNode; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="hair-t">
      <div className="flex items-center">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="row-ctl flex min-w-0 flex-1 items-center gap-2 px-4 py-2.5 text-left">
          <ChevronDown size={14} className="shrink-0 text-regolith-400" style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 160ms var(--ease-out)" }} />
          <span className="truncate text-sm font-semibold text-regolith-50">{title}</span>
          {count !== undefined && <span className="tnum ml-auto text-xs text-regolith-400">{count}</span>}
        </button>
        {aside}
      </div>
      {open && <div id={id}>{children}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------- grades */
export function GradeTile({ grade, size = "md", muted, title }: { grade: Grade | null | undefined; size?: "xs" | "sm" | "md" | "lg" | "xl"; muted?: boolean; title?: string }) {
  const dims = { xs: "size-5 text-[11px] rounded-xs", sm: "size-6 text-xs rounded-xs", md: "size-8 text-base rounded-sm", lg: "size-12 text-2xl rounded-md", xl: "size-[72px] text-[40px] rounded-lg" }[size];
  if (!grade) {
    return (
      <span title={title ?? "No grade: not enough data"} className={cx("inline-grid shrink-0 place-items-center border border-dashed border-[var(--hair-strong)] font-semibold text-regolith-500", dims)}>
        –
      </span>
    );
  }
  return (
    <span
      title={title ?? `${grade}: ${GRADE_MEANING[grade]}`}
      className={cx("inline-grid shrink-0 place-items-center font-semibold leading-none text-basalt-950", dims)}
      style={{ background: GRADE_COLOR[grade], opacity: muted ? 0.45 : 1, boxShadow: size === "xl" || size === "lg" ? `0 0 0 1px rgb(0 0 0 / 0.4), 0 10px 28px -10px ${GRADE_COLOR[grade]}` : undefined }}
    >
      {grade}
    </span>
  );
}

/** Thin bar that shows a 0–1 value without printing the number. */
export function Meter({ value, grade, className }: { value: number | null; grade?: Grade | null; className?: string }) {
  return (
    <span className={cx("relative block h-1 overflow-hidden rounded-full bg-basalt-600", className)} aria-hidden>
      {value !== null && (
        <span className="absolute inset-y-0 left-0 w-full origin-left rounded-full" style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, value))})`, background: grade ? GRADE_COLOR[grade] : "var(--color-regolith-300)", transition: "transform 320ms var(--ease-out)" }} />
      )}
    </span>
  );
}

/* ----------------------------------------------------------------- evidence */
const EVIDENCE_LABEL: Record<Evidence, string> = { observed: "Observed", inferred: "Inferred", modelled: "Modelled", computed: "Computed", interpreted: "Interpreted" };

/** Shape-coded marker so the kind of evidence is readable without colour. */
export function EvidenceGlyph({ kind, size = 11 }: { kind: Evidence; size?: number }) {
  const s = size;
  const c = "currentColor";
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" role="img" aria-label={EVIDENCE_LABEL[kind]} className="shrink-0">
      <title>{EVIDENCE_LABEL[kind]}</title>
      {kind === "observed" && <circle cx="6" cy="6" r="4.2" fill={c} />}
      {kind === "inferred" && (
        <>
          <circle cx="6" cy="6" r="4.2" fill="none" stroke={c} strokeWidth="1.4" />
          <path d="M6 1.8a4.2 4.2 0 0 1 0 8.4z" fill={c} />
        </>
      )}
      {kind === "modelled" && <path d="M6 1.2 10.8 6 6 10.8 1.2 6z" fill="none" stroke={c} strokeWidth="1.4" />}
      {kind === "computed" && <rect x="2" y="2" width="8" height="8" fill="none" stroke={c} strokeWidth="1.4" />}
      {kind === "interpreted" && <path d="M6 1.6 10.6 10H1.4z" fill="none" stroke={c} strokeWidth="1.4" />}
    </svg>
  );
}

export function EvidenceTag({ kind }: { kind: Evidence }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-regolith-300">
      <EvidenceGlyph kind={kind} />
      {EVIDENCE_LABEL[kind]}
    </span>
  );
}

/* --------------------------------------------------------------- feedback */
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-regolith-300" role="status">
      <Loader2 size={15} className="spin" />
      {label}
    </span>
  );
}

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "error"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const bar = tone === "error" ? "var(--color-grade-f)" : tone === "warn" ? "var(--color-grade-d)" : "var(--world)";
  return (
    <div className="rounded-sm bg-basalt-800 px-3 py-2.5 text-sm leading-snug text-regolith-200" style={{ boxShadow: `inset 2px 0 0 ${bar}` }} role={tone === "error" ? "alert" : "note"}>
      {title && <div className="mb-0.5 font-semibold text-regolith-50">{title}</div>}
      {children}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- sheet */
export function Sheet({ title, subtitle, onClose, children }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Tab" && ref.current) {
        const nodes = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea,[tabindex="0"],summary')].filter(el => el.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="anim-fade fixed inset-0 z-50 flex justify-center bg-black/70 p-0 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className="anim-sheet surface flex h-full w-full max-w-[1080px] flex-col rounded-none shadow-[var(--shadow-float)] outline-none sm:rounded-lg">
        <header className="hair-b flex items-start gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[1.75rem] leading-tight font-medium tracking-[-0.03em] text-regolith-50" style={{ fontVariationSettings: '"opsz" 48' }}>
              {title}
            </h2>
            {subtitle && <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-regolith-300">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="scroll min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
