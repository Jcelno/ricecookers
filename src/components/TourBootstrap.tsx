import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { introSeen } from "@/lib/intro";
import { hasPendingLinkRestore } from "@/lib/deeplink";
import type { Body } from "@/lib/types";
import { onTour } from "@/lib/tour/events";
import { useStore } from "@/store";
import { Button, IconButton } from "./ui/primitives";
import { X } from "lucide-react";

const TourProvider = lazy(() => import("@/lib/tour/TourProvider"));
// Capture before live share-link synchronization writes an ordinary browsing hash.
const arrivalHash = location.hash;
const tourFlag = new URLSearchParams(location.search).get("tour");

export function TourBootstrap() {
  const sheet = useStore(s => s.sheet);
  const meta = useStore(s => s.meta);
  const body = useStore(s => s.body);
  const mode = useStore(s => s.mode);
  const pins = useStore(s => s.pins);
  const [frames, setFrames] = useState<ReadonlySet<Body>>(new Set());
  const frame = frames.has(mode === "near" ? "earth" : body);
  const [loaded, setLoaded] = useState(false);
  const [invite, setInvite] = useState(false);
  const handled = useRef(false);
  useEffect(() => onTour(event => {
    if (event.type === "ready:frame") setFrames(old => old.has(event.payload.body) ? old : new Set(old).add(event.payload.body));
  }), []);
  useEffect(() => {
    if (!meta || handled.current || hasPendingLinkRestore()) return;
    const deepLink = arrivalHash.length > 1;
    // Storage failures count as seen, including forced demos: never trap a visitor.
    let storageAvailable = true;
    try { localStorage.getItem("radium.intro.v2"); } catch { storageAvailable = false; }
    if (tourFlag === "0" || !storageAvailable) { handled.current = true; return; }
    // Invitations never obstruct a shared view, including Saved links with no map canvas.
    if (deepLink && tourFlag !== "1") { handled.current = true; setInvite(!introSeen()); return; }
    if (tourFlag === "1" && (mode === "saved" || mode === "compare")) {
      const state = useStore.getState(); state.setMode("explore"); state.setBody("moon");
      return; // A forced welcome needs a real globe behind it before it can open.
    }
    if (!frame) return;
    handled.current = true;
    if (tourFlag === "1" || (!navigator.webdriver && !introSeen())) useStore.getState().setSheet("intro");
  }, [meta, frame, body, mode, pins]);
  useEffect(() => {
    if (sheet === "intro") { setLoaded(true); setInvite(false); }
  }, [sheet]);
  useEffect(() => {
    if (!frame || navigator.webdriver || tourFlag === "0") return;
    // Contextual hints are also lazy: no tour code is in the initial module graph.
    const idle = window.setTimeout(() => setLoaded(true), 1500);
    return () => clearTimeout(idle);
  }, [frame]);
  return <>
    {loaded && <Suspense fallback={null}><TourProvider /></Suspense>}
    {invite && <div className="tour-invitation surface-float" role="status">
      <span>New here? Take the 2-minute tour</span>
      <Button size="sm" variant="outline" onClick={() => useStore.getState().setSheet("intro")}>Start</Button>
      <IconButton label="Dismiss tour invitation" onClick={() => setInvite(false)}><X size={14} /></IconButton>
    </div>}
  </>;
}
