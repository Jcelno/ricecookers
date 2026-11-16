/**
 * First-open experience, end to end against the running Vite and Python services.
 *   node tests/first-open.mjs        (npm run test:first-open)
 *
 * Proves: the first screen is the question chooser (no tutorial modal); a new visitor reaches a side-by-side
 * comparison in 3 clicks and under 30 s; no "0" or black screen while the data service wakes; the saved
 * example opens after 20 s; at most three coach marks, each once; the 20-second example drives the real
 * interface; Help is a searchable reference; reduced motion still gets every result.
 */
import assert from "node:assert/strict";
import puppeteer from "puppeteer";

const base = process.env.RADIUM_TEST_URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--enable-unsafe-swiftshader"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let passed = 0;

async function open({ url = base, width = 1440, height = 900, delayMeta = 0, reducedMotion = false, fresh = true } = {}) {
  const context = fresh ? await browser.createBrowserContext() : browser.defaultBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  page.on("pageerror", (e) => errors.push(e.message));
  if (delayMeta) {
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.url().includes("/api/meta")) setTimeout(() => void request.continue().catch(() => undefined), delayMeta);
      else void request.continue().catch(() => undefined);
    });
  }
  const started = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { page, context, started };
}
async function run(name, fn) {
  await fn();
  passed += 1;
  console.log("PASS", name);
}
const text = (page, selector) => page.$eval(selector, (el) => el.textContent.replace(/\s+/g, " ").trim());
const api = async (path, body) => (await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();

try {
  await run("First open shows the question chooser with real results, not a tutorial modal", async () => {
    const { page, context, started } = await open();
    await page.waitForSelector("[data-start-screen] h1", { timeout: 2000 });
    assert.ok(Date.now() - started < 2500, "the start screen paints within 2 s");
    assert.equal(await text(page, "[data-start-screen] h1"), "What do you want to find out?");
    assert.equal(await page.$('[role="dialog"]'), null, "no modal on first open");
    assert.deepEqual(await page.$$eval("[data-start-card]", (els) => els.map((el) => el.dataset.startCard)), ["moon", "mars", "near", "rank"]);
    assert.deepEqual(await page.$$eval("[data-start-card] .q-question", (els) => els.map((el) => el.textContent)), [
      "Where on Earth is most like the Moon?", "Where on Earth is most like Mars?", "What can a place near me stand in for?", "Where should we land or build?"]);
    // Each card's example is the live model's answer, not authored copy.
    const [moon, mars, rank, near] = await Promise.all([
      api("/api/twin", { body: "moon", lat: -89.45, lon: -137.31, purpose: "ice", n: 3 }),
      api("/api/twin", { body: "mars", lat: -4.59, lon: 137.44, purpose: "mobility", n: 3 }),
      api("/api/rank", { mission: "lunar_base", n: 3 }),
      api("/api/analogs/nearby", { lat: 36.17, lon: -115.14, radius_km: 1500, mode: "nearest", limit: 3 }),
    ]);
    const cards = await page.$$eval("[data-start-card]", (els) => els.map((el) => el.textContent.replace(/\s+/g, " ")));
    assert.ok(cards[0].includes(moon.candidates[0].score.toFixed(2)) && cards[0].includes(moon.candidates[0].place.label.split(",")[0]), cards[0]);
    assert.ok(cards[1].includes(mars.candidates[0].score.toFixed(2)) && cards[1].includes(mars.candidates[0].place.label.split(",")[0]), cards[1]);
    assert.ok(cards[2].includes(near.documented[0].name) && cards[2].includes(`${Math.round(near.documented[0].distance_km)} km`), cards[2]);
    assert.ok(cards[3].includes(`${rank.stats.grades.A} of ${rank.stats.cells.toLocaleString("en-US")}`), cards[3]);
    assert.ok(await page.$("[data-start-demo]") && await page.$("[data-start-skip]"), "example and skip links are offered");
    assert.equal(await page.evaluate(() => location.hash), "", "the start screen records no view in the address");
    // The three worlds are drawn from real imagery before any map engine is on screen.
    await page.waitForFunction(() => document.querySelectorAll('.orb[data-ready="true"]').length === 3, { timeout: 15000 });
    assert.equal(await page.$(".cesium-widget"), null, "no map engine is mounted behind the start screen");
    await page.click("[data-start-skip]");
    await page.waitForSelector('[data-tour="worlds"]', { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.__radium.getState().mode), "explore");
    await page.click('[data-tour="start-over"]');
    await page.waitForSelector("[data-start-screen]");
    await context.close();
  });

  await run("Three clicks from the start screen to a side-by-side comparison, under 30 s", async () => {
    const { page, context, started } = await open();
    await page.waitForSelector('[data-start-card="mars"]');
    await page.click('[data-start-card="mars"]');                                    // click 1: the question
    await page.waitForSelector('[data-famous-site="gale"]', { timeout: 60000 });
    assert.deepEqual(await page.$$eval("[data-famous-site]", (els) => els.map((el) => el.dataset.famousSite)), ["gale", "jezero", "arcadia"]);
    await page.click('[data-famous-site="gale"]');                                   // click 2: the site
    await page.waitForSelector('[data-purpose="mobility"]');
    // A purpose that does not apply stays visible, disabled, with the reason.
    await page.waitForSelector('[data-purpose="ice"][aria-disabled="true"]', { timeout: 30000 });
    assert.match(await text(page, '[data-purpose="ice"]'), /Not for this site/);
    assert.match(await text(page, '[data-purpose="mobility"]'), /^Test rover driving/);
    await page.click('[data-purpose="mobility"]');                                   // click 3: what to test
    await page.waitForSelector("[data-top3]", { timeout: 60000 });
    await page.waitForSelector('[data-cant-reproduce] [data-kind="cannot"]', { timeout: 30000 });
    const seconds = (Date.now() - started) / 1000;
    assert.ok(seconds < 30, `comparison reached in ${seconds.toFixed(1)} s`);
    // The comparison on screen: top three side by side, what matches, and what Earth cannot reproduce.
    assert.equal(await page.$$eval("[data-top3] thead th button", (els) => els.length), 3);
    const twin = await api("/api/twin", { body: "mars", lat: -4.59, lon: 137.44, purpose: "mobility", n: 10 });
    const d = twin.distribution, n = (v) => v.toLocaleString("en-US");
    assert.equal(await text(page, "[data-telemetry]"), `Compared ${n(d.cells)} / ${n(d.cells)} · ${n(d.grades.A)} grade A`, "telemetry comes from the response");
    assert.match(await text(page, "[data-selected]"), new RegExp(`${twin.candidates[0].place.label.replace(/[.]/g, "\\.")}.*score ${twin.candidates[0].score.toFixed(2)}`));
    assert.match(await text(page, "[data-selected]"), /none match better/i);
    assert.equal(await page.$$eval("[data-discovery-results] > li", (els) => els.length), twin.candidates.length);
    assert.ok(await page.$('[data-discovery-results] [data-new-lead="true"] .tag-lead'), "new leads are tagged");
    const chips = await page.$$eval("[data-cant-reproduce] [data-cond]", (els) => els.map((el) => `${el.dataset.cond}:${el.dataset.kind}`));
    assert.deepEqual(chips, ["gravity:cannot", "pressure:cannot", "radiation:cannot", "day_length:close"], "red chips for what Earth cannot reproduce, green for the Mars day");
    assert.match(await text(page, '[data-cond="gravity"]'), /3\.71 vs 9\.81 m\/s².*2\.6×/);
    // Numbered pins for the top matches; the letter keeps the grade readable without colour.
    await page.waitForFunction((count) => document.querySelectorAll(".radium-rank-pin").length === count, { timeout: 30000 }, twin.candidates.length);
    assert.equal(await page.$eval('.radium-rank-pin[data-rank="1"] .radium-rank-grade', (el) => el.textContent), twin.candidates[0].grade);
    assert.equal(await page.$('.radium-map-marker[data-cluster="true"]'), null, "ranked pins never fold into count clusters");
    // The step rail shows both choices with a check, and reopens a step on click.
    assert.deepEqual(await page.$$eval("[data-step-head]", (els) => els.map((el) => el.dataset.state)), ["done", "done", "open"]);
    assert.match(await text(page, '[data-step-head="1"]'), /Gale crater \(Curiosity\)/);
    assert.match(await text(page, '[data-step-head="2"]'), /Test rover driving/);
    // One more click opens the full comparison with every condition, its numbers and how to make up the difference.
    await page.click("[data-compare-open]");
    await page.waitForSelector("[data-pair]");
    await page.waitForSelector("[data-condition-bars] [data-remedy]");
    assert.deepEqual(await page.$$eval("[data-condition-bars] [data-remedy]", (els) => els.map((el) => el.textContent)),
      ["Needs reduced-gravity offloading", "Needs a low-pressure chamber", "Needs radiation testing in a laboratory", "Cannot be removed in the field", "Matches"]);
    assert.match(await text(page, '[data-condition-bars] [data-cond="radiation"]'), /Hassler et al\. 2014.*does not score it/);
    // Going back keeps the results; reopening step 2 offers the purposes again.
    await page.evaluate(() => window.__radium.getState().setMode("twin"));
    await page.waitForSelector("[data-top3]");
    await page.click('[data-step-head="2"]');
    await page.waitForSelector('[data-purpose="dust"]');
    await context.close();
  });

  await run("At most three coach marks on the path, each shown once", async () => {
    const { page, context } = await open();
    const walk = async () => {
      await page.waitForSelector('[data-start-card="mars"]');
      await page.click('[data-start-card="mars"]');
      await page.waitForSelector('[data-famous-site="gale"]', { timeout: 60000 });
      await page.click('[data-famous-site="gale"]');
      await page.waitForSelector('[data-purpose="mobility"]');
      await page.click('[data-purpose="mobility"]');
      await page.waitForSelector("[data-top3]", { timeout: 60000 });
    };
    await walk();
    const seen = [];
    const next = async (id, textMatch) => {
      await page.waitForSelector(`[data-coach-mark="${id}"] .coach-ok`, { visible: true, timeout: 15000 });
      assert.match(await text(page, "[data-coach-mark] p"), textMatch);
      assert.equal(await page.$$eval("[data-coach-mark]", (els) => els.length), 1, "one tip at a time");
      seen.push(id);
      await page.click("[data-coach-mark] .coach-ok");
    };
    await next("grades", /^Grades compare places for this purpose only\. A = 0\.80 or higher\.$/);
    await next("new-lead", /^Not in our list of documented analog sites\. This is a candidate to verify\.$/);
    await page.click("[data-compare-open]");
    await next("compare", /^Red chips are conditions no place on Earth can reproduce\.$/);
    assert.deepEqual(seen, ["grades", "new-lead", "compare"]);
    // A second pass through the same path shows none of them again.
    await page.click('[data-tour="start-over"]');
    await walk();
    await sleep(2500);
    assert.equal(await page.$("[data-coach-mark]"), null, "tips are never shown twice");
    await page.click("[data-compare-open]");
    await page.waitForSelector("[data-pair]");
    await sleep(2000);
    assert.equal(await page.$("[data-coach-mark]"), null);
    await context.close();
  });

  await run("While the data service wakes: shell at once, no zero counts, honest wake-up message", async () => {
    const { page, context, started } = await open({ url: `${base}/#v=2&m=mission&b=moon&mi=lunar_base`, delayMeta: 7000 });
    await page.waitForSelector(".app-header", { timeout: 2000 });
    await page.waitForSelector("[data-boot-panel]", { timeout: 2000 });
    assert.ok(Date.now() - started < 2500, "the page shell is on screen within 2 s of a cold deep link");
    assert.equal(await text(page, "[data-site-count]"), "–", "a count that has not loaded shows a dash, never 0");
    assert.equal(await page.evaluate(() => /(^|\D)0 (sites|on the Moon)/.test(document.body.textContent)), false);
    assert.match(await text(page, "[data-boot-panel]"), /Loading the Moon, Mars and Earth data/);
    await page.waitForFunction(() => document.querySelector("[data-boot-panel]")?.textContent.includes("Waking up the data service, usually under 15 seconds"), { timeout: 6000 });
    const waited = (Date.now() - started) / 1000;
    assert.ok(waited >= 3.5 && waited < 6.5, `wake-up message appears after about 4 s (${waited.toFixed(1)} s)`);
    await page.waitForSelector('[aria-label="Mission panel"]', { timeout: 60000 });
    assert.equal(await page.$("[data-boot-panel]"), null);
    assert.equal(await page.evaluate(() => window.__radium.getState().mode), "mission", "the deep link is restored once data arrives");
    await page.waitForFunction(() => /^\d+$/.test(document.querySelector("[data-site-count]").textContent.trim()), { timeout: 30000 });
    await context.close();
  });

  await run("After 20 s without an answer the saved example opens, labelled, and yields to live data", async () => {
    const { page, context, started } = await open({ delayMeta: 24000 });
    await page.waitForSelector("[data-start-screen]");
    await page.click('[data-start-card="mars"]');
    await page.waitForSelector("[data-boot-panel]");
    await page.waitForSelector("[data-saved-example]", { timeout: 24000 });
    const waited = (Date.now() - started) / 1000;
    assert.ok(waited >= 19 && waited < 23.5, `saved example opens at about 20 s (${waited.toFixed(1)} s)`);
    assert.match(await text(page, "[data-saved-example]"), /Saved example, not live analysis/);
    await page.waitForFunction(() => document.querySelector("[data-saved-example]")?.textContent.includes("Live data is ready"), { timeout: 20000 });
    await page.evaluate(() => [...document.querySelectorAll("[data-saved-example] button")].find((b) => b.textContent.includes("Open the live app")).click());
    await page.waitForSelector('[data-famous-site="gale"]', { timeout: 60000 });
    await context.close();
  });

  await run("The 20-second example drives the real interface with captions of 12 words or fewer", async () => {
    const { page, context } = await open();
    await page.waitForSelector("[data-start-demo]");
    const began = Date.now();
    await page.click("[data-start-demo]");
    const captions = [];
    while (Date.now() - began < 45000) {
      const state = await page.evaluate(() => { const el = document.querySelector("[data-demo]"); return el ? { caption: el.querySelector("[data-demo-caption]").textContent, done: el.dataset.demoDone } : null; });
      if (state && captions.at(-1) !== state.caption) captions.push(state.caption);
      if (state?.done === "true") break;
      await sleep(100);
    }
    const seconds = (Date.now() - began) / 1000;
    assert.ok(seconds > 15 && seconds < 30, `walkthrough took ${seconds.toFixed(1)} s`);
    assert.equal(captions.length, 7);
    for (const c of captions) assert.ok(c.split(/\s+/).length <= 12, `"${c}" has more than 12 words`);
    const s = await page.evaluate(() => { const st = window.__radium.getState(); return { mode: st.mode, purpose: st.purpose, top: st.twin?.candidates[0], pair: st.compare?.earth.place.label, origin: st.twinOrigin }; });
    assert.equal(s.mode, "compare");
    assert.equal(s.purpose, "mobility");
    assert.deepEqual([s.origin.body, s.origin.lat, s.origin.lon], ["mars", -4.59, 137.44]);
    assert.equal(s.pair, s.top.place.label, "it compares the live top match");
    assert.ok(captions[3].includes(s.top.place.label.split(",")[0]) && captions[3].includes(s.top.score.toFixed(2)), "the answer caption is written from the response");
    assert.ok(await page.$("[data-condition-bars]"));
    assert.equal(await page.$("[data-coach-mark]"), null, "no coach marks during the example");
    // It can be skipped at any moment.
    await page.click('[data-tour="start-over"]');
    await page.click("[data-start-demo]");
    await page.waitForSelector("[data-demo-skip]");
    await sleep(1200);
    await page.click("[data-demo-skip]");
    await page.waitForFunction(() => !document.querySelector("[data-demo]"));
    await context.close();
  });

  await run("Help is a searchable reference grouped by task; Findings are checked against the live model", async () => {
    const { page, context } = await open();
    await page.waitForSelector("[data-start-screen]");
    await page.evaluate(() => [...document.querySelectorAll(".start-link")].find((b) => b.textContent.includes("Help")).click());
    await page.waitForSelector("[data-help]");
    assert.deepEqual(await page.$$eval("[data-help-group] h3", (els) => els.map((el) => el.textContent)), ["Find twins", "Rank sites", "Read the evidence", "Save and share"]);
    assert.equal(await page.$$eval("[data-help-topic]", (els) => els.length), 32);
    await page.type('[aria-label="Search the field guide"]', "grade");
    const hits = await page.$$eval("[data-help-topic]", (els) => els.length);
    assert.ok(hits > 0 && hits < 32);
    assert.match(await text(page, "[data-help-count]"), new RegExp(`^${hits} of 32 topics match$`));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-help]"));
    await page.evaluate(() => [...document.querySelectorAll(".start-link")].find((b) => b.textContent.includes("Findings")).click());
    await page.waitForSelector("[data-findings]");
    assert.equal(await page.$$eval("[data-finding]", (els) => els.length), 5);
    await page.waitForFunction(() => document.querySelectorAll('[data-finding] [data-check="same"]').length === 5, { timeout: 60000 });
    assert.equal(await page.$('[data-finding] [data-check="different"]'), null, "every saved finding reproduces live");
    // A finding opens as a live view from its deep link.
    await page.evaluate(() => document.querySelector('[data-finding="ridge-ice"] .finding-open').click());
    await page.waitForSelector("[data-top3]", { timeout: 60000 });
    const st = await page.evaluate(() => { const s = window.__radium.getState(); return { body: s.twinOrigin.body, purpose: s.purpose, top: s.twin.candidates[0].place.label, hash: location.hash }; });
    assert.deepEqual([st.body, st.purpose], ["moon", "ice"]);
    assert.match(st.top, /^Karakoram/);
    await context.close();
  });

  await run("Reduced motion and a phone both reach the same results", async () => {
    const { page, context } = await open({ reducedMotion: true, width: 390, height: 844 });
    await page.waitForSelector('[data-start-card="moon"]');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "start screen fits a phone");
    await page.click('[data-start-card="moon"]');
    await page.waitForSelector('[data-famous-site="shackleton-ridge"]', { timeout: 60000 });
    await page.click('[data-famous-site="shackleton-ridge"]');
    await page.waitForSelector('[data-purpose="ice"]');
    await page.click('[data-purpose="ice"]');
    await page.waitForSelector("[data-top3]", { timeout: 60000 });
    await page.waitForSelector("[data-selected]", { timeout: 30000 });
    assert.match(await text(page, "[data-selected]"), /Karakoram/);
    await page.waitForSelector('[data-cant-reproduce] [data-cond="temperature"]', { timeout: 30000 });
    assert.deepEqual(await page.$$eval("[data-cant-reproduce] [data-cond]", (els) => els.map((el) => el.dataset.kind)), ["cannot", "cannot", "cannot", "cannot", "cannot"], "nothing about the Moon matches Earth");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "results fit a phone");
    await context.close();
  });

  assert.deepEqual(errors, [], "no uncaught browser errors");
  console.log(`${passed} first-open checks passed.`);
} finally {
  await browser.close();
}
