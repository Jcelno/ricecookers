export default async function prepare(page) {
  await page.waitForSelector("[data-tour-welcome]", { timeout: 60000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find(button => button.textContent.trim().startsWith("Full field guide")).click());
  await page.waitForSelector("[data-tour-step]");
  await page.click('[aria-label="Choose tutorial topic"]');
  const target = new URL(page.url()).searchParams.get("qa") ?? "guide-catalog";
  const title = target === "guide-analogy" ? "Know where analogy stops" : target === "guide-near" ? "Find fieldwork near you" : "Search the research catalog";
  await page.evaluate(title => [...document.querySelectorAll(".tour-topic")].find(button => button.textContent.trim() === title).click(), title);
  await page.waitForSelector(`[data-tour-step="${target === "guide-analogy" ? "analogy-breaks" : target === "guide-near" ? "nearby-analogs" : "catalog-filter"}"]`);
  if (target === "guide-analogy") {
    await page.waitForSelector('[data-tour="analogy-breakdown"]', { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('[data-tour="analogy-breakdown"]').getBoundingClientRect().top < innerHeight);
  }
}
