// "Share this finding": a clean image of a Moon or Mars site and its Earth twin, drawn in the browser
// from the values on screen. Nothing is generated or estimated: every word and number is passed in from
// an API response. It carries no agency logo and is not an AI-generated image.
import { GRADE_HEX } from "./format";
import type { Grade, Planet } from "./types";

export interface ShareCard {
  body: Planet; target: string; targetCoords: string; targetAt: { lat: number; lon: number };
  earth: string; earthCoords: string; earthAt: { lat: number; lon: number };
  grade: Grade | null; score: number | null; purpose: string; newLead: boolean;
  /** Short lines such as "Gravity 3.71 vs 9.81 m/s²". */
  cannot: string[];
  sources: string[];
  link: string;
}

const W = 1200, H = 630;
const TEXTURE = { moon: "/worlds/moon.jpg", mars: "/worlds/mars.jpg", earth: "/worlds/earth.jpg" };
const ACCENT = { moon: "#cfd9e6", mars: "#dc9877", earth: "#6fbcce" };

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** A world as a lit disc: the part of the equirectangular image around the marked place, clipped to a circle. */
function disc(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, r: number, at: { lat: number; lon: number }, tint: string) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  ctx.fillStyle = "#0d1a2b"; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (img) {
    // Show a 150° by 150° window centred on the place (clamped so the window stays on the image).
    const span = 150, sw = (span / 360) * img.width, sh = (span / 180) * img.height;
    const cx = ((at.lon + 180) / 360) * img.width, cy = ((90 - Math.max(-52, Math.min(52, at.lat))) / 180) * img.height;
    const sx = Math.max(0, Math.min(img.width - sw, cx - sw / 2)), sy = Math.max(0, Math.min(img.height - sh, cy - sh / 2));
    ctx.drawImage(img, sx, sy, sw, Math.min(sh, img.height), x - r, y - r, r * 2, r * 2);
  }
  const shade = ctx.createRadialGradient(x - r * 0.45, y - r * 0.45, r * 0.2, x, y, r * 1.05);
  shade.addColorStop(0, "rgba(255,255,255,0.10)"); shade.addColorStop(0.55, "rgba(0,0,0,0)"); shade.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = shade; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  ctx.strokeStyle = tint; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number, font: (px: number) => string, from: number, least: number): number {
  let px = from;
  for (; px > least; px -= 2) { ctx.font = font(px); if (ctx.measureText(text).width <= max) break; }
  ctx.font = font(px);
  return px;
}

