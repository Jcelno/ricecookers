// Real photographs of a place, from open archives. Nothing here is generated.
//   Moon and Mars: NASA Image and Video Library (images-api.nasa.gov), searched by the name of the
//                  nearest landing site or named feature. NASA imagery is not copyrighted.
//   Earth:         Wikimedia Commons, first photographs geotagged within 10 km, then photographs that
//                  name the surrounding region. Each keeps its own free licence and author credit.
// Illustrations, artist's concepts, maps and anything categorised as AI-generated are filtered out.

import type { Body, CellInfo, EarthPlace, PlanetPlace } from "./types";

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
  /illustrat|artist|concept|animation|render|simulat|infographic|graphic|poster|logo|diagram|chart|\bmap\b|mock-?up|replica|model of|full-scale|test bed|testbed|mission control|press conference|briefing|portrait|clean ?room|celebrat|team members|engineers|students|patch|emblem|sketch|painting|hardware|instrument|camera|spacecraft|assembl|engineering|wheel|parachute|heat shield|launch|cruise stage|full-size|prototype|annotat|labell?ed|figure|graph|\\bplot\\b|spectr/i;
const ART_IN_DESCRIPTION = /artist'?s? (concept|rendering|illustration|impression)|illustration|computer[- ]generated|animation|simulated view|rendering of/i;
const NOT_A_PHOTO_COMMONS = /\b(map|locator|location|flag|logo|diagram|chart|coat of arms|emblem|seal|graph|plan|relief|topographic|satellite image of the world)\b/i;

// Earth photos: the place itself first. Landscape words raise a photo; equipment, interiors and people drop it.
const LANDSCAPE = /crater|valley|canyon|gorge|mountain|mount|peak|ridge|hill|plateau|mesa|butte|desert|dune|sand|salar|salt|playa|lava|volcan|caldera|basalt|rock|cliff|outcrop|terrain|landscape|panorama|view|vista|glacier|ice|snow|permafrost|lake|river|wadi|oasis|plain|steppe|tundra|coast|island|aerial|from space|iss\d|sts-\d/i;
const NOT_THE_PLACE = /generator|shed|laser|medical|toilet|tent|interior|inside|kitchen|bedroom|office|lab(oratory)?\b|equipment|computer|screen|antenna|vehicle|truck|car\b|atv|helicopter|aircraft|plane\b|selfie|portrait|people|crew|group photo|team|meeting|sign\b|plaque|poster|museum|exhibit|hotel|restaurant|food|dish|statue|church|mosque|cathedral|logo/i;
const landscapeFirst = (ps: Photo[]) =>
  ps.filter((p) => !NOT_THE_PLACE.test(p.title)).map((p, i) => ({ p, k: (LANDSCAPE.test(p.title) ? 0 : 1) * 1000 + i })).sort((a, b) => a.k - b.k).map((x) => x.p);

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
    // Science imagery only: Planetary Photojournal releases (PIA…) and Apollo mission photographs (AS11-…).
    // This keeps out outreach events, hardware on Earth and press photos that merely mention the site.
    if (!/^(PIA\d{4,}|a?s\d{2}-\d+-\d+)/i.test(d.nasa_id)) continue;
    if (out.some((o) => o.title === d.title)) continue;
    const text = `${d.title} ${d.description ?? ""} ${(d.keywords ?? []).join(" ")}`;
    if (!text.toLowerCase().includes(needle) || !worldWords.test(text)) continue;
    if (NOT_A_PHOTO_NASA.test(`${d.title} ${(d.keywords ?? []).join(" ")}`) || ART_IN_DESCRIPTION.test(d.description ?? "") || AI_OR_ART.test(text)) continue;
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
  // Landscape first: the named feature that contains the cell, then a landing site (rover and lander
  // imagery of that ground), then the nearest named feature.
  const terms: { term: string; why: string }[] = [];
  if (place.within) terms.push({ term: place.within.name, why: `${place.within.name}, which contains this cell` });
  for (const p of cell.nearby_pins ?? []) {
    if (p.kind === "landing" && (p.distance_km ?? 1e9) < 300) terms.push({ term: p.name, why: `the ${p.name} landing site, ${Math.round(p.distance_km ?? 0)} km away` });
  }
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
  return landscapeFirst(out);
}

