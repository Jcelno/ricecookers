// Real photographs of a place, from open archives. Nothing here is generated.
//   Moon and Mars: NASA Image and Video Library (images-api.nasa.gov), searched by the name of the
//                  nearest landing site or named feature. NASA imagery is not copyrighted.
//   Earth:         Wikimedia Commons, only for documented analog sites: photographs geotagged within 10 km
//                  of the site, then photographs that name it. Each keeps its own free licence and credit.
// Only terrain and landscape are kept: people, buildings, museums, equipment, illustrations, maps and
// anything categorised as AI-generated are filtered out.

import { useStore } from "@/store";

import type { Body, CellInfo, Pin, PlanetPlace } from "./types";

const R_KM: Record<Body, number> = { moon: 1737.4, mars: 3389.5, earth: 6371.0 };
function distKm(body: Body, la1: number, lo1: number, la2: number, lo2: number) {
  const r = Math.PI / 180, a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 2 * R_KM[body] * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** RADIUM's own pins (landing sites, named features, analog sites) near a cell, nearest first. */
function pinsNear(cell: CellInfo, maxKm: number): (Pin & { distance_km: number })[] {
  const all = useStore.getState().pins[cell.body] ?? [];
  return all
    .map((p) => ({ ...p, distance_km: distKm(cell.body, cell.cell.lat, cell.cell.lon, p.lat, p.lon) }))
    .filter((p) => p.distance_km <= maxKm)
    .sort((a, b) => a.distance_km - b.distance_km);
}

export interface Photo {
  id: string;
  thumb: string;
  full: string;
  title: string;
  credit: string;
  license: string;
  licenseUrl?: string;
  page: string;
  archive: "NASA Image and Video Library" | "Wikimedia Commons";
}
export interface PhotoSet {
  photos: Photo[];
  /** One sentence saying how these photos relate to the place. */
  basis: string;
}

const AI_OR_ART = /\b(ai[- ]generated|generative ai|stable diffusion|midjourney|dall[·\-‐ ]?e|text[- ]to[- ]image)\b/i;
const NOT_A_PHOTO_NASA =
  /illustrat|artist|concept|animation|render|simulat|infographic|graphic|poster|logo|diagram|chart|\bmap\b|mock-?up|replica|model of|full-scale|test bed|testbed|mission control|press conference|briefing|portrait|clean ?room|celebrat|team members|engineers|students|patch|emblem|sketch|painting|hardware|instrument|camera|spacecraft|assembl|engineering|wheel|parachute|heat shield|launch|cruise stage|full-size|prototype|annotat|labell?ed|figure|graph|sampling sites|sites on mars|sites through|map of|traverse|route|timeline|comparison|\bplot\b|spectr/i;
const ART_IN_DESCRIPTION = /artist'?s? (concept|rendering|illustration|impression)|illustration|computer[- ]generated|animation|simulated view|rendering of/i;
const NOT_A_PHOTO_COMMONS = /\b(map|locator|location|flag|logo|diagram|chart|coat of arms|emblem|seal|graph|plan|relief|topographic|satellite image of the world)\b/i;

// Terrain and landscape only. A photo must name a landform, and must not show people, buildings or equipment.
const LANDSCAPE =
  /crater|valley|canyon|gorge|mountain|\bmount|peak|ridge|hill|plateau|mesa|butte|desert|dune|sand|salar|salt|playa|lava|volcan|caldera|basalt|rock|boulder|cliff|outcrop|terrain|landscape|panorama|view|vista|glacier|\bice\b|snow|permafrost|lake|river|wadi|oasis|plain|steppe|tundra|coast|shore|island|aerial|gypsum|spring|geyser|fumarole|impact|layer|delta|channel|floor|\brim\b|mound|scarp|slope|surface|horizon|polar|pole|highland|\bmare\b|regolith|soil|gravel|badland|formation|\berg\b|hamada|fjord|cerro|desierto|nunatak|moraine|basin|flats?\b|sediment|strata|terrace/i;
const PEOPLE_OR_BUILDINGS =
  /people|person|portrait|selfie|crew|astronaut|cosmonaut|scientist|researcher|\bteam|member|student|visitor|tourist|group|family|children|\bman\b|\bwoman\b|\bmen\b|\bwomen\b|\bboy|\bgirl|guide\b|museum|exhibit|gallery|building|house|\bhut\b|habitat|station\b|camp\b|hotel|hostel|restaurant|cafe|\bshop|market|church|mosque|temple|cathedral|statue|monument|memorial|\bsign\b|plaque|interior|inside|\broom\b|kitchen|generator|shed|\btent|equipment|instrument|vehicle|truck|\bcar\b|\bbus\b|\batv\b|helicopter|aircraft|airplane|airport|\bflag|salute|spacesuit|\bsuit\b|\beva\b|commander|conference|meeting|lecture|ceremony|festival|wedding/i;
const isLandscape = (title: string, context = "") => LANDSCAPE.test(`${title} ${context}`) && !PEOPLE_OR_BUILDINGS.test(`${title} ${context}`);

const cache = new Map<string, Promise<PhotoSet>>();
const remember = (key: string, make: () => Promise<PhotoSet>) => {
  if (!cache.has(key)) cache.set(key, make().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key)!;
};

const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const cleanTitle = (t: string) => t.replace(/^File:/, "").replace(/\.(jpe?g|png|tiff?)$/i, "").replace(/_/g, " ").trim();

/* ------------------------------------------------------------------ NASA */
interface NasaItem {
  data: { nasa_id: string; title: string; description?: string; keywords?: string[]; center?: string; photographer?: string; secondary_creator?: string; media_type: string }[];
  links?: { href: string; rel: string; render?: string }[];
}

async function nasaSearch(term: string, world: "Moon" | "Mars"): Promise<Photo[]> {
  const url = `https://images-api.nasa.gov/search?${new URLSearchParams({ q: `${term} ${world}`, media_type: "image", page_size: "80" })}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`NASA image library answered ${r.status}`);
  const items: NasaItem[] = (await r.json()).collection.items;
  const worldWords = world === "Mars" ? /\bmars|martian\b/i : /\bmoon|lunar|apollo\b/i;
  const needle = term.toLowerCase();
  const out: Photo[] = [];
  for (const it of items) {
    const d = it.data[0];
    const href = it.links?.find((l) => l.render === "image")?.href;
    if (!d || !href) continue;
    // Planetary Photojournal releases (PIA…) only: orbital and surface views of the terrain. This keeps out
    // outreach events, hardware, and crew photographs (Apollo surface frames often show astronauts and flags).
    if (!/^PIA\d{4,}/i.test(d.nasa_id)) continue;
    if (out.some((o) => o.title === d.title)) continue;
    const text = `${d.title} ${d.description ?? ""} ${(d.keywords ?? []).join(" ")}`;
    if (!text.toLowerCase().includes(needle) || !worldWords.test(text)) continue;
    if (NOT_A_PHOTO_NASA.test(`${d.title} ${(d.keywords ?? []).join(" ")}`) || ART_IN_DESCRIPTION.test(d.description ?? "") || AI_OR_ART.test(text)) continue;
    if (!LANDSCAPE.test(d.title) || PEOPLE_OR_BUILDINGS.test(`${d.title} ${(d.keywords ?? []).join(" ")}`)) continue;
    const credit = d.secondary_creator || d.photographer || `NASA${d.center ? ` ${d.center}` : ""}`;
    out.push({
      id: d.nasa_id,
      thumb: href,
      full: href,
      title: d.title,
      credit,
      license: "NASA image, not copyrighted",
      licenseUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
      page: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
      archive: "NASA Image and Video Library",
    });
    if (out.length >= 7) break;
  }
  // Each image is stored in a different set of sizes; read its file list and use sizes that exist.
  await Promise.all(out.map(async (p) => {
    try {
      const r = await fetch(`https://images-api.nasa.gov/asset/${encodeURIComponent(p.id)}`);
      if (!r.ok) return;
      const files: string[] = (await r.json()).collection.items.map((i: { href: string }) => i.href.replace(/^http:/, "https:"));
      const pick = (...sizes: string[]) => sizes.map((s) => files.find((f) => f.endsWith(`~${s}.jpg`))).find(Boolean);
      p.thumb = pick("medium", "small", "large") ?? p.thumb;
      p.full = pick("large", "medium", "small", "orig") ?? p.full;
    } catch { /* keep the preview link from the search result */ }
  }));
  return out;
}

