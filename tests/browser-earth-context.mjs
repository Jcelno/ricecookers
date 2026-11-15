import assert from "node:assert/strict";
import puppeteer from "puppeteer";

const base = process.env.RADIUM_TEST_URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--enable-unsafe-swiftshader"] });
const errors = [];
async function clickText(page, text, selector = "button") {
  await page.waitForFunction((text, selector) => [...document.querySelectorAll(selector)].some(node => node.textContent.trim() === text), { timeout: 30000 }, text, selector);
  await page.evaluate((text, selector) => {
    const button = [...document.querySelectorAll(selector)].find(node => node.textContent.trim() === text);
    assertButton(button, text);
    function assertButton(button, text) { if (!button) throw new Error(`Missing control: ${text}`); button.click(); }
  }, text, selector);
}
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage();
    await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
    page.on("pageerror", error => errors.push(error.message));
    let soilRequests = 0;
    let failReverse = false;
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.url().includes("rest.isric.org")) {
        soilRequests++;
        setTimeout(() => request.respond({ status: 503, contentType: "application/json", body: "{}", headers: { "Access-Control-Allow-Origin": "*" } }), 200);
      } else if (failReverse && request.url().endsWith("/api/twin/reverse")) request.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Test service unavailable" }) });
      else request.continue();
    });
    await page.goto(`${base}/?tour=0`);
    await page.waitForFunction(() => window.__radium?.getState().pins.earth.length, { timeout: 60000 });
    async function selectEarth(lat, lon) {
      await page.evaluate(async ({ lat, lon }) => {
        const s = window.__radium.getState(), pin = s.pins.earth.find(p => p.id === "earth-analog-0");
        s.setMode("explore"); s.setBody("earth"); s.setPanel("left", false);
        await s.select("earth", lat ?? pin.lat, lon ?? pin.lon);
      }, { lat, lon });
    }
    await selectEarth();
    const before = await page.evaluate(() => JSON.stringify(window.__radium.getState().cell));
    assert.equal(soilRequests, 0, "soil is fetched only by explicit request");
    await clickText(page, "Context (not scored)", "summary");
    await page.waitForFunction(() => document.querySelector('[aria-label="Earth context (not scored)"]')?.textContent.includes("great-circle distance"));
    assert.equal(soilRequests, 0, "opening context still does not request soil");
    await clickText(page, "Load SoilGrids");
    await page.waitForFunction(() => document.querySelector('[aria-label="Earth context (not scored)"]')?.textContent.includes("Requesting SoilGrids"));
    await page.waitForFunction(() => document.querySelector('[aria-label="Earth context (not scored)"]')?.textContent.includes("Unavailable."));
    assert.equal(soilRequests, 1);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__radium.getState().cell)), before, "optional context cannot mutate scored evidence");
    console.log(`PASS ${mobile ? "mobile" : "desktop"}: lazy official volcano catalog, explicit soil request, pending/unavailable, unchanged assessment`);

    await clickText(page, "What does this resemble?", "summary");
    await page.waitForSelector('[aria-label="What does this resemble?"] select');
    const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/twin/reverse") && response.status() === 200);
    await clickText(page, "Find planetary matches");
    const result = await (await responsePromise).json();
    await page.waitForSelector('[aria-label="Planetary match type"]');
    assert.equal(result.status, "ready");
    assert(result.results.every(group => group.catalog.length && group.cells.length));
    await clickText(page, "Grid matches", '[aria-label="Planetary match type"] button');
    const top = result.results[0].cells[0];
    const article = await page.$('[aria-label="What does this resemble?"] article');
    assert.match(await article.evaluate(node => node.textContent), new RegExp(`${Math.round(top.score * 100)}/100`));
    await article.$eval("summary", node => node.click());
    assert(await article.$('a[href^="https://"]'), "real sources remain linked");
    await article.$eval("button", node => node.click());
    await page.waitForFunction(() => window.__radium.getState().mode === "compare" && window.__radium.getState().compareStatus === "ready", { timeout: 60000 });
    const pair = await page.evaluate(() => window.__radium.getState().compare);
    assert.equal(pair.match.score, top.score, "reverse result is identical to the opened forward comparison");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "comparison fits viewport");
    console.log(`PASS ${mobile ? "mobile" : "desktop"}: real reverse results, grid/catalog switch, source disclosure, exact forward comparison`);

    await selectEarth(0, -140);
    await clickText(page, "What does this resemble?", "summary");
    await page.waitForSelector('[aria-label="What does this resemble?"] select');
    await clickText(page, "Find planetary matches");
    await page.waitForFunction(() => document.querySelector('[aria-label="What does this resemble?"]')?.textContent.includes("outside the analysed land grid"));
    assert.equal(await page.$('[aria-label="What does this resemble?"] article'), null, "ocean receives no invented match");
    failReverse = true;
    await clickText(page, "Search again");
    await page.waitForFunction(() => document.querySelector('[aria-label="What does this resemble?"]')?.textContent.includes("Unavailable. Test service unavailable"));
    console.log(`PASS ${mobile ? "mobile" : "desktop"}: ocean not assessed and reverse request error`);
    await page.evaluate(() => window.__radium.getState().setSheet("sources"));
    await page.waitForSelector('[data-source="soilgrids"]');
    await page.select('[aria-label="Source role"]', "context");
    const contextIds = await page.$$eval("[data-source]", nodes => nodes.map(node => node.dataset.source).sort());
    assert.deepEqual(contextIds, ["gvp_holocene", "soilgrids"]);
    assert((await page.$$eval("[data-source]", nodes => nodes.map(node => node.textContent))).every(text => text.includes("Context only · Not scored")));
    await page.select('[aria-label="Source role"]', "model");
    assert.equal(await page.$('[data-source="soilgrids"], [data-source="gvp_holocene"]'), null);
    assert((await page.$$("[data-source]")).length > 0, "measurements filter retains model datasets");
    console.log(`PASS ${mobile ? "mobile" : "desktop"}: context-only source filter and model exclusion`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
