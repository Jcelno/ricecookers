import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { introSeen } from "@/lib/intro";
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
  const [frame, setFrame] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [invite, setInvite] = useState(false);
  const handled = useRef(false);
  useEffect(() => onTour(event => {
    if (event.type === "ready:frame") setFrame(true);
  }), []);
  useEffect(() => {
    if (!meta || handled.current) return;
    const deepLink = arrivalHash.length > 1;
    if (!frame && !deepLink) return;
    handled.current = true;
    // Storage failures count as seen, including forced demos: never trap a visitor.
    let storageAvailable = true;
    try { localStorage.getItem("radium.intro.v2"); } catch { storageAvailable = false; }
    if (tourFlag === "0" || !storageAvailable) return;
    if (deepLink && tourFlag !== "1") { setInvite(!introSeen()); return; }
    if (tourFlag === "1" || (!navigator.webdriver && !introSeen())) useStore.getState().setSheet("intro");
  }, [meta, frame]);
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
