/**
 * placement.ts — where a coach card sits relative to the control it points at.
 *
 * Pure, so the geometry is testable without a tree: the provider measures the target and the
 * card, and this decides the side, the corner and where the arrow meets the card. Everything is
 * in the provider's own coordinates (its top-left is 0,0).
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Which side of the target the card sits on. */
export type CoachSide = "top" | "bottom";

export interface CoachPlacement {
  top: number;
  left: number;
  width: number;
  /** The side the card ended up on; `null` for a card with no target, centered and arrowless. */
  side: CoachSide | null;
  /** The arrow's center along the card's facing edge, from the card's left; `null` with no arrow. */
  arrowX: number | null;
}

/** The screen's side gutter the card never crosses. */
export const COACH_GUTTER = 16;
/** The gap between the target and the card — the arrow lives in it. */
export const COACH_GAP = 12;
/** How far the arrow stays from a card corner, so it never sits on the rounding. */
const ARROW_INSET = 18;
/** The card's widest; narrower screens get the screen less both gutters. */
export const COACH_MAX_WIDTH = 340;

/** The card's width inside a container of `width`. */
export function coachCardWidth(width: number): number {
  return Math.max(0, Math.min(COACH_MAX_WIDTH, width - 2 * COACH_GUTTER));
}

/**
 * Places a card of `card` height beside `target`. The preferred side wins when the card fits
 * there; otherwise the other side, and when neither fits, whichever has more room — the card is
 * then clamped inside the container so it is never cut off. Horizontally the card centers on the
 * target and slides inside the gutters, and the arrow follows the target's center.
 */
export function placeCoachCard({
  target,
  container,
  cardHeight,
  side = "top",
}: {
  target: Rect | null;
  container: Size;
  cardHeight: number;
  side?: CoachSide;
}): CoachPlacement {
  const width = coachCardWidth(container.width);
  const maxTop = Math.max(COACH_GUTTER, container.height - COACH_GUTTER - cardHeight);

  if (target === null) {
    return {
      top: clamp((container.height - cardHeight) / 2, COACH_GUTTER, maxTop),
      left: (container.width - width) / 2,
      width,
      side: null,
      arrowX: null,
    };
  }

  const roomAbove = target.y - COACH_GAP - COACH_GUTTER;
  const roomBelow = container.height - COACH_GUTTER - (target.y + target.height + COACH_GAP);
  const fits = (candidate: CoachSide) => (candidate === "top" ? roomAbove : roomBelow) >= cardHeight;
  const other: CoachSide = side === "top" ? "bottom" : "top";
  const chosen: CoachSide = fits(side) ? side : fits(other) ? other : roomAbove >= roomBelow ? "top" : "bottom";

  const desiredTop = chosen === "top"
    ? target.y - COACH_GAP - cardHeight
    : target.y + target.height + COACH_GAP;
  const center = target.x + target.width / 2;
  const left = clamp(center - width / 2, COACH_GUTTER, Math.max(COACH_GUTTER, container.width - COACH_GUTTER - width));

  return {
    top: clamp(desiredTop, COACH_GUTTER, maxTop),
    left,
    width,
    side: chosen,
    arrowX: clamp(center - left, ARROW_INSET, Math.max(ARROW_INSET, width - ARROW_INSET)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
