import { Sheet } from "@/components/ui/primitives";
const KEYS = [["/", "Focus search or the target registry"], ["Esc", "Clear and leave search; close a sheet"], ["1 / 2 / 3", "Switch to Moon / Mars / Earth"], ["L", "Show or hide Layers"], ["T", "Find Earth twins of the selected planetary site"], ["S", "Save the selected place"], ["C", "Add the selected place to Compare"], ["?", "Open keyboard shortcuts"], ["Alt + → / ←", "Next / previous tutorial topic"], ["Esc, Esc", "Minimize, then exit the tour"]];
export default function Shortcuts({ onClose }: { onClose: () => void }) {
  return <Sheet title="Keyboard shortcuts" subtitle="Single-key shortcuts pause while you type or use a modal. The same controls are available on screen." onClose={onClose}>
    <dl className="shortcut-list">{KEYS.map(([key, description]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{description}</dd></div>)}</dl>
  </Sheet>;
}