function planetTerms(place: PlanetPlace, cell: CellInfo): { term: string; why: string }[] {
  // The best-known name first: RADIUM's curated features and landing sites near the cell (Jezero, Gale,
  // Perseverance, Apollo 15 …), then the IAU feature that contains the cell, then the nearest one.
  const terms: { term: string; why: string }[] = [];
  for (const p of pinsNear(cell, 120)) {
    if (p.kind === "feature") terms.push({ term: p.name, why: `${p.name}, ${p.distance_km < 3 ? "at this cell" : `${Math.round(p.distance_km)} km away`}` });
  }
  for (const p of pinsNear(cell, 120)) {
    if (p.kind === "landing") terms.push({ term: p.name, why: `the ${p.name} landing site, ${Math.round(p.distance_km)} km away` });
  }
  if (place.within) terms.push({ term: place.within.name, why: `${place.within.name}, which contains this cell` });
  if (place.nearest && (place.nearest.distance_km ?? 1e9) < Math.max(250, place.nearest.diam_km)) {
    terms.push({ term: place.nearest.name, why: `${place.nearest.name}, the nearest named feature` });
  }
  const lat = cell.cell.lat;
  if (Math.abs(lat) > 75) {
    const pole = lat < 0 ? "south pole" : "north pole";
    terms.push({ term: pole, why: `the ${cell.body === "moon" ? "Moon's" : "Martian"} ${pole} region` });
  }
  const seen = new Set<string>();
  return terms.filter((t) => (seen.has(t.term) ? false : (seen.add(t.term), true)));
}

