import { emitTour } from "./tour/events";
import { currentLink } from "./deeplink";

/** Return success only when the browser reports an actual clipboard write. */
export async function copyText(value: string, label = "Text to copy"): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* Try the browser's legacy copy command, then let the UI show a selectable link. */
  }
  const active = document.activeElement as HTMLElement | null;
  const text = document.createElement("textarea");
  text.value = value;
  text.readOnly = true;
  text.setAttribute("aria-label", label);
  text.style.cssText = "position:fixed;left:-10000px;top:0;";
  document.body.append(text);
  try {
    text.select();
    const copied = document.execCommand("copy") === true;
    return copied;
  } catch {
    return false;
  } finally {
    text.remove();
    active?.focus?.({ preventScroll: true });
  }
}

export async function copyCurrentViewLink(): Promise<{ copied: boolean; url: string }> {
  const url = currentLink();
  const copied = await copyText(url, "View link");
  if (copied) emitTour("link:copied", { url });
  return { copied, url };
}
