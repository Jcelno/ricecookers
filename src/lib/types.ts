// Shapes returned by the RADIUM API (backend/app.py).

export type Body = "moon" | "mars" | "earth";
export type Planet = "moon" | "mars";
export type Grade = "A" | "B" | "C" | "D" | "F";
export type Evidence = "observed" | "inferred" | "modelled" | "computed" | "interpreted";

export interface Legend { stops: string[]; min: number; max: number; log: boolean }

export interface TileLayer {
  id: string; kind: "tiles"; group: string; title: string; description: string; legend_note: string | null;
  evidence: string; provider: string; attribution: string; url: string; format: string; max_level: number;
  bbox: [number, number, number, number]; capabilities: string;
}
export interface GridLayer {
  id: string; kind: "grid"; group: string; title: string; description: string; unit: string; fmt?: string | null;
  evidence: Evidence; source: string | null; res: string; caveat?: string | null; legend: Legend | null;
  has_polar: boolean; polar_only?: boolean; polar_legend: Legend | null;
}
export interface Basemap { id: string; title: string; provider: string; url: string; max_zoom: number; attribution: string; description: string }

export interface Criterion { id: string; label: string; short: string; question: string; rule: string; caveat: string; weight: number }
export interface Limit { id: string; label: string; rule: string; why: string }
export interface Mission { id: string; body: Planet; label: string; summary: string; criteria: Criterion[]; limits: Limit[] }
export interface Purpose { id: string; label: string; blurb: string; weights: Record<string, number> }

export interface Meta {
  bodies: Record<Body, { name: string; radius_km: number; grids: string[]; cell_note: string; gravity: number }>;
  evidence: Record<Evidence, { label: string; desc: string }>;
  categories: { id: string; label: string }[];
  grades: { grade: Grade; min: number; meaning: string; color: string }[];
  missions: Mission[];
  purposes: Record<Planet, Purpose[]>;
  dimensions: Record<string, { label: string; comparable: string; how: string }>;
  layers: {
    moon: { tiles: TileLayer[]; grid: GridLayer[] };
    mars: { tiles: TileLayer[]; grid: GridLayer[] };
    earth: { tiles: Basemap[]; grid: GridLayer[] };
  };
  cap: { edge_lat: number; boxes?: { south: [number, number][]; north: [number, number][] } };
  sources_index: Record<string, { name: string; url: string; agency: string }>;
}

export interface Measure {
  id: string; label: string; unit: string; dec: number; fmt?: string | null; evidence: Evidence; source: string | null;
  res: string; desc: string; caveat?: string | null; value: number | null; sigma: number | null; text: string | null;
  has_layer: boolean; class_code?: string;
}
export interface Group { id: string; label: string; items: Measure[] }

export interface Factor {
  id: string; label: string; short: string; question: string; weight: number; value: number | null; grade: Grade | null;
  contribution: number | null; rule: string; caveat: string;
  inputs: { id: string; label: string; unit: string; dec: number; fmt?: string | null; value: number | null; evidence: Evidence }[];
}
export interface Suitability {
  mission: string; score: number | null; grade: Grade | null; meaning: string | null; coverage: number; excluded: boolean;
  failed_limits: Limit[]; factors: Factor[];
}

export interface PlanetPlace { label: string; within: NamedFeature | null; nearest: NamedFeature & { direction?: string } }
export interface EarthPlace { label: string; region: string | null; admin1: string | null; country: string | null }
export interface NamedFeature { name: string; type: string; lat: number; lon: number; diam_km: number; link: string; distance_km?: number }

export interface Pin {
  id: string; name: string; kind: "landing" | "feature" | "analog"; lat: number; lon: number; note: string; source: string;
  link?: string; year?: number; country?: string; bodies?: Planet[]; theme?: string; feature_type?: string; diam_km?: number;
  distance_km?: number;
  tags?: SiteTags;
  /** Earth Twin only: how closely this analog site matches the selected Moon or Mars site. */
  grade?: Grade | null;
  /** Earth Analogs atlas: a text badge (grade letter or category code) drawn instead of the plain diamond. */
  badge?: { text: string; color: string; ink: string; title: string };
}

export interface CellInfo {
  grid: string; body: Body;
  cell: { i: number; j: number; lat: number; lon: number; size_km: [number, number]; outline: [number, number][]; kind: "latlon" | "polar" };
  groups: Group[]; missing: string[]; place: PlanetPlace | EarthPlace; coords: string; analysed: boolean; note?: string;
  suitability: Suitability | null; nearby_pins: Pin[];
}

export interface SiteCard {
  id: string; grid: string; lat: number; lon: number; coords: string; place: string; score: number | null; grade: Grade | null;
  coverage: number; cell_km: [number, number]; rank: number;
  factors: { id: string; short: string; label: string; value: number | null; grade: Grade | null; weight: number }[];
  prev_rank?: number | null; prev_grade?: Grade | null; prev_score?: number | null;
  drivers?: { id: string; label: string; delta_weight: number; value: number; effect: number }[];
}
export interface RankResult {
  mission: string; weights: Record<string, number>; sites: SiteCard[]; limits: string[];
  stats: { cells: number; graded: number; excluded: number; grades: Record<Grade, number> };
  change: { summary: string | null; weights_before: Record<string, number>; entered: number; left: number } | null;
  probes?: Probe[];
}

