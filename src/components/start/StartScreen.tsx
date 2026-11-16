import { ArrowRight, CircleHelp, Play } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { GradeBadge, SiteScoreIcon, TwinScoreIcon } from "@/components/ui/ScoreIcons";
import { useBoot } from "@/lib/boot";
import { count, featuredToday, findings, score2, shortPlace, type Study } from "@/lib/findings";
import { formatCoord } from "@/lib/format";
import { useStore, type Intent } from "@/store";

import { type LatLon, type World, WorldOrb } from "./WorldOrb";
import "./start.css";

type CardId = "moon" | "mars" | "near" | "rank";
type End = World | `${World}-edge`;
interface Scene {
  view: Record<World, LatLon>;
  marker: Record<World, LatLon | null>;
  caption: Record<World, { name: string; coords: string } | null>;
  links: [End, End][];
  dim: World[];
}

/** Centre the disc so a marked place sits toward `bias` degrees of longitude from the middle (negative = left). */
function lookAt(p: LatLon, bias = 0): LatLon {
  if (Math.abs(p.lat) > 70) return { lat: Math.sign(p.lat) * 54, lon: p.lon };
  return { lat: Math.max(-46, Math.min(46, p.lat * 0.6)), lon: p.lon - bias };
}
const REST: Record<World, LatLon> = { moon: { lat: 6, lon: 8 }, mars: { lat: 4, lon: -62 }, earth: { lat: 18, lon: 20 } };

function twinScene(s: Study): Scene {
  const target: LatLon = { lat: s.lat, lon: s.lon }, top = s.top[0], twin: LatLon = { lat: top.lat, lon: top.lon };
  // The Moon sits left of Earth and Mars right of it, so each marker faces its partner.
  const left = s.body === "moon";
  return {
    view: { ...REST, [s.body]: lookAt(target, left ? 26 : -26), earth: lookAt(twin, left ? -26 : 26) },
    marker: { moon: null, mars: null, earth: twin, [s.body]: target } as Scene["marker"],
    caption: { moon: null, mars: null, [s.body]: { name: s.name, coords: s.coords }, earth: { name: top.name, coords: top.coords } } as Scene["caption"],
    links: [[s.body, "earth"]],
    dim: [],
  };
}
function scenes(): Record<CardId, Scene> {
  const { near, rank } = findings.cards, home: LatLon = { lat: near.from.lat, lon: near.from.lon };
  const moonTop = rank.top[0], marsTop = findings.missions.mars_robotic.top[0];
  return {
    moon: twinScene(findings.cards.moon),
    mars: twinScene(findings.cards.mars),
    near: {
      view: { ...REST, earth: lookAt(home) }, marker: { moon: null, mars: null, earth: home },
      caption: { moon: null, mars: null, earth: { name: shortPlace(near.from.label), coords: formatCoord(home.lat, home.lon) } },
      links: [["earth", "moon-edge"], ["earth", "mars-edge"]], dim: [],
    },
    rank: {
      view: { ...REST, moon: lookAt(moonTop), mars: lookAt(marsTop, -20) }, marker: { moon: moonTop, mars: marsTop, earth: null },
      caption: { moon: { name: moonTop.place, coords: moonTop.coords }, mars: { name: marsTop.place, coords: marsTop.coords }, earth: null },
      links: [], dim: ["earth"],
    },
  };
}

const WORLD_NAME: Record<World, string> = { moon: "Moon", mars: "Mars", earth: "Earth" };

