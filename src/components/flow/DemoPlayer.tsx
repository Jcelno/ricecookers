import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { findings, shortPlace } from "@/lib/findings";
import { useStore } from "@/store";

import "./flow.css";

/**
 * "Watch a 20-second example": an automatic, skippable walkthrough that drives the real interface.
 *
 * It presses the same controls a visitor would (Gale crater → Test rover driving → results → Compare →
 * what Earth can't reproduce) and every number on screen comes from live API calls made as it goes.
 * If the data service stops answering, the saved example opens instead, labelled "Saved example".
 * One caption per step, never more than 12 words.
 */
const STEPS = 6;
const SITE = findings.famous.find((f) => f.id === "gale")!;
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export default function DemoPlayer() {
  const [caption, setCaption] = useState("Pick a place on Mars. Here: Gale crater, Curiosity's landing site.");
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const stop = useRef({ cancelled: false });

  useEffect(() => {
    const ctl = { cancelled: false };
    stop.current = ctl;
    const st = () => useStore.getState();
    /** Wait until something is true; gives up (returns false) if the walkthrough is skipped or it takes too long. */
    const until = async (ok: () => boolean, ms = 25000) => {
      const end = performance.now() + ms;
      while (!ctl.cancelled && performance.now() < end) { if (ok()) return true; await sleep(80); }
      return false;
    };
    /** Show which control is about to be used, then press the real one. */
    const press = async (selector: string, fallback: () => void) => {
      await until(() => !!document.querySelector(selector), 6000);
      if (ctl.cancelled) return;
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) { fallback(); return; }
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el.setAttribute("data-demo-press", "");
      await sleep(700);
      el.removeAttribute("data-demo-press");
      if (!ctl.cancelled) el.click();
    };
    const say = (n: number, text: string) => { if (!ctl.cancelled) { setStep(n); setCaption(text); } };
    const failed = () => { if (!ctl.cancelled) { ctl.cancelled = true; useStore.setState({ demo: false, savedExample: true }); } };

    void (async () => {
      // 1. a place on Mars
      st().enter({ kind: "twin", body: "mars" });
      say(1, "Pick a place on Mars. Here: Gale crater, Curiosity's landing site.");
      await sleep(2300);
      await press('[data-famous-site="gale"]', () => st().startTwin({ body: "mars", lat: SITE.lat, lon: SITE.lon }));
      if (!(await until(() => st().twinStep === 2))) return;
      // 2. what to test
      say(2, "Choose what to test. Here: driving a rover.");
      await sleep(2300);
      await press('[data-purpose="mobility"]', () => st().setPurpose("mobility"));
      // 3. the search
      say(3, "RADIUM compares Gale with every place on Earth's land.");
      const searched = await until(() => st().twinStatus === "error" || (st().twinStep === 3 && st().twinStatus === "ready" && st().twin?.purpose === "mobility" && !!document.querySelector("[data-top3]")));
      if (ctl.cancelled) return;
      if (!searched || st().twinStatus === "error") return failed();
      await sleep(1400);
      // 4. the answer, from the response
      const top = st().twin!.candidates[0];
      say(4, `Closest match: ${shortPlace(top.place.label)}, grade ${top.grade ?? "none"}, score ${top.score?.toFixed(2) ?? "unknown"}.`);
      const compared = await until(() => st().compareStatus === "error" || (st().compareStatus === "ready" && !!st().compare));
      if (ctl.cancelled) return;
      if (!compared || st().compareStatus === "error") return failed();
      await sleep(3000);
      // 5. side by side
      await press("[data-compare-open]", () => st().setMode("compare"));
      say(5, "Side by side: what matches and what does not.");
      await until(() => !!document.querySelector("[data-pair]"), 8000);
      await sleep(3200);
      // 6. what Earth cannot reproduce
      document.querySelector("[data-condition-bars]")?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      say(6, "Red marks what no place on Earth can reproduce.");
      await sleep(3800);
      if (!ctl.cancelled) { setCaption("That is one question answered. Now ask your own."); setDone(true); }
    })();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); ctl.cancelled = true; useStore.setState({ demo: false }); } };
    document.addEventListener("keydown", key, true);
    return () => { ctl.cancelled = true; document.removeEventListener("keydown", key, true); };
  }, []);

  const close = () => { stop.current.cancelled = true; useStore.setState({ demo: false }); };
  return (
    <div className="demo-bar floating" role="region" aria-label="20-second example" data-demo data-demo-step={step} data-demo-done={done}>
      <span className="demo-tag eyebrow"><i aria-hidden />Example · live data</span>
      <span className="demo-dots" aria-hidden>{Array.from({ length: STEPS }, (_, k) => <i key={k} data-on={k < step} />)}</span>
      <p className="demo-caption" aria-live="polite" key={caption} data-demo-caption>{caption}</p>
      {done ? (
        <span className="demo-end">
          <button type="button" className="ctl demo-primary" onClick={close}>Explore this result</button>
          <button type="button" className="ctl demo-skip" onClick={() => { close(); useStore.getState().startOver(); }}>Back to the four questions</button>
        </span>
      ) : (
        <button type="button" className="ctl demo-skip" onClick={close} data-demo-skip><X size={13} aria-hidden /> Skip</button>
      )}
    </div>
  );
}
