/** End-to-end checks against the running Vite and Python services. Run npm run test:browser. */
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
const base = process.env.RADIUM_TEST_URL || "http://localhost:3000";
const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--use-angle=metal",
    "--enable-unsafe-swiftshader",
  ],
});
const results = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !!document.querySelector('[data-tour="nav-explore"]'),
    { timeout: 60000 },
  );
  await page.evaluate(async () => {
    window.radium = window.__radium;
  });
  const ready = () =>
    page.waitForFunction(() => window.radium.getState().pins.earth.length > 0);
  await ready();
  const run = async (name, fn) => {
    await fn();
    results.push(name);
    console.log("PASS", name);
  };
  await run(
    "Four primary workspaces and connected analog navigation",
    async () => {
      assert.deepEqual(
        await page.$$eval(
          'nav[aria-label="Primary navigation"] button',
          (els) => els.map((e) => e.textContent),
        ),
        ["Explore", "Mission Planner", "Earth Analogs", "Saved"],
      );
      await page.click('[data-tour="nav-twin"]');
      assert.deepEqual(
        await page.$$eval(
          'nav[aria-label="Earth Analogs workspace"] button',
          (els) => els.map((e) => e.textContent),
        ),
        ["Discover", "Compare", "Near Me"],
      );
    },
  );
  await run("Catalog supports every curated record and sources", async () => {
    await page.click('[data-tour="catalog-button"]');
    await page.waitForSelector('[data-tour="catalog"]');
    const count = await page.evaluate(() =>
      Object.values(window.radium.getState().pins).reduce(
        (n, p) => n + p.length,
        0,
      ),
    );
    assert.equal(
      await page.$$eval(".catalog-card", (els) => els.length),
      count,
    );
    await page.type('[aria-label="Search research sites"]', "Apollo 11");
    assert.ok(
      await page.$$eval(".catalog-card", (els) =>
        els.some((e) => e.textContent.includes("Apollo 11")),
      ),
    );
    await page.keyboard.press("Escape");
  });
  await run(
    "Precise curated coordinates, duplicate saves, and source context",
    async () => {
      const output = await page.evaluate(async () => {
        const s = window.radium.getState();
        const p = s.pins.moon.find((p) => p.name.includes("Apollo 11"));
        s.setMode("explore");
        s.setBody("moon");
        await s.select("moon", p.lat, p.lon);
        s.saveSite({ body: "moon", lat: p.lat, lon: p.lon, label: p.name });
        s.saveSite({ body: "moon", lat: p.lat, lon: p.lon, label: p.name });
        const saved = window.radium.getState().saved.sites;
        return { count: saved.length, site: saved[0], pin: p };
      });
      assert.equal(output.count, 1);
      assert.equal(output.site.lat, output.pin.lat);
      assert.equal(output.site.lon, output.pin.lon);
      assert.ok(JSON.stringify(output.site).includes("http"));
    },
  );
  await run(
    "All three maps mount and selections load real measurements",
    async () => {
      for (const body of ["moon", "mars", "earth"]) {
        await page.evaluate(async (body) => {
          const s = window.radium.getState();
          s.setBody(body);
          const p = s.pins[body][0];
          await s.select(body, p.lat, p.lon);
        }, body);
        assert.equal(
          await page.evaluate(() => window.radium.getState().cellStatus),
          "ready",
        );
        await page.waitForSelector(
          body === "earth" ? ".maplibregl-canvas" : ".cesium-widget canvas",
          { timeout: 45000 },
        );
        assert.ok(
          await page.evaluate(
            () => window.radium.getState().cell.groups.length > 0,
          ),
        );
      }
    },
  );
  await run(
    "Failed comparison request cannot shift values into another site column",
    async () => {
      await page.evaluate(() => {
        const s = window.radium.getState();
        window.originalFetch = window.fetch;
        window.fetch = (url, options) =>
          String(url).includes("/api/cell?") &&
          String(url).includes("lat=12.345")
            ? Promise.resolve(
                new Response(
                  JSON.stringify({ detail: "Intentional test failure" }),
                  {
                    status: 503,
                    headers: { "content-type": "application/json" },
                  },
                ),
              )
            : window.originalFetch(url, options);
        s.clearCompare();
        s.addCompare({
          body: "mars",
          lat: 12.345,
          lon: 30,
          label: "Unavailable test site",
        });
        s.addCompare({
          body: "mars",
          lat: -4.5895,
          lon: 137.4417,
          label: "Gale comparison",
        });
        s.setMode("compare");
      });
      await page.waitForFunction(() =>
        document.body.textContent.includes("Intentional test failure"),
      );
      await page.waitForSelector("table tbody tr td:nth-child(3)");
      const cells = await page.$$eval("table tbody tr:first-child td", (els) =>
        els.map((e) => e.textContent),
      );
      assert.equal(cells[1], "not measured");
      assert.notEqual(cells[2], "not measured");
      await page.evaluate(() => {
        window.fetch = window.originalFetch;
        window.radium.getState().clearCompare();
      });
    },
  );
  await run(
    "Canceled requests preserve AbortError and the latest selection",
    async () => {
      const aborted = await page.evaluate(async () => {
        const { api } = await import("/src/lib/api.ts");
        const ac = new AbortController();
        const p = api.cell("mars", 0, 0, {}, ac.signal);
        ac.abort();
        try {
          await p;
          return "resolved";
        } catch (e) {
          return e.name;
        }
      });
      assert.equal(aborted, "AbortError");
      await page.evaluate(async () => {
        const s = window.radium.getState();
        s.setBody("mars");
        await Promise.all([
          s.select("mars", 10, 20),
          s.select("mars", -4.5895, 137.4417),
        ]);
      });
      assert.equal(
        await page.evaluate(() => window.radium.getState().cellStatus),
        "ready",
      );
      assert.equal(
        await page.evaluate(() => window.radium.getState().selection.lat),
        -4.5895,
      );
    },
  );
  await run(
    "Shared target and real comparison across Discover, Compare and Near Me",
    async () => {
      await page.evaluate(() => {
        const s = window.radium.getState();
        const p = s.pins.mars.find((p) => p.name.includes("Curiosity"));
        s.startTwin({
          body: "mars",
          lat: p?.lat ?? -4.5895,
          lon: p?.lon ?? 137.4417,
        });
        s.setPurpose("mobility");
      });
      await page.waitForFunction(
        () => window.radium.getState().twinStatus === "ready",
        { timeout: 90000 },
      );
      await page.evaluate(async () => {
        const s = window.radium.getState();
        const p = s.pins.earth[0];
        await s.pickEarth(p.lat, p.lon);
        s.setMode("compare");
      });
      await page.waitForFunction(
        () => window.radium.getState().compareStatus === "ready",
        { timeout: 60000 },
      );
      const pair = await page.evaluate(() => {
        const s = window.radium.getState();
        s.saveComparison("Browser comparison", "pair");
        const before = { ...s.twinOrigin };
        s.setMode("near");
        s.setNear({
          nearLoc: { lat: 36.17, lon: -115.14, source: "manual" },
          nearRadius: 20015,
        });
        return {
          before,
          after: window.radium.getState().twinOrigin,
          grade: s.compare.match.grade,
          score: s.compare.match.score,
        };
      });
      assert.deepEqual(pair.before, pair.after);
      assert.ok(["A", "B", "C", "D", "F", null].includes(pair.grade));
      await page.waitForFunction(
        () => window.radium.getState().nearStatus === "ready",
        { timeout: 90000 },
      );
      assert.ok(
        await page.evaluate(
          () => window.radium.getState().nearResult.documented.length > 0,
        ),
      );
    },
  );
  await run(
    "Share link restores purpose and weights without private Near Me location",
    async () => {
      const link = await page.evaluate(async () => {
        const s = window.radium.getState();
        s.setMode("compare");
        s.setTwinWeights({ terrain: 80, geology: 20 });
        return (await import("/src/lib/deeplink.ts")).currentLink();
      });
      assert.ok(!link.includes("36.17"));
      assert.ok(!link.includes("-115.14"));
      await page.goto(link, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => !!document.querySelector('[data-tour="nav-explore"]'),
        { timeout: 60000 },
      );
      await page.evaluate(async () => {
        window.radium = window.__radium;
      });
      await page.waitForFunction(
        () => window.radium.getState().compareStatus === "ready",
        { timeout: 90000 },
      );
      assert.equal(
        await page.evaluate(() => window.radium.getState().purpose),
        "mobility",
      );
      assert.deepEqual(
        await page.evaluate(() => window.radium.getState().twinWeights),
        { terrain: 80, geology: 20 },
      );
    },
  );
  await run(
    "Saved records survive reload; rename and reopen keep context",
    async () => {
      const state = await page.evaluate(() => {
        const s = window.radium.getState();
        s.renameSaved("sites", 0, "My lunar field study");
        return {
          places: s.saved.sites.length,
          pairs: s.saved.comparisons.length,
        };
      });
      assert.equal(state.places, 1);
      assert.equal(state.pairs, 1);
      await page.click('[data-tour="nav-saved"]');
      await page.waitForFunction(() =>
        document.body.textContent.includes("My lunar field study"),
      );
      await page.evaluate(() =>
        window.radium.getState().openSaved("comparisons", 0),
      );
      await page.waitForFunction(
        () => window.radium.getState().compareStatus === "ready",
        { timeout: 60000 },
      );
      assert.equal(
        await page.evaluate(() => window.radium.getState().mode),
        "compare",
      );
    },
  );
  await run(
    "Copy confirmation is visible; failure offers selectable URL",
    async () => {
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text) => {
              window.copied = text;
            },
          },
        });
      });
      await page.click('[aria-label="Copy View Link"]');
      await page.waitForFunction(() =>
        document
          .querySelector('[aria-label="Copy View Link"]')
          .textContent.includes("Copied!"),
      );
      assert.ok(await page.evaluate(() => window.copied.includes("#")));
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async () => {
              throw Error("denied");
            },
          },
        });
        document.execCommand = () => false;
      });
      await page.click('[aria-label="Copy View Link"]');
      await page.waitForSelector('[aria-label="View link to copy manually"]');
    },
  );
  await run("Five-step mission planner computes and saves a plan", async () => {
    await page.evaluate(() => {
      const s = window.radium.getState();
      s.setMode("mission");
      s.setMission("mars_robotic");
    });
    await page.waitForFunction(
      () => window.radium.getState().rankStatus === "ready",
      { timeout: 90000 },
    );
    assert.equal(
      await page.$$eval('ol[aria-label="Steps"] li', (els) => els.length),
      5,
    );
    await page.evaluate(() =>
      window.radium.getState().saveMission("Browser mission"),
    );
    assert.equal(
      await page.evaluate(() => window.radium.getState().saved.missions.length),
      1,
    );
    const excluded = await page.evaluate(async () => {
      const s = window.radium.getState();
      s.setMission("mars_human");
      await s.select("mars", 70, 0);
      s.saveSite({
        body: "mars",
        lat: 70,
        lon: 0,
        label: "Excluded test site",
      });
      return window.radium.getState().saved.sites[0].context;
    });
    assert.equal(excluded.excluded, true);
    assert.equal(
      excluded.grade,
      null,
      "Hard-limit exclusions must not acquire a saved grade",
    );
  });
  await run("Mobile workspaces remain inside viewport", async () => {
    await page.setViewport({ width: 390, height: 844 });
    for (const mode of ["explore", "twin", "compare", "near", "saved"]) {
      await page.evaluate(
        (mode) => window.radium.getState().setMode(mode),
        mode,
      );
      await new Promise((r) => setTimeout(r, 500));
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${mode} overflows viewport`,
      );
      assert.equal(
        await page.$$eval(
          'nav[aria-label="Primary navigation"] button',
          (els) => els.length,
        ),
        4,
      );
    }
  });
  await run(
    "Malformed storage is rejected without preventing startup",
    async () => {
      await page.evaluate(() => {
        for (const k of Object.keys(localStorage))
          if (k.startsWith("radium.saved"))
            localStorage.setItem(
              k,
              '{"sites":[null,{"lat":"bad"}],"missions":[null],"comparisons":[null]}',
            );
      });
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-tour="nav-explore"]', {
        timeout: 60000,
      });
    },
  );
  assert.deepEqual(errors, [], "Unhandled browser exceptions");
  console.log(`${results.length} browser workflow checks passed.`);
} finally {
  await browser.close();
}
