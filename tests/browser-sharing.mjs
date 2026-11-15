/** Adversarial URL tests against Vite: node tests/browser-sharing.mjs */
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
const base = process.env.RADIUM_TEST_URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto(`${base}/#m=saved`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      window.__radium?.getState().meta &&
      window.__radium.getState().pins.moon.length,
    { timeout: 60000 },
  );
  // Read the same module URL as the running App so Vite HMR cannot create a second store instance.
  const output = await page.evaluate(async () => {
    const module = await import("/src/lib/deeplink.ts");
    const store = window.__radium;
    const s = store.getState();
    s.setMode("saved");
    store.setState({
      body: "moon",
      advanced: true,
      compareTab: "sites",
      units: "km",
      tempUnit: "C",
      gradeFilter: [],
      twinOrigin: { body: "mars", lat: -4.58951234, lon: 137.44171234 },
      purpose: "mobility",
      twinWeights: { terrain: 80.25, geology: 19.75 },
      compareList: [
        {
          body: "moon",
          lat: 0.67416,
          lon: 23.47314,
          label: "Name; with, punctuation & spaces",
        },
        { body: "earth", lat: 75.383, lon: -89.667, label: "Haughton" },
      ],
      nearLoc: { lat: 36.17123456, lon: -115.14123456, source: "device" },
    });
    const layer = s.meta.layers.moon.grid.find((l) => l.legend);
    s.setLayer("moon", {
      overlay: { id: layer.id, kind: "grid" },
      opacity: 0.37,
      labels: false,
      pins: { analog: false, landing: true, feature: false },
    });
    const link = module.currentLink();
    store.setState({
      advanced: false,
      compareList: [],
      twinWeights: null,
      twinOrigin: null,
      purpose: "general",
    });
    module.applyLink(new URL(link).hash);
    const restored = store.getState();
    const result = {
      link,
      mode: restored.mode,
      target: restored.twinOrigin,
      weights: restored.twinWeights,
      purpose: restored.purpose,
      list: restored.compareList,
      advanced: restored.advanced,
      grades: restored.gradeFilter,
      layer: restored.layers.moon,
      temp: restored.tempUnit,
    };
    module.applyLink(
      "#m=saved&b=earth&s=NaN,Infinity&t=mars,91,0&tw=terrain:200;__proto__:10;geology:NaN&cl2=" +
        encodeURIComponent(
          JSON.stringify([
            null,
            { body: "moon", lat: "0", lon: 0, label: "bad" },
            { body: "moon", lat: 0, lon: 0, label: "valid" },
          ]),
        ),
    );
    const bad = store.getState();
    const invalid = {
      selection: bad.selection,
      target: bad.twinOrigin,
      weights: bad.twinWeights,
      list: bad.compareList,
      mode: bad.mode,
    };
    module.applyLink(
      "#m=saved&b=mars&cl=moon,0.67416,23.47314,Apollo%2011;earth,75.383,-89.667,Haughton",
    );
    const legacy = store.getState().compareList;
    module.applyLink("#m=saved&s=,0&t=mars,,0");
    const emptyCoordinates = {
      target: store.getState().twinOrigin,
      selection: store.getState().selection,
    };
    return { result, invalid, legacy, emptyCoordinates };
  });
  const { result, invalid, legacy, emptyCoordinates } = output;
  assert.equal(result.mode, "saved");
  assert.deepEqual(result.target, {
    body: "mars",
    lat: -4.58951234,
    lon: 137.44171234,
  });
  assert.deepEqual(result.weights, { terrain: 80.25, geology: 19.75 });
  assert.equal(result.purpose, "mobility");
  assert.equal(result.advanced, true);
  assert.equal(result.list[0].label, "Name; with, punctuation & spaces");
  assert.equal(result.list[0].lat, 0.67416);
  assert.deepEqual(result.grades, []);
  assert.equal(result.temp, "C");
  assert.equal(result.layer.opacity, 0.37);
  assert.equal(result.layer.labels, false);
  assert.equal(result.layer.pins.feature, false);
  assert.equal(result.layer.overlay.kind, "grid");
  assert.ok(
    !result.link.includes("36.17123456") &&
      !result.link.includes("115.14123456"),
    "device position must never be shared",
  );
  assert.deepEqual(invalid, {
    selection: null,
    target: null,
    weights: null,
    list: [{ body: "moon", lat: 0, lon: 0, label: "valid" }],
    mode: "saved",
  });
  assert.equal(legacy.length, 2);
  assert.equal(legacy[0].label, "Apollo 11");
  assert.deepEqual(emptyCoordinates, { target: null, selection: null });
  await page.evaluate(() => {
    location.hash = "m=saved&b=mars&adv=1";
  });
  await page.waitForFunction(
    () =>
      window.__radium.getState().body === "mars" &&
      window.__radium.getState().advanced === true,
  );
  const transitions = await page.evaluate(async () => {
    const store = window.__radium;
    const original = {
      runTwin: store.getState().runTwin,
      select: store.getState().select,
      runRank: store.getState().runRank,
    };
    let ranked = null;
    store.setState({
      runTwin: async () => {},
      runRank: async () => {
        const s = store.getState();
        ranked = {
          mission: s.missionId,
          weights: s.rawWeights[s.missionId],
          limits: s.limitsOn[s.missionId],
        };
      },
      select: async (body, lat, lon) => {
        store.setState({ selection: { body, lat, lon } });
      },
      mode: "explore",
      selection: { body: "moon", lat: 0.67416, lon: 23.47314 },
      twinOrigin: { body: "mars", lat: -4.59, lon: 137.44 },
    });
    store.getState().startTwin();
    const fromExplore = store.getState().twinOrigin;
    store.setState({
      mode: "near",
      selection: { body: "mars", lat: 20, lon: 30 },
    });
    store.getState().startTwin();
    const withinAnalogs = store.getState().twinOrigin;
    const mission = store
      .getState()
      .meta.missions.find((m) => m.body === "mars");
    const weights = Object.fromEntries(
      mission.criteria.map((c, i) => [c.id, i === 0 ? 90 : 10]),
    );
    const site = {
      body: "mars",
      lat: -4.5895123,
      lon: 137.4417123,
      label: "Precise destination",
    };
    store.setState({
      mode: "saved",
      saved: {
        ...store.getState().saved,
        missions: [
          {
            id: "test-mission",
            name: "Restoration test",
            mission: mission.id,
            weights,
            limits: [],
            site,
            created: "2026-11-14",
          },
        ],
      },
    });
    await store.getState().openSaved("missions", 0);
    const restoredMission = {
      mode: store.getState().mode,
      body: store.getState().body,
      selection: store.getState().selection,
      ranked,
      expectedWeights: weights,
    };
    store.setState({ ...original, mode: "saved" });
    const { api } = await import("/src/lib/api.ts");
    const originalCell = api.cell;
    const delayedCell = {
      body: "moon",
      cell: { lat: 0.75, lon: 23.75 },
      groups: [],
      place: { label: "Old response" },
    };
    api.cell = () =>
      new Promise((resolve) => setTimeout(() => resolve(delayedCell), 30));
    store.setState({ body: "moon", mode: "saved", cell: null });
    const pending = store.getState().select("moon", 0.67416, 23.47314);
    store.getState().setBody("mars");
    await pending;
    const switched = {
      body: store.getState().body,
      cell: store.getState().cell,
      selection: store.getState().selection,
    };
    api.cell = originalCell;
    store.getState().setMode("saved");
    return { fromExplore, withinAnalogs, restoredMission, switched };
  });
  assert.deepEqual(transitions.fromExplore, {
    body: "moon",
    lat: 0.67416,
    lon: 23.47314,
  });
  assert.deepEqual(transitions.withinAnalogs, transitions.fromExplore);
  assert.equal(transitions.restoredMission.mode, "mission");
  assert.equal(transitions.restoredMission.body, "mars");
  assert.equal(transitions.restoredMission.selection.lat, -4.5895123);
  assert.deepEqual(
    transitions.restoredMission.ranked.weights,
    transitions.restoredMission.expectedWeights,
  );
  assert.deepEqual(transitions.restoredMission.ranked.limits, []);
  assert.deepEqual(transitions.switched, {
    body: "mars",
    cell: null,
    selection: null,
  });
  console.log(
    "PASS mission restoration preserves precise destination, weights and disabled limits; analog navigation preserves intended targets; canceled old-world cell response is discarded.",
  );
  console.log(
    "PASS share-state round trip, precision, custom weights, layer controls, empty filters, malformed coordinates, untrusted weights, historical links, and hash navigation; private Near Me position excluded.",
  );
} finally {
  await browser.close();
}
