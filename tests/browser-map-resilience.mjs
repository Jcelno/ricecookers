import assert from "node:assert/strict";
import puppeteer from "puppeteer";
const base = process.env.RADIUM_TEST_URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (/trek\.nasa\.gov|tiles\.maps\.eox\.at/.test(request.url())) void request.abort("failed");
    else void request.continue();
  });
  await page.goto(`${base}/?tour=0`);
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(el => el.textContent.includes("Imagery unavailable")), { timeout: 60000 });
  const chip = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="status"]')].find(el => el.textContent.includes("Imagery unavailable"));
    const r = el.getBoundingClientRect();
    return { label: el.textContent, fits: r.left >= 0 && r.right <= innerWidth };
  });
  assert.match(chip.label, /Solar System Treks/);
  assert(chip.fits, "the source failure chip fits a mobile viewport");
  assert(await page.$("[data-stage] canvas"), "globe controls and exact-grid selection remain available");
  await page.evaluate(() => window.__radium.getState().setBody("earth"));
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(el => el.textContent.includes("Imagery unavailable: EOX")), { timeout: 60000 });
  assert.deepEqual(errors, [], "tile failures do not cause uncaught app errors");
  console.log("PASS globe and Earth imagery failures report their sources without hiding the map");
} finally { await browser.close(); }
