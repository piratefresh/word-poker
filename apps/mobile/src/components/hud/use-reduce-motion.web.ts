import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => true;
const subscribe = (changed: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
};

/** Read before the first animation and respond to browser/OS preference changes. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
