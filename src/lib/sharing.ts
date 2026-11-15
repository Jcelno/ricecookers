import { currentLink } from "./deeplink";

/** Return success only when the browser reports an actual clipboard write. */
export async function copyCurrentViewLink(): Promise<{
  copied: boolean;
  url: string;
}> {
  const url = currentLink();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return { copied: true, url };
    }
  } catch {
    /* Try the browser's legacy copy command, then let the UI show a selectable link. */
  }
  const active = document.activeElement as HTMLElement | null;
  const text = document.createElement("textarea");
  text.value = url;
  text.readOnly = true;
  text.setAttribute("aria-label", "View link");
  text.style.cssText = "position:fixed;left:-10000px;top:0;";
  document.body.append(text);
  try {
    text.select();
    return { copied: document.execCommand("copy") === true, url };
  } catch {
    return { copied: false, url };
  } finally {
    text.remove();
    active?.focus?.({ preventScroll: true });
  }
}