const ABBREV: [RegExp, string][] = [
  [/\bMts\.?(?=\s|,|$)/g, "Mountains"], [/\bMt\.?(?=\s|,|$)/g, "Mount"], [/\bPen\.?(?=\s|,|$)/g, "Peninsula"],
  [/\bDes\.?(?=\s|,|$)/g, "Desert"], [/\bPl\.?(?=\s|,|$)/g, "Plateau"], [/\bIs\.?(?=\s|,|$)/g, "Island"], [/\bL\.(?=\s|,|$)/g, "Lake"],
];
const expand = (s: string) => ABBREV.reduce((a, [re, to]) => a.replace(re, to), s).trim();

export function earthPhotos(lat: number, lon: number, place: EarthPlace): Promise<PhotoSet> {
  const area = place.region ? expand(place.region) : place.admin1 ? `${place.admin1}${place.country ? ` ${place.country}` : ""}` : place.country ?? "";
  return remember(`e:${lat.toFixed(2)},${lon.toFixed(2)}:${area}`, async () => {
    const near = await commons({ generator: "geosearch", ggscoord: `${lat}|${lon}`, ggsradius: "10000", ggsnamespace: "6", ggslimit: "40" });
    if (near.length >= 3) return { photos: near.slice(0, 7), basis: "Photographs geotagged within 10 km of this cell's centre, from Wikimedia Commons." };
    const named = area ? await commons({ generator: "search", gsrsearch: `"${area}" filetype:bitmap`, gsrnamespace: "6", gsrlimit: "40" }) : [];
    const photos = [...near, ...named.filter((n) => !near.some((x) => x.id === n.id))].slice(0, 7);
    if (!photos.length) return { photos, basis: "Wikimedia Commons has no openly licensed photographs taken near here or naming this area." };
    return {
      photos,
      basis: near.length
        ? `${near.length === 1 ? "One photograph is" : `${near.length} photographs are`} geotagged within 10 km; the rest are Wikimedia Commons photographs of ${area}, which may come from elsewhere in that area.`
        : `Nothing on Wikimedia Commons is geotagged within 10 km, so these are photographs of ${area}. They may come from anywhere in that area.`,
    };
  });
}

export function photosFor(cell: CellInfo): Promise<PhotoSet> {
  return cell.body === "earth" ? earthPhotos(cell.cell.lat, cell.cell.lon, cell.place as EarthPlace) : planetPhotos(cell);
}
export const photoKey = (cell: CellInfo, body: Body = cell.body) => `${body}:${cell.cell.lat},${cell.cell.lon}`;

/** A fixed, well-photographed place per world for the starting panel. */
export function featuredPhotos(body: Body): Promise<PhotoSet> {
  return remember(`featured:${body}`, async () => {
    if (body === "earth") {
      const set = await earthPhotos(-24.08, -69.92, { label: "Atacama Desert", region: "Atacama Desert", admin1: null, country: "Chile" });
      return { ...set, basis: "The Atacama Desert near Yungay, Chile, a documented Mars analog site. Photographs from Wikimedia Commons." };
    }
    const [term, world, about] = body === "moon"
      ? ["Apollo 17", "Moon" as const, "Apollo 17 photographs from the Taurus–Littrow valley, the last crewed landing site."]
      : ["Jezero", "Mars" as const, "Jezero crater, where Perseverance is exploring an ancient river delta."];
    return { photos: (await nasaSearch(term, world)).slice(0, 4), basis: `${about} From NASA's image library.` };
  });
}
