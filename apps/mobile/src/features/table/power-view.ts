/**
 * power-view.ts — §44's power-ups as the felt reads them, whichever adapter feeds it.
 *
 * The offline adapter decodes the engine's `state.powers` into this; the online adapter will map
 * the room's private draw, swap and public `powerUsed` events into the same shape (STO-500), so
 * the Power Draw reveal, the held-power chip and the "power used" card are drawn from one view
 * and never learn which table they sit at. The swap and the public event are the wire's own
 * shapes (`@wordpoker/contracts`), because they are exactly what the room sends.
 *
 * Only ever the hero's side: the offers, the held power and the swap's result are private, and
 * the one thing about another seat here is what the whole table sees — that it used a power.
 */

import type {
  PowerUpDealMode,
  PowerUpId,
  PowerUpSettings,
  PowerUsedEvent,
  PrivatePowerSwap,
  RiverReviewWord,
} from "@wordpoker/contracts";

/**
 * §40's deal modes as a player reads them: the create form's options, the lobby's tag and the
 * seated summary all name a table's setting from here, so the three cannot call it different things.
 */
export const DEAL_MODE_NAMES: { readonly [Mode in PowerUpDealMode]: string } = {
  off: "Classic",
  choose3: "Wild",
};

/**
 * What the table browser and the pre-join summary call a table that deals powers — "Wild Powers" —
 * or `null` for a Classic table, which says nothing: the rules as written need no label.
 */
export function powersLabel(settings: PowerUpSettings): string | null {
  return settings.deal === "off" ? null : `${DEAL_MODE_NAMES[settings.deal]} Powers`;
}

/** The hero's side of a Wild table's hand. A Classic table has none at all. */
export interface PowerView {
  /**
   * The hero's Power Draw while it is open: the offers in the order drawn — the first is what the
   * hero keeps if the clock runs out — and when the clock runs out, in epoch ms on this device.
   * `picked` is set once the hero has kept one and the draw is still waiting on other seats.
   * `null` when no draw is open for the hero.
   */
  readonly draw: {
    readonly offers: readonly PowerUpId[];
    readonly endsAtMs: number;
    readonly picked: PowerUpId | null;
  } | null;
  /**
   * The power the hero holds this hand, and whether it can be used right now — the engine's
   * answer (its own betting turn, or §19's window before it confirms), never the felt's.
   */
  readonly held: { readonly id: PowerUpId; readonly used: boolean; readonly usable: boolean } | null;
  /** What the hero's swap did, once it has used one: the flip reads it. Private to the hero. */
  readonly swap: PrivatePowerSwap | null;
  /** River Review, once the hand has paid out: the hero's best words, best first. Private to the hero. */
  readonly review: readonly RiverReviewWord[] | null;
  /**
   * The public "power used" events of this hand the felt has not shown yet, oldest first: the
   * center-of-felt card plays them in order and reports each one back when it clears.
   */
  readonly used: readonly PowerUsedNotice[];
}

/**
 * One public "power used" event as the felt's card prints it: the wire's event, plus the name of
 * the seat that used it and whether that seat is the hero's — the card says "You used", and the
 * hero's swap holds its flip until this card clears. The seat's name is the adapter's to resolve,
 * since only it knows which seat index is whose.
 */
export interface PowerUsedNotice extends PowerUsedEvent {
  readonly name: string;
  readonly mine: boolean;
}
