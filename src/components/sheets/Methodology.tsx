import { useEffect, useState } from "react";

import { Button, EvidenceGlyph, GradeTile, Notice, Sheet, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { pct } from "@/lib/format";
import type { Evidence, Grade } from "@/lib/types";
import { useStore } from "@/store";

type M = Record<string, any>;

const n0 = (x: number | undefined, d = 0) => (x === undefined || x === null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));

function Table({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="scroll my-3 overflow-x-auto rounded-md ring-1 ring-[var(--hair)]">
      <table className="w-full text-xs leading-relaxed">
        <thead>
          <tr className="bg-basalt-800 text-left text-regolith-300">
            {head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--hair)] align-top">
              {r.map((c, j) => <td key={j} className={j === 0 ? "px-3 py-2 font-medium text-regolith-100" : "px-3 py-2 text-regolith-300"}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Methodology({ onClose }: { onClose: () => void }) {
  const meta = useStore((s) => s.meta)!;
  const [level, setLevel] = useState<"simple" | "intermediate" | "advanced">("simple");
  const [m, setM] = useState<M | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.methodology().then(setM).catch((e) => setError(e.message));
  }, []);

  const v = m?.validation ?? {};
  const suit = m?.suitability;
  const sim = m?.similarity;

  return (
    <Sheet
      title="Methodology"
      subtitle="How RADIUM turns public data into grades, what each grade means, and the checks the numbers have passed. Tables on this page are read from the running code."
      onClose={onClose}
    >
      <div className="px-6 py-5">
        <nav aria-label="Methodology detail level" className="mb-5 flex flex-wrap gap-2">
          {(["simple", "intermediate", "advanced"] as const).map(l => <Button key={l} variant={level === l ? "solid" : "outline"} aria-pressed={level === l} onClick={() => setLevel(l)}>{l[0].toUpperCase() + l.slice(1)}</Button>)}
        </nav>
        {level !== "advanced" && <div className="prose-radium">
          <h3 style={{ marginTop: 0 }}>From public data to a research decision</h3>
          <p>RADIUM was built for the NASA Space Apps Challenge. Choose a place, inspect the available evidence, and ask one of two questions: <strong>How well does this region suit my mission?</strong> or <strong>Which Earth environments help test a particular part of it?</strong> These are different models, with separate grades.</p>
          <div className="my-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--hair)] bg-basalt-800/50 p-4"><strong>Mission suitability</strong><p className="!mb-0">Measurements become criterion scores. Your priorities set their relative importance. Hard limits exclude unsuitable cells; a successful historical mission does not change the formula.</p></div>
            <div className="rounded-lg border border-[var(--hair)] bg-basalt-800/50 p-4"><strong>Analog similarity</strong><p className="!mb-0">A purpose such as rover mobility weights comparable dimensions. A site studied as an analog is not automatically similar to your target. The research record and calculated similarity remain separate.</p></div>
          </div>
          <h3>Understand the map at a glance</h3>
          <p>Colored letters are actual model grades: A excellent, B good, C moderate, D poor, F very poor. Neutral circles are unscored places or insufficient data. Double-ring circles with numbers count clustered sites. A verified location describes the source evidence; it is not a NASA rating.</p>
          <div className="my-3 flex flex-wrap gap-3">{(["A", "B", "C", "D", "F"] as Grade[]).map(g => <GradeTile key={g} grade={g}/>)}</div>
          <h3>A map click represents an area</h3>
          <p>Analysis cells are about 15 km on the Moon, 30 km on Mars and 28 km on Earth at the equator, with separate 2.4 km lunar polar cells. A precise site coordinate sits within a cell. Source measurements can be coarser than the cell, so zooming does not improve their scientific resolution.</p>
          <h3>Unknown is never zero</h3>
          <p>Missing criteria are excluded from the weighted calculation and the available coverage is reported. Below the model's coverage threshold, no grade is assigned. A high grade with partial coverage must be read alongside the unknowns. Regional averages cannot certify a landing ellipse.</p>
          <h3>Earth has limits as an analog</h3>
          <p>Earth cannot reproduce lunar or Martian gravity, atmospheric pressure or radiation. Lunar temperatures are also excluded from similarity. Geology or rover tests may still be useful, provided the experiment accounts for those differences.</p>
          {level === "intermediate" && <>
            <h3>Read the model and the evidence together</h3>
            <p>Both models use a weighted mean over available criteria: <code>score = Σ(w × criterion score) / Σ(available weights)</code>. Weights are normalized. Suitability hard limits can reject a cell independently of its score; similarity compares only dimensions that are physically meaningful for the chosen purpose.</p>
            {m && <Table head={["Model", "Minimum weighted coverage", "How priorities are chosen"]} rows={[["Mission suitability", pct(suit.min_coverage), "Mission defaults and user-adjusted sliders"], ["Analog similarity", pct(sim.min_coverage), "Research purpose and user-adjusted dimensions"]]}/>}
            <p>Grade boundaries are A ≥ 0.80, B ≥ 0.65, C ≥ 0.50, D ≥ 0.35 and F below 0.35. A grade describes the model and settings shown, not universal quality. Changing a purpose, weight or hard limit can change it.</p>
            <h3>Five kinds of evidence</h3>
            <ul>{Object.entries(meta.evidence).map(([id, e]) => <li key={id}><strong>{e.label}:</strong> {e.desc}</li>)}</ul>
            <h3>Resolution and uncertainty</h3>
            <p>Terrain comparisons use a common kilometre baseline across worlds. Coarser chemistry, lithology and climate fields remain coarse even when repeated over smaller analysis cells. Mars climate represents a typical model year, excluding global dust storms. A source uncertainty, when available, is different from model uncertainty or unresolved local variation.</p>
            <h3>Distance and documentation do not change similarity</h3>
            <p>Near Me reports great-circle distance separately from similarity. The curated registry supports names, coordinates, historical context and documented research purposes. It never awards a scoring bonus. Review-needed records remain distinguishable from verified evidence.</p>
          </>}
          <p><Button variant="outline" onClick={() => setLevel(level === "simple" ? "intermediate" : "advanced")}>{level === "simple" ? "See model details and uncertainty" : "Inspect formulas, weights and validation tables"}</Button></p>
        </div>}
        {error && <Notice tone="error" title="The methodology tables could not be loaded">{error}</Notice>}
        {!m && !error && <Spinner label="Loading" />}
        {m && level === "advanced" && (
          <div className="prose-radium">
            <h3 style={{ marginTop: 0 }}>Two questions, two models</h3>
            <p>
              RADIUM answers two different questions and never blends them. <strong>Site suitability</strong> asks how well a Moon or Mars location serves a mission you define.{" "}
              <strong>Earth analog similarity</strong> asks which places on Earth share the characteristics of a planetary location that matter for research and testing. A superb analog need not look like a good landing site, so each question has its own
              inputs, its own formula and its own grade.
            </p>

            <h3>The grid</h3>
            <p>
              Each world is divided into analysis cells of similar size: 0.5° on the Moon (about 15 km), 0.5° on Mars (about 30 km) and 0.25° on Earth (about 28 km). Within 305 km of each lunar pole a separate grid of 2.4 km cells is used, because
              latitude–longitude cells shrink to slivers there and because sunlight and cold traps vary over a few kilometres. Clicking the map returns the values of the cell under the pointer, never an interpolated point value.
            </p>
            <Table
              head={["Grid", "Cells analysed", "Cell size"]}
              rows={Object.entries(m.grids as Record<string, any>).map(([k, g]) => [
                { moon: "Moon, global", moon_sp: "Moon, south polar", moon_np: "Moon, north polar", mars: "Mars", earth: "Earth, land" }[k] ?? k,
                n0(g.cells),
                `${g.cell_km} km`,
              ])}
            />

            <h3>Kinds of evidence</h3>
            <p>Every value carries one of five markers so that a measurement is never confused with a model or with RADIUM's own arithmetic.</p>
            <ul className="!list-none !pl-0">
              {(Object.entries(meta.evidence) as [Evidence, { label: string; desc: string }][]).map(([k, e]) => (
                <li key={k} className="flex items-baseline gap-2">
                  <span className="self-center text-regolith-200"><EvidenceGlyph kind={k} size={12} /></span>
                  <span><strong>{e.label}.</strong> {e.desc}</span>
                </li>
              ))}
            </ul>
            <p>
              When a dataset has no value for a cell the interface says “Data unavailable”. Nothing is filled in. A coarse product is repeated across the cells it covers and keeps its native resolution on its label; it is never sharpened by
              interpolation, with one exception stated below for smooth climate-model fields.
            </p>

            <h3>Terrain, measured the same way on three worlds</h3>
            <p>
              Slope and roughness are computed by RADIUM from the LOLA, MOLA and ETOPO elevation grids, all resampled by their producers to about 1.9 km pixels. Slope uses central differences on the sphere across a baseline of two pixels (about 3.7 km).
              The east–west step is widened with latitude so the baseline stays the same length everywhere. Roughness is the inter-quartile range of height after the local tilt is removed. Each cell reports the median slope, the 90th-percentile slope and
              the roughness of its pixels. Because the method and baseline are identical, terrain is the one dimension that is directly comparable between worlds.
            </p>
            <p>These are regional slopes. A lander meets steeper ground at the scale of metres, which no global dataset resolves.</p>

            <h3>Site suitability</h3>
            <p>
              A weighted multi-criteria model: <code>score = Σ wᵢ·sᵢ / Σ wᵢ</code>, summed over the criteria that have data. Each criterion converts measurements to a suitability between 0 and 1 with a stated rule, almost always a straight ramp between
              two values. Weights come from the mission and can be changed with the sliders; they are rescaled to add up to 100%.
            </p>
            {suit && (
              <>
                <Table
                  head={["Criterion", "Question", "Rule", "Limit of this criterion"]}
                  rows={Object.values(suit.criteria as Record<string, any>).map((c: any) => [c.label, c.question, c.rule, c.caveat])}
                />
                <h4>Mission weights</h4>
                <Table
                  head={["Mission", "Default weights"]}
                  rows={Object.values(suit.missions as Record<string, any>).map((mi: any) => [
                    mi.label,
                    Object.entries(mi.weights as Record<string, number>).map(([cid, w]) => `${suit.criteria[cid].label} ${pct(w)}`).join(", "),
                  ])}
                />
                <h4>Hard limits</h4>
                <p>A limit rules a cell out regardless of its score. Limits are screening values chosen by RADIUM with the reasons below. They are not agency requirements, and each can be switched off.</p>
                <Table head={["Limit", "Rule", "Reason"]} rows={Object.values(suit.limits as Record<string, any>).map((l: any) => [l.label, l.rule, l.why])} />
                <h4>Missing data</h4>
                <p>
                  A criterion with no data in a cell is left out and the remaining weights are rescaled. The panel reports what share of the weight was actually scored. Below {pct(suit.min_coverage)} no grade is given.
                </p>
              </>
            )}

            <h3>Grades</h3>
            <p>Both models report a letter. The edges are fixed, the same for both, and apply to the 0–1 score. Grades are RADIUM's own scale for comparing options. They are not a NASA rating or a certification of any site.</p>
            <div className="my-3 flex flex-wrap gap-2">
              {(m.grade_edges as { grade: Grade; min: number; meaning: string }[]).map((g) => (
                <div key={g.grade} className="flex items-center gap-2 rounded-md bg-basalt-800 px-3 py-2 ring-1 ring-[var(--hair)]">
                  <GradeTile grade={g.grade} />
                  <span className="text-xs leading-tight text-regolith-200">
                    {g.meaning}
                    <span className="block text-regolith-500">{g.min > 0 ? `score ${g.min.toFixed(2)} or higher` : "below 0.35"}</span>
                  </span>
                </div>
              ))}
            </div>

            <h3>Earth analog similarity</h3>
            <p>
              For one planetary cell and every Earth land cell, each dimension below yields a similarity between 0 and 1. The overall match is their weighted mean over the dimensions that have data on both sides. Weights depend on the purpose you choose,
              because a site can be an excellent analog for rover mobility and a poor one for ice drilling.
            </p>
            {sim && (
              <>
                <Table head={["Dimension", "Status", "How it is compared"]} rows={Object.values(sim.dimensions as Record<string, any>).map((d: any) => [d.label, d.comparable, d.how])} />
                <h4>Weights by purpose</h4>
                {Object.entries(sim.purposes as Record<string, Record<string, any>>).map(([body, ps]) => (
                  <Table
                    key={body}
                    head={[body === "moon" ? "Moon sites" : "Mars sites", "Weights"]}
                    rows={Object.values(ps).map((p: any) => {
                      const total = Object.values(p.weights as Record<string, number>).reduce((a, b) => a + b, 0);
                      return [p.label, Object.entries(p.weights as Record<string, number>).map(([d, w]) => `${sim.dimensions[d].label} ${pct(w / total)}`).join(", ")];
                    })}
                  />
                ))}
                <h4>Rock type affinity</h4>
                <p>
                  Planetary chemistry comes from orbital gamma-ray spectrometers; Earth rock type comes from a global lithology map. They are joined by the table below, which is RADIUM's expert judgement and is labelled as such wherever it is used. For
                  the Moon, iron oxide sets a mix between the mare and highland columns (6 wt% and below is all highland, 16 wt% and above all mare).
                </p>
                <Table
                  head={["Earth rock class", "Lunar mare", "Lunar highland", "Mars"]}
                  rows={Object.entries(sim.affinity.classes as Record<string, string>)
                    .filter(([code]) => !["wb", "nd"].includes(code))
                    .sort((a, b) => (sim.affinity.mars[b[0]] ?? 0) - (sim.affinity.mars[a[0]] ?? 0))
                    .map(([code, name]) => [name, n0(sim.affinity.mare[code], 2), n0(sim.affinity.highland[code], 2), n0(sim.affinity.mars[code], 2)])}
                />
                <p>{sim.affinity.notes.mare}</p>
                <p>{sim.affinity.notes.highland}</p>
                <p>{sim.affinity.notes.mars}</p>
                <h4>What is never scored</h4>
                <p>
                  Gravity, atmospheric pressure, radiation and, for the Moon, temperature. No place on Earth reproduces them, so giving them a similarity score would mislead. They appear in every comparison under “Where the analogy breaks down”, with the
                  numbers for both places.
                </p>
                <h4>Discovery and the reference list</h4>
                <p>
                  Matches are ranked from data alone across all {n0(m.grids.earth.cells)} Earth land cells. A separate list of {m.reference_sites} analog sites documented in published work is used for two things only: to label a match as near a known
                  site or not, and to show how those known sites score. It never changes a grade. Listed matches are kept at least {sim.separation_km} km apart so the list shows different regions.
                </p>
                <p>Earth cells with data for less than {pct(sim.min_coverage)} of the weighted comparison are not ranked.</p>
              </>
            )}

            <h3>Planning tools built on the two scores</h3>
            <p>
              Site suitability, analog similarity and distance on Earth are three different quantities. RADIUM shows them side by side and never
              averages them into one number.
            </p>
            <ul>
              <li><strong>Near Me, by distance</strong> sorts the documented analog sites by great-circle distance on Earth's surface. Being close says
                nothing about how good an analog a site is, or about roads, borders, permits or access.</li>
              <li><strong>Near Me, by similarity</strong> needs a Moon or Mars target. It ranks Earth land cells and documented sites inside the radius by
                the same Earth Twin score shown everywhere else; distance is plotted beside it but never enters the grade. Your location is sent only with
                the request, is not stored, and is never put in share links.</li>
              <li><strong>Analog atlas</strong> colours documented sites by grade or by environment and study theme. Those tags come from each site's
                published study theme by fixed keyword rules; they are descriptions, not measurements, and never affect a score.</li>
              <li><strong>Research Test Brief</strong> is an experiment proposal. Its matches, mismatches and unscored differences come from the comparison
                with their datasets; its protocol is a fixed template for the purpose; site access, logistics, equipment and budget are always marked
                not assessed.</li>
              <li><strong>Scenario comparison</strong> ranks two sets of priorities and limits with the same model. A site outside one list is shown as
                graded, below the top ten, or excluded by a named limit, never as zero, and each change is split into criterion contributions.</li>
            </ul>

            <h3>Checks the data have passed</h3>
            <p>Each figure below is computed when the pipeline runs and stored with the grids. None is typed by hand.</p>
            <Table
              head={["Check", "Result", "What it shows"]}
              rows={[
                ["Lunar slopes against LOLA's own slope product", `correlation ${n0(v.moon?.terrain?.slope_vs_ldsm16_r, 3)}; RADIUM values are ${n0(v.moon?.terrain?.slope_vs_ldsm16_median_ratio, 2)} of LOLA's`, "RADIUM's slopes track an independent product. They are lower because the baseline is twice as long."],
                ["Diviner equatorial temperatures", `maximum ${n0(v.moon?.diviner?.equator_tmax_K)} K, minimum ${n0(v.moon?.diviner?.equator_tmin_K)} K, mean ${n0(v.moon?.diviner?.equator_tmean_K)} K`, "Matches published equatorial values of about 390 K by day and 95 K by night (Williams et al. 2017)."],
                ["Best-lit point near the lunar south pole", `${pct(v.moon_sp?.max_avg_illumination ?? 0)} of the time at ${n0(Math.abs(v.moon_sp?.max_avg_illumination_lat ?? 0), 2)}°S, ${n0(v.moon_sp?.max_avg_illumination_lon_e, 2)}°E`, "The ridge beside Shackleton reported by Mazarico et al. (2011)."],
                ["Polar grid orientation", `south ${n0(v.moon_sp?.orientation_check_r_prp_alt_vs_lola, 4)}, north ${n0(v.moon_np?.orientation_check_r_prp_alt_vs_lola, 4)}`, "Correlation between two independent elevation fields on the same cells. The north Diviner table needed a longitude correction (true = 180° − listed), found by this check and confirmed with IAU crater positions."],
                ["Mars elevation extremes", `${n0(v.mars?.terrain?.dem_min_m)} m to ${n0(v.mars?.terrain?.dem_max_m)} m`, "Hellas floor and Olympus Mons summit as published for MOLA."],
                ["Mars pressure against a barometric estimate", `correlation ${n0(v.mars?.mcd?.pressure_vs_barometric_r, 4)}, ratio ${n0(v.mars?.mcd?.pressure_vs_barometric_median_ratio, 2)}`, "Model pressure adjusted to MOLA elevation agrees with an independent estimate from elevation alone."],
                ["Mars global mean surface temperature", `${n0(v.mars?.mcd?.global_mean_tsurf_K, 1)} K`, "Within the published range of about 200 to 210 K."],
                ["Earth global mean ground temperature", `${n0(v.earth?.power?.global_mean_skin_temp_K, 1)} K`, "About 15 °C, as expected."],
                ["Colour-mapped MODIS layers decoded exactly", `${n0((1 - (v.earth?.landcover?.unmatched_colour_fraction ?? 0)) * 100, 3)}% of pixels matched a colour-map entry`, "Values read from NASA GIBS imagery are the published bins, not approximations."],
                ["Salt flats mislabelled as ice", `${n0(m.earth_reclassified_ice_cells)} cells corrected`, "MODIS classes some bright salt flats as permanent snow. Where mean ground temperature is above 10 °C RADIUM counts that area as barren."],
              ]}
            />
            <p>
              Automated tests (<code>npm test</code>) also check coordinate handling, the normalisation of weights, the missing-data rules, the grade edges, and that the top-ranked Mars sites include regions real missions selected.
            </p>

            <h3>What RADIUM cannot tell you</h3>
            <ul>
              <li>Whether a specific landing ellipse is safe. Cells are 2 to 30 km across and slopes are measured over hundreds of metres to kilometres.</li>
              <li>Whether ice is present. Lunar indicators are hydrogen abundance, permanent shadow and thermal stability; Martian ones are hydrogen and thermal stability. None is a detection of ice at a site.</li>
              <li>Mars climate at a place. Temperature, pressure, sunlight and dust come from a climate model on a grid of about 330 km and describe a typical year without global dust storms.</li>
              <li>Mineralogy on the ground. Composition is averaged over 60 km on the Moon and several hundred kilometres on Mars; Earth rock type is one dominant class per 55 km.</li>
              <li>That an Earth match has been visited. A match that is not a documented analog site is a lead from the data, to be checked in the field.</li>
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
