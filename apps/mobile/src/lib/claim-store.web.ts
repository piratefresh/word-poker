/**
 * claim-store.web.ts — the web build's durable slot for unsent quest claims (STO-563). A private
 * window or blocked site data makes `localStorage` throw; the claim then lives as long as the tab.
 */

export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: nothing durable to keep it in.
  }
}
