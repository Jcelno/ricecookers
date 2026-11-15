import assert from "node:assert/strict";
import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${process.env.RADIUM_TEST_URL ?? "http://localhost:3000"}/?tour=0`);
  await page.waitForSelector('.mobile-sheet-handle', { visible: true });
  const handle = '.mobile-sheet-handle';
  const check = async expected => {
    const state = await page.$eval(handle, el => {
      const panel = el.closest("aside");
      return { value: +el.getAttribute("aria-valuenow"), ratio: panel.clientHeight / panel.parentElement.clientHeight * 100, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(state.value, expected);
    assert(Math.abs(state.ratio - expected) < 1, "the rendered panel matches its announced height");
    assert.equal(state.overflow, false);
  };
  await check(60);
  await page.focus(handle);
  for (const [key, expected] of [["Home", 25], ["ArrowUp", 60], ["End", 100], ["ArrowDown", 60]]) {
    await page.keyboard.press(key);
    await check(expected);
  }
  const rect = await page.$eval(handle, el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(rect.x, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.x, 170, { steps: 12 });
  await page.mouse.up();
  await check(100);
  assert.equal(await page.$eval(".location-side", el => el.style.transform), "", "drag preview is cleaned up on release");
  await page.click(handle);
  await check(25);
  await page.setViewport({ width: 1440, height: 900 });
  await page.waitForSelector(handle);
  assert.equal(await page.$eval(handle, el => getComputedStyle(el).display), "none");
  assert.deepEqual(errors, []);
  console.log("PASS mobile sheet keyboard and pointer snap points, geometry, viewport fit and desktop exclusion");
} finally { await browser.close(); }
