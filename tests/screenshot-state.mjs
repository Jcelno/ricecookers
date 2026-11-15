/** Reusable screenshot.mjs --run hook. Choose ?qa=site|mission|earth|twin|gallery|tour. */
export default async function prepare(page) {
  await page.waitForFunction(() => window.__radium?.getState().meta && ["moon", "mars", "earth"].every(body => window.__radium.getState().pins[body].length), { timeout: 60000 });
  const scenario = new URL(page.url()).searchParams.get("qa");
  if (!scenario || scenario === "tour") return;
  if (scenario === "shortcuts") { await page.evaluate(() => window.dispatchEvent(new Event("radium:shortcuts"))); return; }
  await page.evaluate(async scenario => {
    const st = window.__radium.getState();
    const body = scenario === "earth" || scenario === "context" || scenario === "reverse" ? "earth" : scenario === "mission" ? "moon" : "mars";
    const pattern = body === "earth" ? /atacama/i : body === "moon" ? /shackleton/i : /gale|curiosity/i;
    const site = st.pins[body].find(p => pattern.test(p.name));
    st.setMode("explore"); st.setBody(body); st.setPanel("left", false);
    await st.select(body, site.lat, site.lon, { fly: true, spanKm: body === "earth" ? 1000 : 600 });
    if (scenario === "mission") { st.setMission("lunar_base"); st.setMode("mission"); }
    if (scenario === "twin") st.startTwin({ body, lat: site.lat, lon: site.lon });
  }, scenario);
  await page.waitForFunction(() => window.__radium.getState().cellStatus !== "loading");
  if (scenario === "twin") await page.waitForFunction(() => window.__radium.getState().twinStatus === "ready" || window.__radium.getState().twinStatus === "error", { timeout: 60000 });
  if (scenario === "gallery") {
    await page.waitForSelector('[data-gallery-open], [aria-label^="Open photograph:"]', { timeout: 20000 });
    await page.click('[data-gallery-open], [aria-label^="Open photograph:"]');
  }
  if (scenario === "context" || scenario === "reverse") {
    const label = scenario === "context" ? "Context (not scored)" : "What does this resemble?";
    await page.evaluate(label => {
      const el = [...document.querySelectorAll("summary,button")].find(x => x.textContent.includes(label));
      el?.click(); el?.scrollIntoView({ block: "center" });
    }, label);
  }
}
