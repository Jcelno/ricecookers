export default async function prepare(page) {
  await page.waitForSelector('[data-tour="help"]', { timeout: 60000 });
  await page.evaluate(async () => {
    localStorage.setItem("radium.tutorial.v3", JSON.stringify({ path: "quick", stepId: "find-twin", completed: ["pick-world", "move-map", "select-site", "read-grade", "turn-on-layer"] }));
    window.__radium.getState().setSheet("intro");
  });
  await page.waitForSelector("[data-tour-welcome]", { timeout: 30000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.includes("Resume"))?.click());
  await page.waitForSelector('[data-tour-step="find-twin"]', { timeout: 30000 });
}
