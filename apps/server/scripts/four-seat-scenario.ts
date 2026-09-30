/**
 * The four-browser online smoke's script (STO-483): one seeded session, four seats, four hands.
 *
 * The single source of truth for what each seat does. The probe (`probe-four-seat.ts`) replays
 * it against the engine to pin a seed and print each seat's taps, the mocha case in
 * `test/GameRoom.test.ts` replays it over four sockets, and the Maestro flows in
 * `.maestro/four-seat/` are this script written out as taps — change one, re-probe, and update
 * the others.
 *
 * Seats 0–3 are browsers P1–P4 in join order; the first deal puts the button on seat 0. At the
 * 500 buy-in the blinds are 5/10, and a bet or raise is always the minimum, which is what the
 * felt's wager control sends at its slider's default.
 *
 * - Hand 1 (button P1, blinds P2/P3): P4 raises, P1 folds, P2 re-raises, P3 and P4 call; P2 bets
 *   the flop, both call, and the turn and river check down. P2's word wins; P3 and P4 each lose
 *   40 and leave the hand 460 each.
 * - Hand 2 (button P2, blinds P3/P4): P1 and P2 limp, P3 shoves 460, P4 folds, P1 and P2 call.
 *   P1 bets the flop into a side pot P3 cannot win, P2 calls, then it checks down. P3's word
 *   loses the main pot and P3 busts.
 * - Hand 3 (button P4, blinds P1/P2): P3 sits out and leaves; the three live seats limp and
 *   check it down. The departure sends the table back to waiting at the payout.
 * - Hand 4: the three re-ready, and the table deals 3-handed.
 */

import type { OfflineAction, Tile, TilePlay, WordSubmission } from "@wordpoker/contracts";
import { bettingBounds, evaluateWord, scoreWord, type Dictionary, type OfflineState } from "@wordpoker/game-rules";

/** The seed the probe pinned: the deal under which the script's outcomes hold. */
export const FOUR_SEAT_SEED = 4111;

/** The room knobs the runner hands the server as `WORDPOKER_SMOKE_ROOM`. */
export const FOUR_SEAT_ROOM = {
  seed: FOUR_SEAT_SEED,
  // Long enough for four browsers to read the results before the next deal.
  payoutDelay: 20_000,
  // A slow machine running four Chromes must not time a seat out of its scripted turn.
  turnDuration: 120_000,
} as const;

export const FOUR_SEAT_BUY_IN = 500;

export type ScriptAction = "fold" | "check" | "call" | "bet" | "raise" | "allIn";

/** One scripted move: which seat makes it, and what it does. */
export interface ScriptStep {
  readonly seat: number;
  readonly action: ScriptAction;
}

export interface ScriptHand {
  /** Every betting action of the hand, in the order the engine asks for them. */
  readonly steps: readonly ScriptStep[];
  /** The seats that reach §19's window and confirm a word. */
  readonly words: readonly number[];
}

const step = (seat: number, action: ScriptAction): ScriptStep => ({ seat, action });
const checks = (...seats: number[]) => seats.map((seat) => step(seat, "check"));

export const FOUR_SEAT_SCRIPT: readonly ScriptHand[] = [
  {
    steps: [
      // Pre-flop: UTG is seat 3.
      step(3, "raise"),
      step(0, "fold"),
      step(1, "raise"),
      step(2, "call"),
      step(3, "call"),
      // Flop: the small blind opens.
      step(1, "bet"),
      step(2, "call"),
      step(3, "call"),
      ...checks(1, 2, 3),
      ...checks(1, 2, 3),
    ],
    words: [1, 2, 3],
  },
  {
    steps: [
      step(0, "call"),
      step(1, "call"),
      step(2, "allIn"),
      step(3, "fold"),
      step(0, "call"),
      step(1, "call"),
      // Seat 2 is all in: only seats 0 and 1 are left to bet, into the side pot.
      step(0, "bet"),
      step(1, "call"),
      ...checks(0, 1),
      ...checks(0, 1),
    ],
    words: [0, 1, 2],
  },
  {
    steps: [
      // Seat 2 sits out; seat 3 holds the button and acts first 3-handed.
      step(3, "call"),
      step(0, "call"),
      step(1, "check"),
      ...checks(0, 1, 3),
      ...checks(0, 1, 3),
      ...checks(0, 1, 3),
    ],
    words: [0, 1, 3],
  },
];

/** The engine action for a scripted step, at the minimum the felt's wager control sends. */
export function toEngineAction(state: OfflineState, { seat, action }: ScriptStep): OfflineAction {
  const playerId = state.seats[seat]?.id;
  if (playerId === undefined) throw new Error(`no seat ${seat}`);
  if (action === "bet" || action === "raise") {
    if (state.betting === null) throw new Error("no betting round is open");
    const bounds = bettingBounds(state.seats, state.betting, seat, state.stakes.bigBlind);
    if (bounds === null) throw new Error(`seat ${seat} cannot act`);
    return { type: action, playerId, amount: action === "bet" ? bounds.bigBlind : bounds.minRaiseTo };
  }
  return { type: action, playerId };
}

/** A word a seat can spell by tapping its strip: the tiles, in strip order, and their faces. */
export interface StripWord {
  readonly word: string;
  readonly score: number;
  readonly submission: WordSubmission;
  /** The tiles tapped, in strip order, with the face a choice tile plays. */
  readonly plays: readonly { readonly tile: Tile; readonly face?: string }[];
}

/**
 * The best word a seat can build by taps alone. The strip reads its selected tiles left to
 * right and a tap never moves a tile, so without a drag a word is a subsequence of the strip:
 * the rack, then the board. Ties go to the fewest choice tiles, then the shortest word.
 */
export function bestStripWord(strip: readonly Tile[], dictionary: Dictionary): StripWord | null {
  let best: StripWord | null = null;
  let bestChoices = 0;
  const plays: TilePlay[] = [];
  const used: { tile: Tile; face?: string }[] = [];

  const consider = () => {
    if (plays.length < 2) return;
    const submission = { plays: [...plays] };
    const evaluation = evaluateWord({ available: strip, submission, dictionary });
    if (!evaluation.valid) return;
    const score = scoreWord(evaluation.tiles).total;
    const choices = used.filter((entry) => entry.face !== undefined).length;
    const better =
      best === null ||
      score > best.score ||
      (score === best.score && choices < bestChoices) ||
      (score === best.score && choices === bestChoices && evaluation.word.length < best.word.length);
    if (better) {
      best = { word: evaluation.word, score, submission, plays: [...used] };
      bestChoices = choices;
    }
  };

  const visit = (from: number) => {
    consider();
    for (let index = from; index < strip.length; index += 1) {
      const tile = strip[index]!;
      const faces = "alternativeLetter" in tile ? [tile.letter, tile.alternativeLetter] : [undefined];
      for (const face of faces) {
        plays.push(face === undefined ? { tileId: tile.id } : { tileId: tile.id, chosenFace: face });
        used.push(face === undefined ? { tile } : { tile, face });
        visit(index + 1);
        plays.pop();
        used.pop();
      }
    }
  };
  visit(0);
  return best;
}
