import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const values = new Map<string, boolean>();
export function preference(key: string, fallback = false): boolean {
  if (values.has(key)) return values.get(key)!;
  try { const value = localStorage.getItem(key); return value === null ? fallback : value === "1"; } catch { return fallback; }
}
export function setPreference(key: string, value: boolean) {
  values.set(key, value);
  try { localStorage.setItem(key, value ? "1" : "0"); } catch { /* session still works */ }
  listeners.forEach(fn => fn());
}
export function usePreference(key: string, fallback = false) {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => preference(key, fallback));
}