function Arrow() {
  return (
    <span className="q-arrow" aria-hidden>
      <svg width="34" height="10" viewBox="0 0 34 10"><path d="M1 5h26" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 4" strokeLinecap="round" /><path d="M27 1.5 32.5 5 27 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}
const Disc = ({ world }: { world: World }) => <span className={`world-disc ${world}`} role="img" aria-label={WORLD_NAME[world]} />;

interface Card { id: CardId; worlds: React.ReactNode; route: string; question: string; intent: Intent; example: React.ReactNode; detail: string }

function cards(): Card[] {
  const { moon, mars, near, rank } = findings.cards;
  const twin = (s: Study) => (
    <>
      <span className="q-pair"><span className="placename">{s.name}</span><Arrow /><span className="placename" title={s.top[0].name}>{shortPlace(s.top[0].name)}</span></span>
      <GradeBadge grade={s.top[0].grade} score={s.top[0].score} />
    </>
  );
  return [
    {
      id: "moon", route: "Moon to Earth", question: "Where on Earth is most like the Moon?", intent: { kind: "twin", body: "moon" },
      worlds: <><Disc world="moon" /><Arrow /><Disc world="earth" /></>, example: twin(moon),
      detail: `For ${moon.purpose_label.toLowerCase()}. ${count(moon.grades.A)} of ${count(moon.cells)} places on Earth earn an A.`,
    },
    {
      id: "mars", route: "Mars to Earth", question: "Where on Earth is most like Mars?", intent: { kind: "twin", body: "mars" },
      worlds: <><Disc world="mars" /><Arrow /><Disc world="earth" /></>, example: twin(mars),
      detail: `For ${mars.purpose_label.toLowerCase()}. Scores above all ${mars.documented_scored} documented analog sites.`,
    },
    {
      id: "near", route: "Earth to Moon or Mars", question: "What can a place near me stand in for?", intent: { kind: "near" },
      worlds: <><Disc world="earth" /><Arrow /><span className="q-stack"><Disc world="moon" /><Disc world="mars" /></span></>,
      example: <>
        <span className="q-pair"><span className="placename">{shortPlace(near.from.label)}</span><Arrow /><span className="placename">{near.nearest[0].name}</span></span>
        <span className="mono q-num">{Math.round(near.nearest[0].distance_km)} km</span>
      </>,
      detail: `Studied for ${near.nearest[0].theme.toLowerCase()}. ${near.in_radius} documented sites lie within ${count(Math.round(near.radius_km))} km.`,
    },
    {
      id: "rank", route: "Moon or Mars", question: "Where should we land or build?", intent: { kind: "rank" },
      worlds: <><span className="q-stack"><Disc world="moon" /><Disc world="mars" /></span></>,
      example: <>
        <span className="q-pair"><span>{rank.label}</span></span>
        <span className="q-inline"><GradeBadge grade="A" /><span className="mono q-num">{count(rank.grades.A)} of {count(rank.cells)}</span></span>
      </>,
      detail: `Only ${count(rank.grades.A)} place on the Moon earns an A: ${rank.top[0].place}, ${rank.top[0].coords.split(",")[0]}.`,
    },
  ];
}

export function StartScreen() {
  const enter = useStore((s) => s.enter);
  const setSheet = useStore((s) => s.setSheet);
  const boot = useBoot();
  const featured = useMemo(() => featuredToday(), []);
  const all = useMemo(scenes, []);
  const list = useMemo(cards, []);
  const [active, setActive] = useState<CardId | null>(null);
  const scene = active ? all[active] : twinScene(featured);

  // Transfer lines run from marked place to marked place. Orbs report marker positions as they turn;
  // paths are written straight to the DOM so nothing re-renders per frame.
  const hero = useRef<HTMLDivElement>(null);
  const orbs = useRef<Record<World, HTMLDivElement | null>>({ moon: null, mars: null, earth: null });
  const marks = useRef<Record<World, { x: number; y: number } | null>>({ moon: null, mars: null, earth: null });
  const paths = useRef<(SVGPathElement | null)[]>([null, null]);
  const linksRef = useRef(scene.links);
  linksRef.current = scene.links;
  const redraw = useCallback(() => {
    const box = hero.current?.getBoundingClientRect();
    if (!box) return;
    const rect = (w: World) => orbs.current[w]?.getBoundingClientRect();
    const point = (end: End, toward: World): { x: number; y: number } | null => {
      const [w, edge] = end.split("-") as [World, string | undefined];
      const r = rect(w);
      if (!r) return null;
      if (edge) {
        const o = rect(toward);
        if (!o) return null;
        const side = o.left + o.width / 2 < r.left + r.width / 2 ? -1 : 1;
        return { x: r.left - box.left + r.width / 2 + side * r.width * 0.42, y: r.top - box.top + r.height * 0.42 };
      }
      const m = marks.current[w];
      return m ? { x: r.left - box.left + m.x, y: r.top - box.top + m.y } : null;
    };
    paths.current.forEach((el, k) => {
      if (!el) return;
      const link = linksRef.current[k];
      const a = link && point(link[0], link[1].split("-")[0] as World), b = link && point(link[1], link[0].split("-")[0] as World);
      if (!a || !b) { el.style.opacity = "0"; return; }
      const lift = Math.min(54, Math.hypot(b.x - a.x, b.y - a.y) * 0.2);
      const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - lift;
      // Leave a gap at each end so the line meets the markers' rings, not their centres.
      const trim = (p: { x: number; y: number }, gap: number) => { const d = Math.hypot(cx - p.x, cy - p.y) || 1; return { x: p.x + ((cx - p.x) / d) * gap, y: p.y + ((cy - p.y) / d) * gap }; };
      const s = trim(a, 11), e = trim(b, 13);
      el.setAttribute("d", `M${s.x.toFixed(1)} ${s.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`);
      el.style.opacity = "1";
    });
  }, []);
  const report = useCallback((w: World) => (p: { x: number; y: number } | null) => { marks.current[w] = p; redraw(); }, [redraw]);
  const reporters = useMemo(() => ({ moon: report("moon"), mars: report("mars"), earth: report("earth") }), [report]);
  useLayoutEffect(redraw, [redraw, active]);
  useEffect(() => {
    const ro = new ResizeObserver(redraw);
    if (hero.current) ro.observe(hero.current);
    return () => ro.disconnect();
  }, [redraw]);

  const top = featured.top[0];
  return (
    <div className="start" data-start-screen>
      <div className="grid-bg" aria-hidden />
      <div className="glow" aria-hidden />
      <div className="start-inner">
        <header className="start-top">
          <span className="start-brand"><img src="/radium.svg" alt="" width="26" height="26" /><strong>RADIUM</strong></span>
          <span className="start-status mono" role="status" data-boot={boot.phase}>
            <i aria-hidden />
            {boot.phase === "live" ? "Data service live" : boot.phase === "waking" ? `Waking up the data service, usually under 15 seconds · ${boot.seconds} s` : boot.phase === "saved" ? "Data service not answering · saved results shown" : "Connecting to the data service"}
          </span>
          <span className="start-top-actions">
            <button type="button" className="start-link ctl" onClick={() => setSheet("findings")}>Findings</button>
            <button type="button" className="start-link ctl" onClick={() => setSheet("help")}><CircleHelp size={15} aria-hidden />Help</button>
          </span>
        </header>

        <div className="start-hero" ref={hero} aria-label="The Moon, Earth and Mars, with today's finding marked">
          <svg className="start-links" aria-hidden key={active ?? "featured"}>
            <defs>
              <marker id="tip" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1.5 1.5 8.5 5l-7 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></marker>
              <clipPath id="reveal"><rect className="start-reveal" x="0" y="0" width="100%" height="100%" /></clipPath>
            </defs>
            <g clipPath="url(#reveal)">
              {[0, 1].map((k) => <path key={k} ref={(el) => { paths.current[k] = el; }} markerEnd="url(#tip)" style={{ opacity: 0 }} />)}
            </g>
          </svg>
          {(["moon", "earth", "mars"] as World[]).map((w) => (
            <figure key={w} className={`start-world start-world-${w}`} data-dim={scene.dim.includes(w)}>
              <div ref={(el) => { orbs.current[w] = el; }} className="start-orb-wrap">
                <WorldOrb world={w} view={scene.view[w]} marker={scene.marker[w]} spin={!scene.marker[w]} onMarker={reporters[w]} label={`${WORLD_NAME[w]}, from ${w === "moon" ? "the LRO WAC mosaic" : w === "mars" ? "the Viking colour mosaic" : "NASA Blue Marble"}`} />
              </div>
              <figcaption>
                <span className="eyebrow">{WORLD_NAME[w]}</span>
                {scene.caption[w] && <span className="start-cap" key={scene.caption[w]!.name}><span className="placename">{shortPlace(scene.caption[w]!.name)}</span><span className="mono">{scene.caption[w]!.coords}</span></span>}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="start-head">
          <h1>What do you want to find out?</h1>
          <p>RADIUM compares places on the Moon and Mars with {count(findings.counts.earth_cells)} places on Earth, using {findings.counts.sources} open NASA and partner data sources.</p>
        </div>

        <div className="start-cards" role="list">
          {list.map((c, i) => (
            <button key={c.id} type="button" role="listitem" className="q-card" data-start-card={c.id} style={{ "--i": i } as React.CSSProperties}
              onMouseEnter={() => setActive(c.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(c.id)} onBlur={() => setActive(null)}
              onClick={() => enter(c.intent)}>
              <span className="q-worlds">{c.worlds}<span className="eyebrow q-route">{c.route}</span></span>
              <span className="q-question">{c.question}</span>
              <span className="q-example">
                <span className="eyebrow">Example</span>
                <span className="q-result">{c.example}</span>
                <span className="q-detail">{c.detail}</span>
              </span>
              <span className="q-go" aria-hidden><ArrowRight size={16} /></span>
            </button>
          ))}
        </div>

        <div className="start-actions">
          <button type="button" className="start-demo ctl" data-start-demo onClick={() => enter({ kind: "demo" })}><Play size={14} aria-hidden />Watch a 20-second example</button>
          <button type="button" className="start-skip ctl" data-start-skip onClick={() => enter({ kind: "explore" })}>Skip and explore the globes</button>
          <button type="button" className="start-today ctl" data-start-featured onClick={() => enter({ kind: "link", hash: featured.link })} title="Open this result">
            <span className="eyebrow">Finding of the day</span>
            <span className="start-today-line"><span className="placename">{featured.name}</span><Arrow /><span className="placename">{shortPlace(top.name)}</span><GradeBadge grade={top.grade} score={top.score} /></span>
            <span className="start-today-sub">{featured.purpose_label}</span>
          </button>
        </div>

        <footer className="start-foot">
          <div className="start-scores" aria-label="RADIUM gives two separate scores">
            <span className="eyebrow">Two scores, never merged</span>
            <span className="start-score"><SiteScoreIcon size={18} /><span><strong>Site score</strong> How good is this place on the Moon or Mars for a mission?</span></span>
            <span className="start-score"><TwinScoreIcon size={18} /><span><strong>Twin score</strong> Where on Earth is most like it, and for what?</span></span>
          </div>
          <p className="start-fine mono">Computed {findings.generated_date} from the live model · open source · built for the NASA Space Apps Challenge 2026, not a NASA product</p>
        </footer>
      </div>
    </div>
  );
}

export { score2 };
