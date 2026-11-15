import assert from "node:assert/strict";
import puppeteer from "puppeteer";

const base = process.env.RADIUM_TEST_URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--enable-unsafe-swiftshader"] });
const errors = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage();
    await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/?tour=0`);
    await page.waitForFunction(() => window.__radium?.getState().meta && ["moon", "mars", "earth"].every(body => window.__radium.getState().pins[body].length), { timeout: 60000 });
    await page.evaluate(() => { const s = window.__radium.getState(); s.setMode("explore"); s.clearSelection(); s.setPanel("right", true); s.setPanel("left", false); });
    await page.waitForSelector("[data-starter-sites]");
    await page.waitForFunction(() => !document.querySelector("[data-starter-sites]").textContent.includes("Loading live"), { timeout: 30000 });
    const previews = await page.$$eval("[data-starter]", nodes => nodes.map(node => ({ body: node.dataset.starter, text: node.querySelector("[data-starter-preview]").textContent })));
    assert.match(previews.find(p => p.body === "earth").text, /Not assessed.*not defined/);
    for (const body of ["moon", "mars", "earth"]) {
      await page.click(`[data-starter="${body}"]`);
      await page.waitForFunction(body => window.__radium.getState().cellStatus === "ready" && window.__radium.getState().selection?.body === body, { timeout: 30000 }, body);
      const actual = await page.evaluate(() => {
        const s = window.__radium.getState();
        const pin = s.pins[s.body].find(p => p.lat === s.selection.lat && p.lon === s.selection.lon);
        return { pin: pin?.id, grade: s.cell.suitability?.grade, excluded: s.cell.suitability?.excluded };
      });
      assert.equal(actual.pin, { moon: "moon-feature-Shackleton", mars: "mars-feature-Gale", earth: "earth-analog-0" }[body]);
      if (body !== "earth") assert(previews.find(p => p.body === body).text.startsWith(actual.excluded ? "Ruled out" : `Grade ${actual.grade}`), "preview agrees with the actual API assessment opened by one click");
      await page.evaluate(() => window.__radium.getState().clearSelection());
      await page.waitForSelector(`[data-starter="${body}"]`);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "starters fit viewport");
    console.log(`PASS ${mobile ? "mobile" : "desktop"}: catalog coordinates, live grade equivalence, three one-click selections`);
    await page.close();
  }
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", request => request.url().includes("/api/cell?") ? request.abort() : request.continue());
  await page.goto(`${base}/?tour=0`);
  await page.waitForFunction(() => window.__radium?.getState().pins.moon.length && window.__radium.getState().pins.mars.length, { timeout: 60000 });
  await page.evaluate(() => { const s = window.__radium.getState(); s.setPanel("right", true); s.clearSelection(); });
  await page.waitForFunction(() => document.querySelector('[data-starter="moon"]')?.textContent.includes("Preview unavailable"), { timeout: 30000 });
  assert.match(await page.$eval('[data-starter="moon"]', node => node.textContent), /open to retry/);
  console.log("PASS unavailable preview remains an explicit retryable state");
  await page.close();
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
