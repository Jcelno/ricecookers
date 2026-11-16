import { GRADE_HEX, GRADE_MEANING } from "@/lib/format";
import type { Grade } from "@/lib/types";

/**
 * RADIUM keeps two scores apart, and each has one icon used wherever it appears:
 *  - site score: how well a place on the Moon or Mars serves a mission (a flag planted on a world);
 *  - twin score: how closely a place on Earth resembles it for one purpose (two linked worlds).
 */
export function SiteScoreIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} role="img" aria-label="Site score">
      <path d="M3.6 16.2a7.4 7.4 0 0 1 12.8 0" />
      <path d="M10 12.4V3.4" />
      <path d="M10 3.6l5 1.9-5 2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function TwinScoreIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} role="img" aria-label="Twin score">
      <circle cx="7.4" cy="10" r="4.9" />
      <circle cx="12.6" cy="10" r="4.9" strokeDasharray="2.2 2" />
    </svg>
  );
}

/** Grade letter on its colour; the score sits beside it when given, so colour is never the only cue. */
export function GradeBadge({ grade, score, size = 13, title }: { grade: Grade | null | undefined; score?: number | null; size?: number; title?: string }) {
  const label = grade ? `Grade ${grade}, ${GRADE_MEANING[grade].toLowerCase()}${score !== null && score !== undefined ? `, score ${score.toFixed(2)}` : ""}` : "Not graded: not enough data";
  return (
    <span className="inline-flex items-center gap-1.5 align-middle" title={title ?? label}>
      <span className="grade-badge" style={{ fontSize: size, background: grade ? GRADE_HEX[grade] : "transparent", color: grade ? "#071019" : "var(--color-regolith-400)", boxShadow: grade ? undefined : "inset 0 0 0 1px var(--hair-strong)" }} aria-label={label}>{grade ?? "–"}</span>
      {score !== undefined && <span className="mono text-regolith-100" style={{ fontSize: size }}>{score === null ? "–" : score.toFixed(2)}</span>}
    </span>
  );
}

/** The plain meaning of a grade, shown once beneath results. */
export const GRADE_HELP = "A = excellent match for this purpose (score 0.80 or higher, RADIUM's own scale). B = good (0.65), C = moderate (0.50), D = poor (0.35), F = very poor.";