/** Draw the card and return it as a PNG. */
export async function renderShareCard(c: ShareCard): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  try { await document.fonts.ready; } catch { /* system fonts are used instead */ }
  const [world, earth] = await Promise.all([load(TEXTURE[c.body]), load(TEXTURE.earth)]);
  const serif = (px: number) => `italic 440 ${px}px "Newsreader Variable", Georgia, serif`;
  const sans = (px: number, weight = 400) => `${weight} ${px}px "IBM Plex Sans", system-ui, sans-serif`;
  const mono = (px: number) => `400 ${px}px "IBM Plex Mono", ui-monospace, monospace`;

  // ground: deep navy, a faint grid, one cool and one warm glow
  ctx.fillStyle = "#060c17"; ctx.fillRect(0, 0, W, H);
  const cool = ctx.createRadialGradient(80, 0, 0, 80, 0, 700); cool.addColorStop(0, "rgba(111,168,232,0.20)"); cool.addColorStop(1, "rgba(111,168,232,0)");
  ctx.fillStyle = cool; ctx.fillRect(0, 0, W, H);
  const warm = ctx.createRadialGradient(W - 60, H, 0, W - 60, H, 640); warm.addColorStop(0, "rgba(220,152,119,0.14)"); warm.addColorStop(1, "rgba(220,152,119,0)");
  ctx.fillStyle = warm; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(150,190,220,0.05)"; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

  // header
  ctx.fillStyle = "#eef4f8"; ctx.font = sans(22, 600); ctx.textBaseline = "alphabetic";
  ctx.fillText("R A D I U M", 60, 70);
  ctx.fillStyle = "#93a7b8"; ctx.font = sans(17);
  ctx.fillText(`Earth twin · ${c.purpose}`, 240, 70);

  // the two worlds and the line between them
  const y = 235, r = 112, ax = 190, bx = W - 190;
  disc(ctx, world, ax, y, r, c.targetAt, ACCENT[c.body]);
  disc(ctx, earth, bx, y, r, c.earthAt, ACCENT.earth);
  ctx.strokeStyle = "#e6f2fb"; ctx.lineWidth = 2.5; ctx.setLineDash([2, 11]); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(ax + r + 22, y); ctx.quadraticCurveTo(W / 2, y - 92, bx - r - 26, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(bx - r - 40, y - 15); ctx.lineTo(bx - r - 24, y); ctx.lineTo(bx - r - 42, y + 9); ctx.stroke();

  // grade and score, centred between the worlds
  const gx = W / 2;
  ctx.fillStyle = c.grade ? GRADE_HEX[c.grade] : "#22374d";
  ctx.beginPath(); ctx.roundRect(gx - 122, y - 30, 84, 84, 14); ctx.fill();
  ctx.fillStyle = c.grade ? "#071019" : "#93a7b8"; ctx.font = sans(56, 700); ctx.textAlign = "center";
  ctx.fillText(c.grade ?? "–", gx - 80, y + 32);
  ctx.textAlign = "left"; ctx.fillStyle = "#eef4f8"; ctx.font = mono(46);
  ctx.fillText(c.score === null ? "–" : c.score.toFixed(2), gx - 22, y + 16);
  ctx.fillStyle = "#93a7b8"; ctx.font = sans(15);
  ctx.fillText("twin score, 0 to 1", gx - 20, y + 42);

  // names
  const name = (text: string, coords: string, cx: number, tag: string, tagColor: string) => {
    ctx.textAlign = "center";
    ctx.fillStyle = "#eef4f8"; fit(ctx, text, 440, serif, 38, 22); ctx.fillText(text, cx, y + r + 62);
    ctx.fillStyle = "#93a7b8"; ctx.font = mono(16); ctx.fillText(coords, cx, y + r + 90);
    ctx.fillStyle = tagColor; ctx.font = sans(13, 600); ctx.fillText(tag, cx, y - r - 22);
    ctx.textAlign = "left";
  };
  name(c.target, c.targetCoords, Math.max(ax, 250), c.body === "moon" ? "THE MOON" : "MARS", ACCENT[c.body]);
  name(c.earth, c.earthCoords, Math.min(bx, W - 250), c.newLead ? "EARTH · NEW LEAD, NOT A DOCUMENTED ANALOG SITE" : "EARTH", ACCENT.earth);

  // what Earth cannot reproduce
  ctx.strokeStyle = "rgba(150,190,220,0.22)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(60, 478.5); ctx.lineTo(W - 60, 478.5); ctx.stroke();
  ctx.fillStyle = "#f08a7e"; ctx.font = sans(13, 600);
  ctx.fillText("EARTH CAN'T REPRODUCE", 60, 512);
  let x = 60;
  ctx.font = mono(16);
  for (const line of c.cannot.slice(0, 3)) {
    const w = ctx.measureText(line).width + 28;
    if (x + w > W - 60) break;
    ctx.fillStyle = "rgba(222,93,87,0.13)"; ctx.beginPath(); ctx.roundRect(x, 526, w, 36, 7); ctx.fill();
    ctx.strokeStyle = "rgba(240,138,126,0.45)"; ctx.beginPath(); ctx.roundRect(x + 0.5, 526.5, w - 1, 35, 7); ctx.stroke();
    ctx.fillStyle = "#ffd9d3"; ctx.fillText(line, x + 14, 550);
    x += w + 12;
  }

  // sources and how to reproduce it
  ctx.fillStyle = "#7b8fa1"; ctx.font = sans(13);
  const src = `Data: ${c.sources.join(", ")}. Grades are RADIUM's own scale, not a NASA rating.`;
  fit(ctx, src, W - 120, (px) => sans(px), 13, 10); ctx.fillText(src, 60, 596);
  ctx.fillStyle = "#93a7b8"; fit(ctx, c.link, W - 120, mono, 13, 9); ctx.fillText(c.link, 60, 616);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image could not be created."))), "image/png"));
}
