import { cx, EvidenceGlyph, Section, Segmented, Switch } from "@/components/ui/primitives";
import type { Basemap, Evidence, GridLayer, TileLayer } from "@/lib/types";
import { type Overlay, useStore } from "@/store";

const GROUP_LABEL: Record<string, string> = {
  terrain: "Terrain", thermal: "Surface temperature", energy: "Sunlight and energy", comm: "Communication", water: "Water and ice",
  atmos: "Atmosphere and dust", geology: "Composition and geology", surface: "Surface cover",
  elevation: "Terrain", slope: "Terrain", roughness: "Terrain", temperature: "Surface temperature", dust: "Atmosphere and dust",
};
// Simple mode speaks in terms of what the user is deciding, Advanced keeps the scientific category names.
const SIMPLE_NAME: Record<string, string> = {
  Terrain: "Terrain & safety", "Surface temperature": "Temperature", "Sunlight and energy": "Sunlight & power", Communication: "Communications",
  "Water and ice": "Water & resources", "Atmosphere and dust": "Atmosphere & dust", "Composition and geology": "Composition & geology", "Surface cover": "Surface cover",
};
const firstSentence = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();
const GROUP_ORDER = ["Terrain", "Surface temperature", "Sunlight and energy", "Communication", "Water and ice", "Atmosphere and dust", "Composition and geology", "Surface cover"];

function Radio({ on, onClick, title, sub, evidence, tour }: { tour?: string; on: boolean; onClick: () => void; title: string; sub?: string; evidence?: Evidence }) {
  return (
    <button data-tour={tour} type="button" role="radio" aria-checked={on} onClick={onClick} aria-current={on} className="row-ctl flex w-full items-start gap-2.5 px-4 py-1.5 text-left">
      <span className={cx("mt-1 grid size-3.5 shrink-0 place-items-center rounded-full ring-1", on ? "ring-[var(--world)]" : "ring-[var(--hair-strong)]")}>
        {on && <span className="size-2 rounded-full bg-world" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("flex items-center gap-1.5 text-sm", on ? "text-regolith-50" : "text-regolith-200")}>
          <span className="min-w-0 truncate">{title}</span>
          {evidence && <span className="shrink-0 text-regolith-400"><EvidenceGlyph kind={evidence} size={10} /></span>}
        </span>
        {sub && <span className="block text-xs leading-snug text-regolith-400">{sub}</span>}
      </span>
    </button>
  );
}

