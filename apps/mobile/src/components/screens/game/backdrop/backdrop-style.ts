import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * Which backdrop the table draws: a mesh look — the painted emerald felt or the original gold
 * ember — a tiled picture, or a full-room scene with its own table.
 */
export const BACKDROP_STYLES = ["emerald", "ember", "wood", "fire", "water", "tavern", "planet", "tabletop"] as const;
export type BackdropStyle = (typeof BACKDROP_STYLES)[number];

/** Room artwork supplies the playing surface, so it needs room seating and no oval painting. */
export function isRoomBackdrop(
  style: BackdropStyle,
): style is "tavern" | "planet" | "tabletop" {
  return style === "tavern" || style === "planet" || style === "tabletop";
}

/** The gear's picker names each look by these. */
export const BACKDROP_LABEL: Record<BackdropStyle, string> = {
  emerald: "Emerald mesh",
  ember: "Ember mesh",
  wood: "Wood (tiled)",
  fire: "Fire (tiled)",
  water: "Water room",
  tavern: "Tavern",
  planet: "Planet",
  tabletop: "Tabletop",
};

// A module-level store rather than props: on the web the backdrop mounts lazily behind
// `WithSkiaWeb`, and the choice should outlive one table for the rest of the session.
let current: BackdropStyle = "emerald";
const listeners = new Set<() => void>();

export function setBackdropStyle(style: BackdropStyle): void {
  if (style === current) return;
  current = style;
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