export function planetPhotos(cell: CellInfo): Promise<PhotoSet> {
  const world = cell.body === "moon" ? "Moon" : "Mars";
  const terms = planetTerms(cell.place as PlanetPlace, cell);
  return remember(`p:${cell.body}:${terms.map((t) => t.term).join("|")}`, async () => {
    for (const t of terms) {
      const photos = await nasaSearch(t.term, world);
      if (photos.length >= 3) return { photos, basis: `NASA images of ${t.why}.` };
    }
    return {
      photos: [],
      basis: terms.length
        ? `NASA's image library has no photographs of ${terms.map((t) => t.term).join(" or ")}.`
        : "No landing site or named feature lies close enough to search NASA's image library by name.",
    };
  });
}

/* --------------------------------------------------------------- Commons */
interface CommonsPage {
  pageid: number; title: string;
  imageinfo?: { mime: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[];
}

async function commons(params: Record<string, string>): Promise<Photo[]> {
  const q = new URLSearchParams({
    action: "query", format: "json", origin: "*", prop: "imageinfo",
    iiprop: "url|mime|extmetadata", iiurlwidth: "1280",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|Categories|ImageDescription|ObjectName",
    ...params,
  });
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${q}`);
  if (!r.ok) throw new Error(`Wikimedia Commons answered ${r.status}`);
  const pages: CommonsPage[] = Object.values((await r.json()).query?.pages ?? {});
  const out: Photo[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii?.thumburl || ii.mime !== "image/jpeg") continue;
    const m = ii.extmetadata ?? {};
    const desc = strip(m.ImageDescription?.value ?? "");
    const cats = m.Categories?.value ?? "";
    if (AI_OR_ART.test(`${cats} ${desc} ${p.title}`) || NOT_A_PHOTO_COMMONS.test(cleanTitle(p.title))) continue;
    if (!isLandscape(cleanTitle(p.title), `${strip(m.ObjectName?.value ?? "")} ${cats} ${desc.slice(0, 400)}`)) continue;
    const license = m.LicenseShortName?.value;
    if (!license) continue;
    out.push({
      id: String(p.pageid),
      // Wikimedia serves thumbnails only at standard widths (…, 330, 500, 960, 1280).
      thumb: ii.thumburl.replace(/\/1280px-/, "/500px-"),
      full: ii.thumburl,
      title: strip(m.ObjectName?.value ?? "") || cleanTitle(p.title),
      credit: strip(m.Artist?.value ?? "") || strip(m.Credit?.value ?? "") || "Unknown author",
      license,
      licenseUrl: m.LicenseUrl?.value,
      page: ii.descriptionurl,
      archive: "Wikimedia Commons",
    });
  }
  return out;
}

export interface AnalogSite { name: string; lat: number; lon: number }

/** Landscape photographs of one documented analog site. */
export function analogPhotos(site: AnalogSite): Promise<PhotoSet> {
  return remember(`analog:${site.name}`, async () => {
    const near = await commons({ generator: "geosearch", ggscoord: `${site.lat}|${site.lon}`, ggsradius: "10000", ggsnamespace: "6", ggslimit: "50" });
    let photos = near;
    if (photos.length < 4) {
      const short = site.name.split(",")[0].trim();
      const named = await commons({ generator: "search", gsrsearch: `"${short}" filetype:bitmap`, gsrnamespace: "6", gsrlimit: "50" });
      photos = [...near, ...named.filter((n) => !near.some((x) => x.id === n.id))];
    }
    photos = photos.slice(0, 7);
    return {
      photos,
      basis: photos.length
        ? `Landscape photographs of ${site.name}, a documented analog site, from Wikimedia Commons${near.length >= photos.length ? ", taken within 10 km of it" : ""}.`
        : `Wikimedia Commons has no openly licensed landscape photographs of ${site.name}.`,
    };
  });
}

export function photosFor(cell: CellInfo): Promise<PhotoSet> {
  if (cell.body !== "earth") return planetPhotos(cell);
  const site = pinsNear(cell, 150).find((p) => p.kind === "analog");
  if (!site) {
    return Promise.resolve({
      photos: [],
      basis: "Photographs are shown only for documented analog sites, and none lies within 150 km of this place.",
    });
  }
  return analogPhotos(site).then((set) => ({
    ...set,
    basis: (site.distance_km ?? 0) > 5 ? `${set.basis} The site is ${Math.round(site.distance_km!)} km from this cell.` : set.basis,
  }));
}
export const photoKey = (cell: CellInfo, body: Body = cell.body) => `${body}:${cell.cell.lat},${cell.cell.lon}`;

/** A fixed, well-photographed place per world for the starting panel. */
export function featuredPhotos(body: Body): Promise<PhotoSet> {
  return remember(`featured:${body}`, async () => {
    if (body === "earth") {
      return analogPhotos({ name: "Atacama Desert, Yungay", lat: -24.08, lon: -69.92 });
    }
    const [term, world, about] = body === "moon"
      ? ["Apollo 17", "Moon" as const, "Orbital views of the Apollo 17 landing site in the Taurus–Littrow valley."]
      : ["Jezero", "Mars" as const, "Jezero crater, where Perseverance is exploring an ancient river delta."];
    return { photos: (await nasaSearch(term, world)).slice(0, 4), basis: `${about} From NASA's image library.` };
  });
}
