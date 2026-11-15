import assert from "node:assert/strict";
import puppeteer from "puppeteer";
const base = process.env.RADIUM_TEST_URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--enable-unsafe-swiftshader"] });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
async function fresh({ mobile = false, blocked = false, reduced = false } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  if (blocked) await page.evaluateOnNewDocument(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage disabled", "SecurityError"); } }));
  if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  page.on("pageerror", error => errors.push(error.message));
  return { context, page };
}
async function clickText(page, text, scope = "button") {
  const handle = await page.evaluateHandle((text, scope) => [...document.querySelectorAll(scope)].find(el => el.textContent.includes(text)), text, scope);
  assert(await handle.asElement(), `button exists: ${text}`);
  await handle.asElement().click();
  await handle.dispose();
}
async function step(page, id) {
  await page.waitForSelector(`[data-tour-step="${id}"]`, { timeout: 30000 });
}
try {
  {
    const { context, page } = await fresh();
    await page.goto(`${base}/?tour=1`);
    await page.waitForSelector("[data-tour-welcome]", { timeout: 60000 });
    assert.equal(await page.evaluate(() => localStorage.getItem("radium.intro.v2")), null, "merely displaying welcome does not mark it seen");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => localStorage.getItem("radium.intro.v2")), "1");
    await page.goto(base);
    await page.waitForSelector("[data-tour=help]");
    await pause(1600);
    assert.equal(await page.$("[data-tour-welcome]"), null, "closed welcome stays closed on ordinary reload");
    await context.close();
    console.log("PASS forced first-run welcome, dismissal and reload");
  }
  {
    const { context, page } = await fresh();
    await page.goto(`${base}/#v=2&m=explore&b=mars&s=-4.59,137.44`);
    await page.waitForSelector(".tour-invitation", { timeout: 60000 });
    assert.equal(await page.$("[data-tour-welcome]"), null);
    assert.match(await page.$eval(".tour-invitation", el => el.textContent), /2-minute tour/);
    await context.close();
    console.log("PASS deep link gets non-blocking invitation");
  }
  {
    const { context, page } = await fresh({ blocked: true });
    await page.goto(`${base}/?tour=1`);
    await page.waitForSelector("[data-tour=help]", { timeout: 60000 });
    await pause(1600);
    assert.equal(await page.$("[data-tour-welcome]"), null);
    await context.close();
    console.log("PASS blocked storage never traps visitors");
  }
  {
    const { context, page } = await fresh();
    await page.goto(`${base}/?tour=1`);
    await page.waitForSelector("[data-tour-welcome]", { timeout: 60000 });
    await clickText(page, "Quick tour");
    await step(page, "pick-world");
    await clickText(page, "Mars", '[data-tour="worlds"] button');
    await step(page, "move-map");
    const box = await page.$eval("[data-stage] canvas", el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await page.mouse.move(box.x + box.width * .48, box.y + box.height * .48);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .64, box.y + box.height * .52, { steps: 18 });
    await page.mouse.up();
    await pause(800);
    // Return to the exposed globe: the drag can end beneath the adjacent coach card.
    await page.mouse.move(box.x + box.width * .40, box.y + box.height * .40);
    await page.mouse.wheel({ deltaY: -450 });
    await step(page, "select-site");
    // Empty panel space is not an action and cannot complete a selection step.
    await page.evaluate(() => document.querySelector('[data-tour="location"]')?.click());
    await pause(1100);
    assert(await page.$('[data-tour-step="select-site"]'));
    const marker = '[data-tour-marker="mars-feature-Gale"]';
    await page.waitForSelector(marker, { visible: true, timeout: 15000 });
    await page.click(marker);
    await step(page, "read-grade");
    await page.click('[aria-label="Not scored"]');
    await step(page, "turn-on-layer");
    await page.click('[data-tour="slope-layer"]');
    await step(page, "find-twin");
    await page.click('[data-tour="find-twin"]');
    await step(page, "save-it");
    await page.click('[data-tour="save-place"]');
    await page.waitForSelector("[data-tour-finish]", { timeout: 30000 });
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("radium.tutorial.v3")));
    assert.equal(new Set(progress.completed).size, 7);
    assert(progress.completed.every(id => typeof id === "string"));
    assert.equal(progress.index, undefined);
    // A reordered completed list has exactly the same meaning.
    const summary = await page.evaluate(async () => {
      const intro = await import("/src/lib/intro.ts");
      const p = intro.loadTourProgress();
      intro.saveTourProgress({ ...p, completed: [...p.completed].reverse() });
      return intro.quickTourSummary();
    });
    assert.equal(summary.complete, true);
    await context.close();
    console.log("PASS seven real actions, no empty-space completion, stable-ID persistence");
  }
  {
    const { context, page } = await fresh({ mobile: true, reduced: true });
    await page.goto(`${base}/?tour=1`);
    await page.waitForSelector("[data-tour-welcome]", { timeout: 60000 });
    await clickText(page, "Quick tour");
    await step(page, "pick-world");
    const geometry = await page.evaluate(() => {
      const coach = document.querySelector("[data-tour-step]").getBoundingClientRect();
      const target = document.querySelector('[data-tour="worlds"]').getBoundingClientRect();
      return { left: coach.left, right: coach.right, bottom: coach.bottom, top: coach.top, targetBottom: target.bottom, dotAnimation: getComputedStyle(document.querySelector(".tour-help-dot")).animationName };
    });
    assert(geometry.left >= 0 && geometry.right <= 390 && geometry.bottom <= 844 && geometry.bottom >= 820);
    assert(geometry.top >= geometry.targetBottom, "bottom dock does not cover world switch");
    assert.equal(geometry.dotAnimation, "none");
    await context.close();
    console.log("PASS mobile bottom dock and reduced motion");
  }
  assert.deepEqual(errors, [], "no uncaught browser errors");
} finally { await browser.close(); }
