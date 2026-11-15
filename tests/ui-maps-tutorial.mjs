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
  await page.goto(process.env.RADIUM_TEST_URL ?? "http://localhost:3000", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector('[data-tour="help"]', { timeout: 60000 });
  const unit = await page.evaluate(async () => {
    const { clusterPoints, sphericalCenter, markerButton } =
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
  await page.click('[data-tour="help"]');
  await page.waitForSelector("#tutorial-title");
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.includes("Complete field guide"))
      .click(),
  );
  await page.click('[data-tour="nav-explore"]');
  await page.waitForFunction(() =>
    document.body.textContent.includes("Control explored"),
  );
  await page.click('[aria-label="Choose tutorial topic"]');
  await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent.includes("Adjust priorities and limits"))
      .click(),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent.includes("Show the controls"))
      .click(),
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-mission-step="2"]')
        ?.getAttribute("aria-current") === "step" ||
      document
        .querySelector('[data-mission-step="2"]')
        ?.getAttribute("aria-selected") === "true",
  );
  await page.screenshot({
    path: "temporary screenshots/tutorial-priorities-qa.png",
  });
  await page.click('[aria-label="Close tutorial"]');
  await page.click('[data-tour="help"]');
  const resume = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) =>
      b.textContent.includes("Resume: Adjust priorities"),
    ),
  );
  assert(resume, "tutorial resumes last topic");
  await page.click('[aria-label="Close tutorial"]');
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
    "PASS tutorial real controls, mission step and resume; Earth marker accessibility",
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
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.includes("Quick start"))
      .click(),
  );
  await page.screenshot({
    path: "temporary screenshots/tutorial-mobile-qa.png",
  });
  const fits = await page.evaluate(() => {
    const r = document.querySelector('[role="dialog"]').getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });
  assert(fits, "tutorial stays within mobile viewport");
  assert.deepEqual(errors, [], "no uncaught browser errors");
  console.log("PASS mobile tutorial fit; no uncaught errors");
} finally {
  await browser.close();
}
