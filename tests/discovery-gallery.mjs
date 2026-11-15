import assert from "node:assert/strict";
import puppeteer from "puppeteer";
const base = process.env.RADIUM_TEST_URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--enable-unsafe-swiftshader"] });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
async function setup({ mobile = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/?tour=0`);
  await page.waitForFunction(() => window.__radium?.getState().meta && window.__radium.getState().pins.mars.length, { timeout: 60000 });
  await page.evaluate(async () => {
    const st = window.__radium.getState(), site = st.pins.mars.find(pin => pin.name === "Gale");
    st.setBody("mars"); st.setPanel("left", false); await st.select("mars", site.lat, site.lon, { fly: true });
  });
  return page;
}
async function choose(page, text, scope = "button") {
  await page.evaluate((text, scope) => { const el = [...document.querySelectorAll(scope)].find(node => node.textContent.trim() === text); if (!el) throw new Error(`Missing control: ${text}`); el.click(); }, text, scope);
}
try {
  const page = await setup();
  await page.waitForSelector('[aria-label="Copy coordinates"]');
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async value => { window.__copiedCoordinates = value; } }));
  await page.click('[aria-label="Copy coordinates"]');
  await page.waitForSelector('[aria-label="Coordinates copied"]');
  const exact = await page.evaluate(() => { const s = window.__radium.getState(); return { text: window.__copiedCoordinates, expected: `${s.selection.lat}, ${s.selection.lon}`, selection: s.selection }; });
  assert.equal(exact.text, exact.expected, "copies the exact selected point, not its analysis-cell centre");
  await page.click('[aria-label="Center map on this place"]');
  const focus = await page.evaluate(() => window.__radium.getState().focus);
  assert.equal(focus.lat, exact.selection.lat); assert.equal(focus.lon, exact.selection.lon);
  console.log("PASS exact selected coordinates copy and map centre action");
  await page.waitForSelector("[data-gallery-open]");
  await page.click("[data-gallery-open]");
  await page.waitForSelector("[data-gallery-viewer]");
  assert.match(await page.$eval(".gallery-type", el => el.textContent), /Orbital/);
  assert.match(await page.$eval(".gallery-counter", el => el.textContent), /^1 of /);
  assert.match(await page.$eval(".gallery-caption", el => el.textContent), /source|NASA|MOLA|Viking/i);
  await page.waitForFunction(() => document.querySelectorAll(".gallery-thumbnails button").length > 1, { timeout: 60000 });
  await page.click('[aria-label="Next photograph"]');
  assert.match(await page.$eval(".gallery-counter", el => el.textContent), /^2 of /);
  await page.keyboard.press("ArrowLeft");
  assert.match(await page.$eval(".gallery-counter", el => el.textContent), /^1 of /);
  await page.click('[aria-label="Zoom image in"]');
  assert.equal(await page.$eval(".gallery-zoom>span", el => el.textContent), "150%");
  for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
  assert(await page.evaluate(() => document.querySelector("[data-gallery-viewer]").contains(document.activeElement)), "focus remains trapped inside gallery");
  await page.keyboard.press("Escape");
  assert.equal(await page.$("[data-gallery-viewer]"), null);
  assert(await page.evaluate(() => document.activeElement?.hasAttribute("data-gallery-open")), "focus returns to opener");
  console.log("PASS orbital first, real photo navigation, zoom, focus trap and return");
  await page.evaluate(() => { const st = window.__radium.getState(); st.startTwin(); });
  await page.waitForFunction(() => window.__radium.getState().twinStatus === "ready", { timeout: 60000 });
  await page.waitForSelector('[aria-label="Earth matches"] [data-match-target]');
  assert.equal(await page.$$eval("[data-match-target]", els => els.length), 2, "target appears on map and ranking");
  await choose(page, "New leads", '[aria-label="Earth matches"] [aria-label="Candidate origin"] button');
  await pause(300);
  const leads = await page.evaluate(() => window.__radium.getState().twin.candidates.filter(item => item.novel));
  const rows = await page.$$eval("[data-discovery-results]>li", els => els.map(el => el.dataset.newLead));
  assert.equal(rows.length, leads.length);
  assert(rows.every(value => value === "true"));
  if (leads[0]) {
    await page.evaluate(async candidate => { const st = window.__radium.getState(); st.flyTo("earth", candidate.lat, candidate.lon, 800); await st.pickEarth(candidate.lat, candidate.lon); }, leads[0]);
    await choose(page, "Add both to Compare");
    const ref = await page.evaluate(() => window.__radium.getState().compareList.find(site => site.body === "earth"));
    assert.equal(ref.newLead, true);
    assert(await page.$('[aria-label="Places to compare"] [data-new-lead="true"]'));
  }
  console.log("PASS New leads filter, target context and tray provenance");
  await page.evaluate(async () => {
    const st = window.__radium.getState(), site = st.pins.earth.find(pin => /atacama/i.test(pin.name));
    st.setMode("explore"); st.setBody("earth"); await st.select("earth", site.lat, site.lon);
  });
  await page.waitForSelector("[data-gallery-open]");
  await page.click("[data-gallery-open]");
  await page.waitForSelector("[data-gallery-viewer]");
  const external = await page.$$eval(".gallery-source-links a", links => links.map(link => link.href));
  assert(external.some(href => href.includes("google.com/maps/@?api=1&map_action=pano&viewpoint=")));
  assert(external.some(href => href.includes("google.com/maps/search/?api=1&query=")));
  await page.$eval(".gallery-image-wrap img", image => image.dispatchEvent(new Event("error")));
  await page.waitForSelector(".gallery-unavailable");
  assert.match(await page.$eval(".gallery-unavailable", element => element.textContent), /unavailable/i);
  assert(await page.$(".gallery-source-links a"), "source remains accessible when imagery fails");
  console.log("PASS Earth external context links and image failure fallback");
  await page.close();
  const mobile = await setup({ mobile: true });
  await mobile.waitForSelector("[data-gallery-open]");
  await mobile.click("[data-gallery-open]");
  await mobile.waitForSelector("[data-gallery-viewer]");
  await mobile.waitForFunction(() => document.querySelectorAll(".gallery-thumbnails button").length > 1, { timeout: 60000 });
  const client = await mobile.createCDPSession();
  const bounds = await mobile.$eval(".gallery-stage", el => { const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds.x + 70, y: bounds.y, id: 1 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bounds.x - 70, y: bounds.y, id: 1 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await pause(150);
  assert.match(await mobile.$eval(".gallery-counter", el => el.textContent), /^2 of /);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds.x - 25, y: bounds.y, id: 1 }, { x: bounds.x + 25, y: bounds.y, id: 2 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bounds.x - 65, y: bounds.y, id: 1 }, { x: bounds.x + 65, y: bounds.y, id: 2 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await pause(150);
  assert(Number.parseInt(await mobile.$eval(".gallery-zoom>span", el => el.textContent)) > 100, "pinch zoom changes image scale");
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "gallery fits mobile width");
  console.log("PASS mobile swipe, pinch and viewport fit");
  await mobile.close();
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