export interface DimScore { id: string; label: string; score: number | null; grade: Grade | null; weight: number }
export interface Candidate {
  id: string; lat: number; lon: number; coords: string; place: EarthPlace; score: number | null; grade: Grade | null;
  coverage: number; strong: string[]; weak: string[]; dimensions: DimScore[];
  fitness: { id: string; label: string; grade: Grade | null; score: number | null }[];
  documented: { name: string; distance_km: number; source: string; theme: string; for_this_body: boolean } | null;
  novel: boolean; why: string; rank: number;
}
export interface DocumentedSite {
  name: string; country: string; lat: number; lon: number; theme: string; source: string; for_this_body: boolean;
  score: number | null; grade: Grade | null; strong: string[]; weak: string[]; analysed: boolean;
}
export interface TwinResult {
  planet: { body: Planet; grid: string; lat: number; lon: number; coords: string; place: PlanetPlace; profile: Record<string, unknown>; cell_km: [number, number] };
  purpose: string; purpose_applicable: boolean; purpose_note: string | null;
  purposes: { id: string; applicable: boolean; note: string | null }[];
  dimensions: { id: string; label: string; weight: number; available: boolean }[];
  planet_coverage: number; candidates: Candidate[]; documented: DocumentedSite[];
  distribution: { cells: number; grades: Record<Grade, number>; best: number | null; median: number | null };
  separation_km: number;
}

export interface Pair {
  label: string; unit: string; dec: number; fmt?: string; planet: number | null; earth: number | null;
  planet_text?: string; earth_text?: string;
}
export interface DimDetail extends DimScore { comparable: string; how: string; pairs: Pair[]; note: string | null }
export interface Match {
  score: number | null; grade: Grade | null; meaning: string | null; coverage: number; dimensions: DimDetail[];
  strong: string[]; weak: string[]; missing: string[];
  fitness: { id: string; label: string; score: number | null; grade: Grade | null; use: string; coverage: number; applicable: boolean; note: string | null }[];
  breaks_down: { label: string; planet: string; earth: string; text: string }[];
}
export interface CompareResult {
  planet: CellInfo; earth: CellInfo; purpose: string; match: Match;
  documented: Candidate["documented"]; rank_among: { better_cells: number; cells: number } | null; why: string | null;
}

export interface Source {
  id: string; body: string; name: string; purpose: string; agency: string; url: string; access: string; format: string;
  coverage: string; variables: string[]; units: string; spatial_resolution: string; temporal_coverage: string; crs: string;
  license: string; limitations: string; processing: string; evidence: string;
}
export interface SearchHit { name: string; type: string; lat: number; lon: number; diam_km?: number }

/* ------------------------------------------------------------- Near Me */
export interface Tag { id: string; label: string }
export interface SiteTags { environment: Tag[]; applications: Tag[] }
export interface Similarity { score: number | null; grade: Grade | null; coverage: number; strong: string[]; weak: string[] }
export interface NearbyDocumented {
  kind: "documented"; name: string; country: string; lat: number; lon: number; coords: string; distance_km: number;
  theme: string; tags: SiteTags; source: string; bodies: Planet[]; similarity: Similarity | null;
}
export interface NearbyRegion {
  kind: "modelled_region"; lat: number; lon: number; coords: string; place: string; distance_km: number; cell_km: [number, number];
  similarity: Similarity; documented_nearby: Candidate["documented"];
}
export interface NearbyResult {
  query: { lat: number; lon: number; radius_km: number; mode: "nearest" | "best"; documented_only: boolean; limit: number };
  target: { body: Planet; lat: number; lon: number; coords: string; label: string; purpose: string; purpose_label: string; score_context: string; comparable: boolean } | null;
  documented: NearbyDocumented[]; documented_in_radius: number; regions: NearbyRegion[]; catalogue_size: number; notes: string[];
}

/* ------------------------------------------------------- Research brief */
export interface BriefSource { id: string; name: string; url: string; agency: string; resolution?: string; evidence?: string }
export interface BriefDim { id: string; label: string; grade: Grade | null; score: number | null; weight: number; pairs: Pair[]; note: string | null; sources: BriefSource[] }
export interface Brief {
  kind: "proposal"; disclaimer: string; title: string; goal: string; question: string; usable: boolean; usable_note: string | null;
  target: { body: Planet; label: string; coords: string; cell_km: [number, number] };
  earth: { label: string; coords: string; cell_km: [number, number]; documented: Candidate["documented"] };
  purpose: { id: string; label: string };
  match: { score: number | null; grade: Grade | null; meaning: string | null; coverage: number };
  why_useful: BriefDim[]; mismatches: BriefDim[]; not_assessed: { id: string; label: string; text: string }[];
  cannot_reproduce: { label: string; planet: string; earth: string; text: string }[];
  protocol: { setting: string; instrument_class: string; controlled: string[]; measured: string[]; data_to_collect: string[]; comparison: string; informative_outcome: string; laboratory_needs: string };
  preparation: string[]; unknowns: Record<string, string>;
  meta: { generated_utc: string; radium_version: string; build: string; settings: Record<string, string | number> };
}

export interface Probe { id: string; lat: number; lon: number; score: number | null; grade: Grade | null; coverage: number; excluded: boolean; failed_limits: string[]; rank: number | null }

export interface Profile {
  body: Body; axis: "ns" | "ew"; centre: { lat: number; lon: number; coords: string }; cell_km: [number, number];
  points: { offset_km: number; lat: number; lon: number; elev_m: number | null; slope_deg: number | null }[]; source: string; note: string;
}

export interface Timeline {
  body: Body; lat: number; lon: number; axis: string; ticks: string[];
  series: { id: string; label: string; unit: string; evidence: Evidence; source: string; note: string; values: (number | null)[]; observed: number }[];
}
