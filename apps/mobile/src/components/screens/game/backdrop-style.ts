import { createContext, useContext, useSyncExternalStore } from "react";

/** Which mesh backdrop the table draws: the painted emerald felt or the original gold ember. */
export type BackdropStyle = "emerald" | "ember";

// A module-level store rather than props: on the web the backdrop mounts lazily behind
// `WithSkiaWeb`, and the choice should outlive one table for the rest of the session.
let current: BackdropStyle = "emerald";
const listeners = new Set<() => void>();

export function toggleBackdropStyle(): void {
  current = current === "emerald" ? "ember" : "emerald";
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBackdropStyle(): BackdropStyle {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

// The turn's spent share, 0..1, which the backdrop's drift speeds up with. A context rather
// than a prop for the same reason as the store: the web backdrop is mounted by `WithSkiaWeb`,
// which does not pass props through. 0 when no clock is running.
const BackdropUrgencyContext = createContext(0);

export const BackdropUrgencyProvider = BackdropUrgencyContext.Provider;

export function useBackdropUrgency(): number {
  return useContext(BackdropUrgencyContext);
}
