import { useEffect, useState } from "react";

import { useStore } from "@/store";

/**
 * The data service is one Python function that sleeps when idle and can take several seconds to wake.
 * The page itself never waits for it: this hook only reports, honestly, how long the wait has been.
 *
 *   connecting  under 4 s: nothing worth saying yet
 *   waking      4 to 20 s: "Waking up the data service, usually under 15 seconds"
 *   saved       over 20 s, or the request failed: the saved example is offered, labelled "Saved example"
 *   live        the service answered
 */
export type BootPhase = "connecting" | "waking" | "saved" | "live";
export const WAKE_AFTER_S = 4;
export const SAVED_AFTER_S = 20;

export function useBoot(): { phase: BootPhase; seconds: number } {
  const live = useStore((s) => !!s.meta);
  const failed = useStore((s) => !!s.metaError);
  const bootAt = useStore((s) => s.bootAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (live) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [live]);
  const seconds = Math.max(0, Math.floor((now - bootAt) / 1000));
  const phase: BootPhase = live ? "live" : seconds >= SAVED_AFTER_S ? "saved" : failed || seconds >= WAKE_AFTER_S ? "waking" : "connecting";
  return { phase, seconds };
}

/** Keep asking while the service is down or still waking, so the app comes alive without a reload. */
export function useBootRetry() {
  const failed = useStore((s) => s.metaError);
  const init = useStore((s) => s.init);
  useEffect(() => {
    if (!failed) return;
    const t = window.setTimeout(() => void init(), 4000);
    return () => window.clearTimeout(t);
  }, [failed, init]);
}
