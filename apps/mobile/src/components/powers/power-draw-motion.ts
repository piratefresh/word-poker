/**
 * The Power Draw's choreography in one table: the entrance, the hover and press, and the kept
 * card's exit. Every offset is measured from the start of its own sequence — the entrance from
 * the moment the cards have a layout, the exit from the moment the table names the kept card —
 * so the beats can overlap and one clock drives each sequence.
 */
export const POWER_DRAW_MOTION = {
  entrance: {
    /** The felt darkens behind the choices. */
    scrim: 150,
    /** The emerald/gold pulse gathers at the row's centre. */
    gatherAt: 100,
    /** The left card's impact; each card after it lands `stagger` later (200 / 320 / 440). */
    revealAt: 200,
    stagger: 120,
    /** A card's hit, 0.55 → `peak`, then its settle back to 1. */
    hit: 110,
    settle: 210,
    from: 0.55,
    peak: 1.14,
    /** A card's flash, ring, arc and streaks are gone this long after its reveal. */
    impact: 360,
    /** The heading fades in with the first card. */
    heading: 200,
    /** Selection opens, and "CHOOSE ONE POWER" shows. */
    readyAt: 900,
    hint: 180,
  },
  focus: {
    /** A hovered, focused or pressed card rises this many points and grows to `scale`. */
    lift: 6,
    scale: 1.04,
    /** The cards that are not lit dim to this. */
    dim: 0.75,
    duration: 120,
    /** The one pulse around a card's frame as it lights. */
    pulseIn: 90,
    pulseOut: 260,
  },
  exit: {
    /** +0: the kept card lifts and grows to `liftScale`. */
    lift: 100,
    liftScale: 1.12,
    /** +100: the stronger impact behind it. */
    impactAt: 100,
    /** The white-hot hit over the kept card's face, in and out. */
    hitIn: 80,
    hitOut: 220,
    /** +200–350: the cards not kept fade and shrink to `dropScale`, the heading with them. */
    dropAt: 200,
    drop: 150,
    dropScale: 0.9,
    /** +450–650: the kept card flies, shrinking to `flightScale`, and the scrim fades. */
    flightAt: 450,
    flight: 200,
    flightScale: 0.2,
    total: 650,
  },
  reduced: {
    /** Under reduced motion the choices fade in, and the selection fades out. */
    fadeIn: 180,
    fadeOut: 180,
  },
} as const;

/** How long the kept card's exit holds the reveal on the felt once the table has named it. */
export const POWER_DRAW_KEPT_MS = POWER_DRAW_MOTION.exit.total;

/** When the card at `index` lands, from the start of the entrance. */
export function revealAtFor(index: number): number {
  return POWER_DRAW_MOTION.entrance.revealAt + index * POWER_DRAW_MOTION.entrance.stagger;
}
