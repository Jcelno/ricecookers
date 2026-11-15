import {
  ArrowLeftRight,
  Bookmark,
  ExternalLink,
  MapPin,
  Rocket,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { emitTour } from "@/lib/tour/events";
import { Button, GradeTile, Sheet } from "@/components/ui/primitives";
import { formatCoord } from "@/lib/format";
import type { Body, Pin } from "@/lib/types";
import { useStore } from "@/store";

export const WORLD: Record<Body, string> = {
  moon: "Moon",
  mars: "Mars",
  earth: "Earth",
};
export const classification = (p: Pin) =>
  p.verification_status === "review_needed"
    ? "Research candidate · evidence review needed"
    : (
        p.classification ??
        {
          landing: "Historical landing",
          feature: "Geological research region",
          analog: "Terrestrial analog research",
        }[p.kind]
      ).replaceAll("_", " ");
export function siteSources(p: Pin) {
  return p.sources?.length
    ? p.sources
    : p.link
      ? [
          {
            title: p.source || "Scientific reference",
            url: p.link,
            role: "Site context",
          },
        ]
      : [];
}
export function RegistrySelect({
  label,
  worlds = ["moon", "mars", "earth"],
  onSelect,
  value = "",
  placeholder = "Choose a curated site…",
}: {
  placeholder?: string;
  label: string;
  worlds?: Body[];
  onSelect: (p: Pin, b: Body) => void;
  value?: string;
}) {
  const pins = useStore((s) => s.pins);
  return (
    <label className="registry-select">
      <span>{label}</span>
      <select
        className="field"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const [b, ...rest] = e.target.value.split(":");
          const p = pins[b as Body]?.find((p) => p.id === rest.join(":"));
          if (p) onSelect(p, b as Body);
        }}
      >
        <option value="">{placeholder}</option>
        {worlds.map((b) => (
          <optgroup key={b} label={WORLD[b]}>
            {pins[b].map((p) => (
              <option key={p.id} value={`${b}:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
export function SiteEvidence({ site }: { site: Pin }) {
  const refs = siteSources(site);
  return (
    <div className="site-evidence">
      <div className="flex flex-wrap gap-2 text-2xs text-regolith-400">
        <span>{classification(site)}</span>
        <span>
          {site.verification_status?.replaceAll("_", " ") ?? "Reference listed"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-regolith-200">
        {site.description || site.note}
      </p>
      {site.analog_purpose && (
        <p className="mt-2 text-xs leading-relaxed text-regolith-300">
          <strong>
            {site.verification_status === "review_needed"
              ? "Reported use (review needed): "
              : "Documented use: "}
          </strong>
          {site.analog_purpose}
        </p>
      )}
      {!!site.supported_dimensions?.length && (
        <p className="mt-2 text-xs text-regolith-300">
          Model comparison dimensions: {site.supported_dimensions.join(", ")}.
          Available numerical comparisons still depend on the selected target
          and data coverage.
        </p>
      )}
      {!!site.programs?.length && (
        <p className="mt-2 text-xs text-regolith-400">
          Research / missions: {site.programs.join(", ")}
        </p>
      )}
      <p className="mt-2 text-2xs leading-relaxed text-regolith-400">
        {formatCoord(site.lat, site.lon)}.{" "}
        {site.coordinate_reference ||
          "Latitude north positive; longitude east positive, −180° to 180°."}
      </p>
      {refs.length > 0 && (
        <ul className="mt-2 space-y-1">
          {refs.map((r, i) => (
            <li key={`${r.url}${i}`} className="text-xs">
              <a
                className="link inline-flex items-center gap-1"
                href={r.url}
                target="_blank"
                rel="noreferrer"
              >
                {r.title}
                <ExternalLink size={11} />
              </a>
              {r.role && (
                <span className="text-2xs text-regolith-400"> — {r.role}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {(site.coordinate_note ||
        site.verification_note ||
        site.dataset_note) && (
        <details className="mt-3 text-xs text-regolith-400">
          <summary className="cursor-pointer text-regolith-200">
            Coordinate precision, verification and coverage
          </summary>
          {[
            site.coordinate_note,
            site.verification_note,
            site.dataset_note,
            site.comparison_limitations,
          ]
            .filter(Boolean)
            .map((note, i) => (
              <p key={i} className="mt-2 leading-relaxed">
                {note}
              </p>
            ))}
        </details>
      )}
      {site.verified_on && (
        <p className="mt-2 text-2xs text-regolith-500">
          Evidence reviewed {site.verified_on}. Site history and calculated
          grades are separate evidence.
        </p>
      )}
    </div>
  );
}
export function SiteCatalog({ onClose }: { onClose: () => void }) {
  const pins = useStore((s) => s.pins);
  const twin = useStore((s) => s.twin);
  const origin = useStore((s) => s.twinOrigin);
  const [query, setQuery] = useState("");
  useEffect(() => { emitTour("catalog:opened", {}); }, []);
  const [world, setWorld] = useState("all");
  const [kind, setKind] = useState("all");
  const [grade, setGrade] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [analogType, setAnalogType] = useState("all");
  const all = useMemo(
    () =>
      (Object.keys(pins) as Body[]).flatMap((body) =>
        pins[body].map((p) => ({ ...p, body })),
      ),
    [pins],
  );
  const grades = new Map(
    twin?.documented?.map((p) => [p.name, p.analysed ? p.grade : null]) ?? [],
  );
  const classes = [...new Set(all.map((p) => p.classification ?? p.kind))];
  const analogTypes = [
    ...new Set(all.flatMap((p) => p.tags?.environment?.map((t) => t.id) ?? [])),
  ];
  const shown = all.filter(
    (p) =>
      (analogType === "all" ||
        p.tags?.environment?.some((t) => t.id === analogType)) &&
      (world === "all" || p.body === world) &&
      (kind === "all" || (p.classification ?? p.kind) === kind) &&
      (availability === "all" ||
        (availability === "references"
          ? siteSources(p).length > 0
          : !!p.dataset_availability?.length)) &&
      (grade === "all" ||
        (grade === "none"
          ? !grades.get(p.name)
          : p.body === "earth" && grades.get(p.name) === grade)) &&
      `${p.name} ${p.note} ${p.body} ${classification(p)} ${p.theme ?? ""} ${p.analog_purpose ?? ""} ${p.programs?.join(" ") ?? ""} ${JSON.stringify(p.tags ?? {})}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const open = (p: Pin, body: Body) => {
    const s = useStore.getState();
    s.setMode("explore");
    s.setBody(body);
    void s.select(body, p.lat, p.lon, {
      source: "catalog",
      fly: true,
      spanKm: body === "earth" ? 900 : 650,
    });
    onClose();
  };
  return (
    <Sheet
      title="Research site catalog"
      subtitle={`${all.length} curated places across three worlds. A documented research site is not automatically a strong match or a suitable mission destination.`}
      onClose={onClose}
    >
      <div className="catalog-content p-5 sm:p-6" data-tour="catalog">
        <div className="catalog-filters">
          <label className="relative min-w-0 flex-1">
            <Search
              size={15}
              className="absolute top-3 left-3 text-regolith-400"
            />
            <input
              className="field w-full pl-9"
              aria-label="Search research sites"
              placeholder="Search a site, mission, geology or research purpose"
              value={query}
              onChange={(e) => { setQuery(e.target.value); emitTour("catalog:filtered", { query: e.target.value }); }}
            />
          </label>
          <select
            aria-label="Filter planet"
            className="field"
            value={world}
            onChange={(e) => { setWorld(e.target.value); emitTour("catalog:filtered", { query: e.target.value }); }}
          >
            <option value="all">All worlds</option>
            {Object.entries(WORLD).map(([b, n]) => (
              <option key={b} value={b}>
                {n}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter classification"
            className="field"
            value={kind}
            onChange={(e) => { setKind(e.target.value); emitTour("catalog:filtered", { query: e.target.value }); }}
          >
            <option value="all">All classifications</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter analog environment"
            className="field"
            value={analogType}
            onChange={(e) => { setAnalogType(e.target.value); emitTour("catalog:filtered", { query: e.target.value }); }}
          >
            <option value="all">All analog environments</option>
            {analogTypes.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter calculated grade"
            className="field"
            value={grade}
            onChange={(e) => { setGrade(e.target.value); emitTour("catalog:filtered", { query: e.target.value }); }}
          >
            <option value="all">Any similarity grade</option>
            {["A", "B", "C", "D", "F"].map((g) => (
              <option key={g}>{g}</option>
            ))}
            <option value="none">Not scored</option>
          </select>
          <select
            aria-label="Filter data availability"
            className="field"
            value={availability}
            onChange={(e) => { setAvailability(e.target.value); emitTour("catalog:filtered", { query: e.target.value }); }}
          >
            <option value="all">All evidence</option>
            <option value="references">Source references</option>
            <option value="grids">Listed datasets</option>
          </select>
        </div>
        <p className="my-4 text-xs text-regolith-400">
          {shown.length} places shown.{" "}
          {origin
            ? "Earth grades use your current planetary target and research purpose."
            : "Choose a planetary target in Earth Analogs to calculate similarity grades."}{" "}
          Map cells describe regions, not exact landing points.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((p) => (
            <article key={`${p.body}:${p.id}`} className="catalog-card">
              <div className="flex items-start gap-3">
                <div className={`planet-dot ${p.body}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-2xs text-regolith-400">
                    {WORLD[p.body]}
                  </div>
                  <h3 className="font-serif text-xl text-regolith-50">
                    {p.name}
                  </h3>
                </div>
                <GradeTile
                  grade={
                    p.body === "earth" ? (grades.get(p.name) ?? null) : null
                  }
                  title={
                    p.body === "earth" && grades.get(p.name)
                      ? "Calculated analog similarity"
                      : "Not scored in this catalog view"
                  }
                  size="sm"
                />
              </div>
              <div className="mt-3">
                <SiteEvidence site={p} />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="solid"
                  onClick={() => open(p, p.body)}
                >
                  <MapPin size={13} /> Explore
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    useStore
                      .getState()
                      .saveSite({
                        body: p.body,
                        lat: p.lat,
                        lon: p.lon,
                        label: p.name,
                      })
                  }
                >
                  <Bookmark size={13} /> Save
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    useStore
                      .getState()
                      .addCompare({
                        body: p.body,
                        lat: p.lat,
                        lon: p.lon,
                        label: p.name,
                      })
                  }
                >
                  <ArrowLeftRight size={13} /> Compare
                </Button>
                {p.body !== "earth" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const s = useStore.getState();
                      s.setBody(p.body);
                      s.setMode("mission");
                      void s.select(p.body, p.lat, p.lon, { fly: true, source: "catalog" });
                      onClose();
                    }}
                  >
                    <Rocket size={13} /> Plan
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
        {!shown.length && (
          <p className="p-10 text-center text-regolith-300">
            No sites match these filters. Try another world, purpose or grade.
          </p>
        )}
      </div>
    </Sheet>
  );
}