export function LayersPanel() {
  const meta = useStore((s) => s.meta)!;
  const body = useStore((s) => s.body);
  const st = useStore((s) => s.layers[s.body]);
  const setLayer = useStore((s) => s.setLayer);
  const advanced = useStore((s) => s.advanced);

  const tiles = body === "earth" ? [] : (meta.layers[body].tiles as TileLayer[]);
  const basemaps = body === "earth" ? (meta.layers.earth.tiles as Basemap[]) : [];
  const imagery = tiles.filter((t) => t.group === "imagery");
  const rendered = tiles.filter((t) => t.group !== "imagery");
  const grid = meta.layers[body].grid as GridLayer[];

  const groups = new Map<string, { grid: GridLayer[]; tiles: TileLayer[] }>();
  for (const g of grid) {
    const k = GROUP_LABEL[g.group] ?? g.group;
    if (!groups.has(k)) groups.set(k, { grid: [], tiles: [] });
    groups.get(k)!.grid.push(g);
  }
  for (const t of rendered) {
    const k = advanced ? (GROUP_LABEL[t.group] ?? t.group) : "Scientific datasets";
    if (!groups.has(k)) groups.set(k, { grid: [], tiles: [] });
    groups.get(k)!.tiles.push(t);
  }
  const ordered = [...groups.entries()].sort((a, b) => (GROUP_ORDER.indexOf(a[0]) + 1 || 99) - (GROUP_ORDER.indexOf(b[0]) + 1 || 99));
  const isOn = (o: Overlay, kind: "grid" | "tiles", id: string) => o?.kind === kind && o.id === id;
  const pick = (kind: "grid" | "tiles", id: string) => setLayer(body, { overlay: isOn(st.overlay, kind, id) ? null : { kind, id } });
  const activeGroup = (items: { grid: GridLayer[]; tiles: TileLayer[] }) => items.grid.some((g) => isOn(st.overlay, "grid", g.id)) || items.tiles.some((t) => isOn(st.overlay, "tiles", t.id));

  return (
    <div>
      <header className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-md font-semibold text-regolith-50">Map layers</h2>
          <Segmented size="sm" label="Detail level" value={advanced ? "adv" : "simple"} onChange={(v) => useStore.getState().setAdvanced(v === "adv")}
            options={[{ value: "simple", label: "Simple", title: "Plain-language names and explanations" }, { value: "adv", label: "Advanced", title: "Scientific names, resolutions and every NASA map" }]} />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-regolith-400">
          {body === "earth"
            ? "Satellite view underneath, one data layer on top. Data layers are drawn from the same grids RADIUM analyses."
            : advanced
              ? "Orbital imagery underneath, one data layer on top. Layers marked RADIUM grid are the values used in the analysis; NASA rendered maps are pictures for context."
              : "Pick what to see on the globe. Each layer shows one measurement; switch to Advanced for resolutions and sources."}
        </p>
      </header>

      <Section title="Satellite view" defaultOpen>
        <div role="radiogroup" aria-label="Satellite view" className="pb-2">
          {body === "earth"
            ? basemaps.map((b) => <Radio key={b.id} on={st.base === b.id} onClick={() => setLayer(body, { base: b.id })} title={b.title} sub={b.description} />)
            : imagery.map((t) => <Radio key={t.id} on={st.base === t.id} onClick={() => setLayer(body, { base: t.id })} title={t.title} sub={t.description} />)}
        </div>
      </Section>

      <Section title="Data layer" aside={st.overlay ? (
        <button type="button" onClick={() => setLayer(body, { overlay: null })} className="ctl mr-3 h-6 rounded-sm px-2 text-xs text-regolith-300">Turn off</button>
      ) : undefined}>
        {st.overlay && (
          <div className="px-4 pb-2">
            <label className="flex items-center gap-3 text-xs text-regolith-400">
              <span className="shrink-0">Opacity</span>
              <input
                type="range" min={20} max={100} value={Math.round(st.opacity * 100)} className="slider"
                style={{ ["--fill" as string]: `${((st.opacity * 100 - 20) / 80) * 100}%` }}
                onChange={(e) => setLayer(body, { opacity: Number(e.target.value) / 100 })}
                aria-label="Data layer opacity"
              />
              <span className="tnum w-8 text-right text-regolith-300">{Math.round(st.opacity * 100)}%</span>
            </label>
          </div>
        )}
        <div role="radiogroup" aria-label="Data layer">
          {ordered.map(([name, items]) => (
            <LayerGroup key={`${body}-${name}`} name={advanced ? name : (SIMPLE_NAME[name] ?? name)} open={activeGroup(items) || name === "Terrain"}>
              {items.grid.map((g) => (
                <Radio key={g.id} tour={g.id.includes("slope") ? "slope-layer" : `layer-${g.id}`} on={isOn(st.overlay, "grid", g.id)} onClick={() => pick("grid", g.id)} title={g.title} evidence={advanced ? g.evidence : undefined}
                  sub={advanced ? `RADIUM grid, ${g.res}${g.polar_only ? ". Polar squares only" : ""}` : `${firstSentence(g.description)}${g.polar_only ? " Near the poles only." : ""}`} />
              ))}
              {items.tiles.map((t) => (
                <Radio key={t.id} on={isOn(st.overlay, "tiles", t.id)} onClick={() => pick("tiles", t.id)} title={t.title}
                  sub={advanced ? `NASA rendered map, ${t.provider}` : "A NASA map picture for context; RADIUM reads no values from it."} />
              ))}
            </LayerGroup>
          ))}
        </div>
      </Section>

      <Section title="Pins and labels">
        <div className="px-2 pb-3">
          {body === "earth" ? (
            <>
              <Switch checked={st.pins.analog} onChange={(v) => setLayer(body, { pins: { ...st.pins, analog: v } })} label="Documented analog sites"
                hint="Places already used as Moon or Mars analogs in published work. Shown for reference; they never affect a grade." />
              <><Switch checked={st.labels} onChange={(v) => setLayer(body, { labels: v })} label="Place names" hint="Place names from OpenStreetMap." /><Switch checked={st.boundaries} onChange={(v) => setLayer(body, { boundaries: v })} label="Country boundaries" hint="Administrative boundaries from OpenStreetMap; shown independently of place names." /></>
            </>
          ) : (
            <>
              <Switch checked={st.pins.landing} onChange={(v) => setLayer(body, { pins: { ...st.pins, landing: v } })} label="Landing sites" hint="Where spacecraft have touched down." />
              <Switch checked={st.pins.feature} onChange={(v) => setLayer(body, { pins: { ...st.pins, feature: v } })} label="Named features"
                hint="A short list of craters, plains and mountains that matter for exploration, at their IAU positions." />
            </>
          )}
        </div>
      </Section>
    </div>
  );
}

function LayerGroup({ name, open, children }: { name: string; open: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group border-t border-[var(--hair)] first:border-t-0">
      <summary className="row-ctl flex cursor-pointer list-none items-center gap-2 px-4 py-1.5 text-xs font-medium text-regolith-300 [&::-webkit-details-marker]:hidden">
        <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0 text-regolith-500 group-open:rotate-90" style={{ transition: "transform 140ms var(--ease-out)" }} aria-hidden>
          <path d="M2 1l4 3-4 3z" fill="currentColor" />
        </svg>
        {name}
      </summary>
      <div className="pb-1.5">{children}</div>
    </details>
  );
}
