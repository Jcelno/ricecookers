import assert from "node:assert/strict";
import puppeteer from "puppeteer";
const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--use-angle=metal",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // ?tour=0 opens the app directly; the start screen is covered by tests/first-open.mjs.
  await page.goto(`${process.env.RADIUM_TEST_URL ?? "http://localhost:3000"}/?tour=0`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector('[data-tour="help"]', { timeout: 60000 });
  const unit = await page.evaluate(async () => {
    const { clusterPoints, sphericalCenter, markerButton, placeFanMarkers } =
      await import("/src/lib/markers.ts");
    const { badgeFor } = await import("/src/lib/atlas.ts");
    const clustered = clusterPoints([
      { x: 5, y: 5 },
      { x: 15, y: 10 },
      { x: 16, y: 10, active: true },
      { x: 100, y: 100 },
    ]);
    const center = sphericalCenter([
      { lat: 5, lon: 179 },
      { lat: 5, lon: -179 },
    ]);
    const cluster = markerButton({
      text: "7",
      title: "7 locations",
      cluster: true,
    });
    const grade = markerButton({
      text: "A",
      title: "Similarity A",
      grade: "A",
    });
    const neutral = badgeFor(
      { name: "Research candidate", verification_status: "review_needed" },
      "grade",
      null,
      "mobility",
    );
    return {
      sizes: clustered.map((g) => g.length),
      center,
      cluster: cluster.dataset.cluster,
      clusterGrade: cluster.dataset.grade,
      grade: grade.dataset.grade,
      neutral,
      fan: placeFanMarkers(Array.from({ length: 20 }, (_, i) => ({ id: `pin-${i}`, x: 150, y: 130, priority: 20 - i })), 300, 200),
      edge: placeFanMarkers([{ id: "edge", x: 2, y: 2 }], 300, 200),
    };
  });
  assert.deepEqual(unit.sizes, [2, 1, 1]);
  assert(
    Math.abs(Math.abs(unit.center.lon) - 180) < 0.01,
    "dateline mean stays near dateline",
  );
  assert.equal(unit.cluster, "true");
  assert.equal(unit.clusterGrade, undefined);
  assert.equal(unit.grade, "A");
  assert.match(unit.neutral.title, /evidence review needed/);
  assert(!unit.neutral.title.includes("documented"));
  assert.equal(unit.fan[0].id, "pin-19", "best-ranked chip gets first choice");
  assert.equal(unit.fan[0].dx, 0, "best-ranked chip sits straight above its ground dot");
  assert(unit.fan.every(pin => pin.x === 150 && pin.y === 130), "fan placement never moves ground coordinates");
  const unfolded = unit.fan.filter(pin => !pin.folded);
  assert(unit.fan.some(pin => pin.folded), "overcrowded chips fold while their ground dots survive");
  for (const pin of unfolded) for (const other of unfolded) {
    if (pin.id === other.id) continue;
    assert(Math.abs(pin.dx - other.dx) >= (pin.width + other.width) / 2 || Math.abs(pin.dy - other.dy) >= (pin.height + other.height) / 2, "visible chips never overlap");
  }
  assert(unit.edge[0].folded, "a chip outside the viewport folds instead of clipping");
  console.log(
    "PASS marker clusters, active selection, dateline and evidence status",
  );
  await page.waitForFunction(
    () => {
      const v = window.__cesium;
      return (
        v &&
        !v.isDestroyed() &&
        v.dataSources.length &&
        v.dataSources.get(0).clustering._clusterBillboardCollection?.length > 0
      );
    },
    { timeout: 60000 },
  );
  // The globe now mounts after the catalogue has loaded, so clusters exist from its first frame.
  // Let the first frames settle before reading a cluster's screen position.
  await new Promise((r) => setTimeout(r, 2000));
  const globeCluster = await page.evaluate(() => {
    const v = window.__cesium,
      collection = v.dataSources.get(0).clustering._clusterBillboardCollection;
    const r = v.scene.canvas.getBoundingClientRect();
    for (let i = 0; i < collection.length; i++) {
      const b = collection.get(i),
        p = b.computeScreenSpacePosition(v.scene);
      if (
        b.show &&
        p &&
        p.x > 80 &&
        p.y > 60 &&
        p.x < r.width - 80 &&
        p.y < r.height - 120
      )
        return {
          x: r.left + p.x,
          y: r.top + p.y,
          height: v.camera.positionCartographic.height,
        };
    }
    return null;
  });
  assert(globeCluster, "visible Moon cluster");
  await page.mouse.click(globeCluster.x, globeCluster.y);
  await page.waitForFunction(
    (h) => window.__cesium.camera.positionCartographic.height < h * 0.9,
    {},
    globeCluster.height,
  );
  console.log("PASS native globe cluster click zoom");
  // Help is a reference to search, not a tour: a topic's action opens the real control it describes.
  await page.click('[data-tour="help"]');
  await page.waitForSelector("[data-help]");
  assert.equal(await page.$$eval("[data-help-topic]", (els) => els.length), 32, "all 32 field-guide topics are kept");
  assert.equal(await page.$$eval("[data-help-group]", (els) => els.length), 4, "topics are grouped by task");
  assert.equal(await page.$("[data-tour-welcome]"), null, "no tour modal");
  await page.evaluate(() =>
    [...document.querySelectorAll('[data-help-topic="choose-destination"] button')]
      .find((b) => b.textContent.includes("Rank Landing Sites"))
      .click(),
  );
  await page.waitForFunction(() => window.__radium.getState().mode === "mission" && !document.querySelector("[data-help]"));
  await page.waitForSelector('[data-mission-step-id="mission"]');
  await page.screenshot({ path: "temporary screenshots/help-rank-qa.png" });
  await page.click('[data-tour="nav-explore"]');
  await page.evaluate(() =>
    [...document.querySelectorAll('[data-tour="worlds"] button')]
      .find((b) => b.textContent.includes("Earth"))
      .click(),
  );
  await page.waitForSelector(".radium-map-marker", { timeout: 60000 });
  const earth = await page.evaluate(() => {
    const marks = [...document.querySelectorAll(".radium-map-marker")];
    return {
      count: marks.length,
      clusters: marks.filter((m) => m.dataset.cluster).length,
      labels: marks.every((m) => m.getAttribute("aria-label")),
      circular: marks.every((m) => m.style.borderRadius === "50%"),
    };
  });
  assert(earth.count > 0 && earth.labels && earth.circular);
  console.log(
    "PASS help reference opens real controls; Earth marker accessibility",
    earth,
  );
  const cluster = await page.$('.radium-map-marker[data-cluster="true"]');
  if (cluster) {
    const before = await page.evaluate(() => window.__maplibre.getZoom());
    await cluster.click();
    await page.waitForFunction(
      (z) => window.__maplibre.getZoom() > z,
      {},
      before,
    );
    console.log("PASS Earth cluster click zoom");
  }
  await page.setViewport({ width: 390, height: 844 });
  await page.click('[data-tour="help"]');
  await page.waitForSelector("[data-help]");
  await new Promise((r) => setTimeout(r, 500)); // the sheet rises 14 px as it opens
  await page.screenshot({
    path: "temporary screenshots/help-mobile-qa.png",
  });
  const fits = await page.evaluate(() => {
    const r = document.querySelector('[role="dialog"]').getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
  });
  assert(fits, "help stays within the phone viewport");
  assert.deepEqual(errors, [], "no uncaught browser errors");
  console.log("PASS mobile help fit; no uncaught errors");
} finally {
  await browser.close();
}
