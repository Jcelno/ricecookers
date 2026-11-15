import assert from "node:assert/strict";
import puppeteer from "puppeteer";
const base = process.env.RADIUM_TEST_URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--enable-unsafe-swiftshader"] });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on("pageerror", error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (request.url().includes("/api/pins?")) setTimeout(() => void request.continue(), 1200);
    else void request.continue();
  });
  await page.goto(`${base}/?tour=0#demo/shackleton`);
  await page.waitForFunction(() => !!window.__radium?.getState().meta);
  assert.equal(await page.evaluate(() => location.hash), "#demo/shackleton", "catalog-dependent alias survives metadata-first loading");
  await page.waitForFunction(() => window.__radium.getState().cellStatus === "ready" && location.hash.startsWith("#v=2"), { timeout: 60000 });
  const shackleton = await page.evaluate(() => {
    const s = window.__radium.getState(), pin = s.pins.moon.find(p => p.id === "moon-feature-Shackleton");
    return { selection: s.selection, expected: { body: "moon", lat: pin.lat, lon: pin.lon }, mode: s.mode };
  });
  assert.deepEqual(shackleton.selection, shackleton.expected, "Shackleton uses its verified catalog coordinate, not an assumed rim");
  assert.equal(shackleton.mode, "explore");
  await page.goto(`${base}/?tour=0#demo/gale-twin`);
  await page.waitForFunction(() => window.__radium?.getState().twinStatus === "ready" && location.hash.startsWith("#v=2"), { timeout: 60000 });
  const gale = await page.evaluate(() => {
    const s = window.__radium.getState(), pin = s.pins.mars.find(p => p.id === "mars-feature-Gale");
    return { origin: s.twinOrigin, expected: { body: "mars", lat: pin.lat, lon: pin.lon }, purpose: s.purpose, mode: s.mode };
  });
  assert.deepEqual(gale.origin, gale.expected);
  assert.equal(gale.purpose, "mobility");
  assert.equal(gale.mode, "twin");
  await page.goto(`${base}/?tour=0#demo/mission-moon`);
  await page.waitForFunction(() => window.__radium?.getState().rankStatus === "ready" && location.hash.startsWith("#v=2"), { timeout: 60000 });
  const mission = await page.evaluate(() => {
    const s = window.__radium.getState(), q = new URLSearchParams(location.hash.slice(1));
    return { body: s.body, mode: s.mode, mission: s.missionId, step: s.missionStep, encodedStep: q.get("ms") };
  });
  assert.deepEqual(mission, { body: "moon", mode: "mission", mission: "lunar_base", step: "candidates", encodedStep: "candidates" });
  await page.reload();
  await page.waitForFunction(() => window.__radium?.getState().rankStatus === "ready");
  assert.equal(await page.evaluate(() => window.__radium.getState().missionStep), "candidates", "the resolved versioned link preserves the mission step");
  await page.goto(`${base}/?tour=0#demo/shackleton`);
  await page.waitForFunction(() => !!window.__radium?.getState().meta && !window.__radium.getState().pins.moon.length);
  await page.evaluate(() => { location.hash = "#v=2&m=explore&b=earth"; });
  await page.waitForFunction(() => window.__radium.getState().pins.moon.length > 0);
  assert.equal(await page.evaluate(() => window.__radium.getState().body), "earth", "leaving a pending alias cancels its deferred restoration");
  assert.deepEqual(errors, []);
  console.log("PASS all demo aliases, delayed catalog resolution, exact registry coordinates, stable mission step, versioned reload and stale-alias cancellation");
} finally { await browser.close(); }
