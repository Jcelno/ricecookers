import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { formatCoord } from "@/lib/format";
import { setPreference, usePreference } from "@/lib/preferences";
import { useStore } from "@/store";
import { IconButton } from "./ui/primitives";

export const TELEMETRY_KEY = "radium.telemetry.v1";
function UTCClock() {
  const [time, setTime] = useState(() => new Date().toISOString().slice(11, 19));
  useEffect(() => { const timer = setInterval(() => setTime(new Date().toISOString().slice(11, 19)), 1000); return () => clearInterval(timer); }, []);
  return <time aria-live="off" title="Computed from this device's clock">UTC {time}</time>;
}
export function MissionStatus() {
  const shown = usePreference(TELEMETRY_KEY, false);
  const meta = useStore(s => s.meta);
  const body = useStore(s => s.body);
  const missionId = useStore(s => s.missionId);
  const selection = useStore(s => s.selection);
  const pins = useStore(s => s.pins);
  const cell = useStore(s => s.cell);
  const error = useStore(s => s.metaError);
  if (!shown || !meta) return null;
  const mission = meta.missions.find(m => m.id === missionId && m.body === body) ?? meta.missions.find(m => m.body === body);
  const grid = meta.bodies[body].cell_note.match(/(\d+(?:\.\d+)?)°/)?.[0];
  const polar = meta.bodies[body].cell_note.match(/(\d+(?:\.\d+)?) km cells/)?.[1];
  const selected = selection && pins[selection.body].find(p => Math.abs(p.lat - selection.lat) < .0001 && Math.abs(p.lon - selection.lon) < .0001);
  return <div className="mission-status" aria-label="Mission status">
    <span title="Current RADIUM objective and research registry">Objective: <strong>{mission?.label ?? "Earth analog research"}</strong> · {Object.values(pins).reduce((n, list) => n + list.length, 0)} sites</span>
    <span title={meta.bodies[body].cell_note}>Grid: {meta.bodies[body].name} {grid ?? "see source"}{polar ? ` / polar ${polar} km` : ""}</span>
    <span className={error ? "text-alert" : "text-grade-b"}>API: {error ? "○ offline example" : "● live"}</span>
    <span className="mission-status-selection" aria-live="polite" aria-atomic="true">Selection: {selection ? `${selected?.name ?? cell?.place.label ?? "Analysis point"}, ${formatCoord(selection.lat, selection.lon)}` : "Choose a place"}</span>
    <UTCClock />
    <IconButton label="Hide mission status" onClick={() => setPreference(TELEMETRY_KEY, false)} className="!size-6"><X size={12} /></IconButton>
  </div>;
}
