// Screenshot helper (see CLAUDE.md).
//   node screenshot.mjs http://localhost:3000 [label] [--size=1440x900] [--wait=6000] [--run=script.js] [--full]
// Saves to ./temporary screenshots/screenshot-N[-label].png (auto-incremented, never overwritten).
// --run points at a JS file whose default export is `async (page) => {}` for clicking through the app first.
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import puppeteer from "puppeteer";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => { const [k, v = "true"] = a.slice(2).split("="); return [k, v]; }));
const [url = "http://localhost:3000", label] = args.filter((a) => !a.startsWith("--"));
const [width, height] = (flags.size ?? "1440x900").split("x").map(Number);
const wait = Number(flags.wait ?? 6000);

const dir = join(here, "temporary screenshots");
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const next = readdirSync(dir).map((f) => Number(/^screenshot-(\d+)/.exec(f)?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0) + 1;
const file = join(dir, `screenshot-${next}${label ? `-${label}` : ""}.png`);

const browser = await puppeteer.launch({
  headless: true,
  args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--enable-unsafe-swiftshader", `--window-size=${width},${height}`],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: Number(flags.dpr ?? 1) });
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("requestfailed", (r) => { const u = r.url(); if (!u.includes("favicon")) problems.push(`requestfailed: ${u} ${r.failure()?.errorText ?? ""}`); });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  if (flags.run) await (await import(pathToFileURL(resolve(flags.run)).href)).default(page);
  await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: file, fullPage: flags.full === "true" });
  console.log(file);
  const seen = new Set();
  for (const p of problems) { if (!seen.has(p)) { seen.add(p); console.log("  !", p.slice(0, 300)); } if (seen.size > 14) break; }
} finally {
  await browser.close();
}
