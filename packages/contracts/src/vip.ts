/**
 * VIP Points and lifetime tiers on the wire (STO-1170, `docs/rules/loyalty.md`).
 *
 * The tier table and the earn math live in `packages/game-rules` (`vip.ts`); this is the shape
 * a hand's VIP facts, a player's standing and one award take between the server and the app.
 */

/** One settled hand, from one seat, reduced to what VIP Points are judged on. */
export interface VipHandFacts {
  /** The seat completed the hand: stayed to showdown or folded after the river. Only these earn play points. */
  readonly completed: boolean;
  /** The hand reached showdown and this seat's word was revealed. */
  readonly showdown: boolean;
  /** Letters in the revealed word; 0 when there was none. */
  readonly wordLength: number;
  /** The word used every hole and community tile the seat could play. */
  readonly usedEveryTile: boolean;
  /** The word placed first at the table. */
  readonly bestWord: boolean;
  /** Coins this seat put into the pot this hand; 0 where betting doesn't count. */
  readonly committed: number;
  /** The seat was all-in and won a pot. */
  readonly wonAllIn: boolean;
  /** 1-based count of completed hands at this table (this one included), for the every-10-hands bonus. */
  readonly handInSession: number;
  /** Betting points count: an online (public) table. Offline hands are always `false`. */
  readonly betting: boolean;
}

/** A player's VIP standing, as the app shows it. */
export interface VipState {
  /** Lifetime points; never resets. */
  readonly points: number;
  /** Index into `VIP_TIERS` (0 = Rookie). */
  readonly tier: number;
  /** Play points earned on the current UTC day, toward the daily cap. */
  readonly playToday: number;
}

/** What one hand (or bonus) added. */
export interface VipAward {
  readonly added: number;
  readonly play: number;
  readonly word: number;
  readonly bet: number;
  readonly state: VipState;
  /** Set when this award crossed into a new tier: the tier reached and the coins it paid. */
  readonly tierUp: { readonly tier: number; readonly coins: number } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isVipState(value: unknown): value is VipState {
  return isRecord(value) && isCount(value.points) && isCount(value.tier) && isCount(value.playToday);
}

export function isVipAward(value: unknown): value is VipAward {
  if (!isRecord(value)) return false;
  const { tierUp } = value;
  return (
    isCount(value.added) &&
    isCount(value.play) &&
    isCount(value.word) &&
    isCount(value.bet) &&
    isVipState(value.state) &&
    (tierUp === null || (isRecord(tierUp) && isCount(tierUp.tier) && isCount(tierUp.coins)))
  );
}
