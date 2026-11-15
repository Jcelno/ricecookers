import assert from "node:assert/strict";
import puppeteer from "puppeteer";
const browser = await puppeteer.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--enable-unsafe-swiftshader"] });
const base = process.env.RADIUM_TEST_URL ?? "http://localhost:3000";
const errors = [];
async function openGuide(mobile = false) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/?tour=1`);
  await page.waitForSelector("[data-tour-welcome]", { timeout: 60000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find(button => button.textContent.trim().startsWith("Full field guide")).click());
  await page.waitForSelector("[data-tour-step]");
  return { context, page };
}
async function topic(page, title) {
  await page.click('[aria-label="Choose tutorial topic"]');
  await page.evaluate(title => [...document.querySelectorAll(".tour-topic")].find(button => button.textContent.trim() === title).click(), title);
}
try {
  const { context, page } = await openGuide();
  const definitions = await page.evaluate(async () => (await import("/src/lib/tour/steps.ts")).TOUR_STEPS.map(({ id, title, chapter, waitFor, widget }) => ({ id, title, chapter, waitFor, widget })));
  assert.equal(definitions.length, 32);
  assert.equal(new Set(definitions.map(step => step.id)).size, 32);
  assert.equal(new Set(definitions.map(step => step.chapter)).size, 6);
  assert(definitions.every(step => step.title.split(/\s+/).length <= 6 && (step.waitFor || step.widget)));
  await topic(page, "Search the research catalog");
  await page.waitForSelector('[data-tour="catalog"] .catalog-filters');
  const catalog = await page.evaluate(async () => { const el = (await import("/src/lib/tour/Spotlight.tsx")).findTourTarget("catalog"); const r = el.getBoundingClientRect(); return { y: r.y, height: r.height, isFilters: el.classList.contains("catalog-filters") }; });
  assert(catalog.isFilters && catalog.height < 300 && catalog.y >= 0, "catalog spotlight targets its controls, not thousands of pixels of results");
  await topic(page, "Know where analogy stops");
  await page.waitForSelector('[data-tour="analogy-breakdown"]', { timeout: 60000 });
  await page.waitForFunction(() => { const r = document.querySelector('[data-tour="analogy-breakdown"]').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; });
  assert(await page.$(".tour-spotlight-ring"));
  console.log("PASS 32 stable actionable topics, compact catalog target and revealed analogy breakdown");
  await context.close();
  const mobile = await openGuide(true);
  await topic(mobile.page, "Find fieldwork near you");
  await mobile.page.waitForFunction(async () => { const el = (await import("/src/lib/tour/Spotlight.tsx")).findTourTarget("near-settings"); return !!el && el.getClientRects().length > 0; }, { timeout: 60000 });
  const target = await mobile.page.evaluate(async () => { const el = (await import("/src/lib/tour/Spotlight.tsx")).findTourTarget("near-settings"); const r = el.getBoundingClientRect(), coach = document.querySelector(".tour-coach").getBoundingClientRect(); return { label: el.getAttribute("aria-label"), top: r.top, bottom: r.bottom, coach: coach.top }; });
  assert.equal(target.label, "Enter coordinates");
  assert(target.top >= 0 && target.bottom <= target.coach, "visible coordinate form stays above the mobile coach");
  await mobile.context.close();
  assert.deepEqual(errors, []);
  console.log("PASS full guide selects the visible mobile Near Me form");
} finally { await browser.close(); }
