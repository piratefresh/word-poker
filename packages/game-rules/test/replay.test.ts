/**
 * replay.test.ts — STO-454: a recorded hand replays to its settlement, and a changed one does not.
 *
 * Every record under test is built by driving the real engine — the same `reduce` the felt and
 * the room drive — so "the same complete record replays to the same payout, words, scores, and
 * stacks" is proven against hands the engine actually accepted, with the bot/timeout/
 * disconnect sources mixed in the way a real log carries them.
 *
 * What these tests cannot manufacture: a pot split among several winners. §25 only splits when
 * §21.3's draw pool is exhausted under the tied seats, which a table of at most four seats
 * cannot reach — that path is covered where it lives (`showdown.test.ts`, `pots.test.ts`). A
 * *claimed* split is covered here the other way around: replay refuses it as a changed claim.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HAND_RECORD_VERSION,
  type BettingAction,
  type HandRecord,
  type HandRecordAction,
  type OfflineAction,
  type RecordedHandAction,
  type TilePlay,
} from "@wordpoker/contracts";

import { bettingBounds } from "../src/money/betting";
import { OfflineActionError } from "../src/core/errors";
import {
  availableTiles,
  reduce,
  startHand,
  type OfflineState,
  type StartHandOptions,
} from "../src/table/offline";
import { RULES_VERSION, summarizeHand, verifyHandRecord } from "../src/table/replay";
import { TEST_WORDS, testDictionary } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const HEADS_UP = ["hero", "ellis"] as const;
const NOW = 1_000_000;

/** A fingerprint in the exact shape a record carries, so the dictionary pin is exercised for real. */
const FINGERPRINT = "a".repeat(64);
const DICTIONARY = testDictionary(TEST_WORDS, FINGERPRINT);
const SESSION_ID = "0d1f2a3b-4c5d-4e6f-8a9b-cdef01234567";

function dealt(options: Partial<StartHandOptions> = {}, nowMs = NOW): OfflineState {
  return startHand({
    seed: 20261012,
    players: SEATS,
    nowMs,
    dictionary: DICTIONARY,
    ...options,
  });
}

/**
 * Drives a hand the way the felt does and keeps the accepted log — the seam STO-457 will
 * instrument — so a record under test is always the actions the engine accepted, at the clock
 * readings it accepted them at.
 */
class RecordedHand {
  private table: OfflineState;
  private clockMs: number;
  readonly entries: HandRecordAction[] = [];

  constructor(readonly initial: OfflineState, readonly startedAtMs: number) {
    this.table = initial;
    this.clockMs = startedAtMs;
  }

  get state(): OfflineState {
    return this.table;
  }

  /** When the hand ended: the last accepted clock reading, which is when it settled. */
  get endedAtMs(): number {
    const last = this.entries[this.entries.length - 1];
    return last === undefined ? this.startedAtMs : last.atMs;
  }

  apply(action: OfflineAction, atMs: number, source: HandRecordAction["source"] = "player"): OfflineState {
    assert.ok(action.type !== "deal", "a record's log starts after the deal; the deal is not in it");
    assert.ok(atMs >= this.clockMs, "the test clock runs forward");
    this.clockMs = atMs;
    this.table = reduce(this.table, action, atMs);
    this.entries.push({ sequence: this.entries.length, atMs, source, action: action as RecordedHandAction });
    return this.table;
  }

  /** The polite betting move (offline.test.ts's): call what is owed, check when it is nothing. */
  applyPolite(source: HandRecordAction["source"] = "player"): OfflineState {
    const index = this.table.toActIndex;
    const round = this.table.betting;
    assert.ok(index !== null && round !== null, "a betting round is open");
    const seat = this.table.seats[index];
    assert.ok(seat, `seat ${index} is to act`);
    const bounds = bettingBounds(this.table.seats, round, index, this.table.stakes.bigBlind);
    assert.ok(bounds, `seat ${index} can act`);

    const action: BettingAction = bounds.canCheck
      ? { type: "check", playerId: seat.id }
      : { type: "call", playerId: seat.id };
    return this.apply(action, this.clockMs + 1_000, source);
  }

  /** Walks politely to §19's window: blinds called around, every later street checked. */
  playPoliteToWindow(): OfflineState {
    let step = 0;
    while (this.table.wordWindow?.status !== "open" && this.table.phase !== "payout") {
      this.applyPolite();
      step += 1;
      assert.ok(step <= SEATS.length * 5, "a polite hand is a bounded walk");
    }
    assert.equal(this.table.wordWindow?.status, "open", "a polite hand reaches the word window");
    return this.table;
  }

  /** §19's window closing on its clock, which is what pays a hand out. */
  timeOutWords(): OfflineState {
    return this.apply({ type: "timeoutWords" }, this.table.endsAtMs, "timeout");
  }
}

/**
 * Stamps the record a recorder writes: the inputs the hand started from, the accepted log, and
 * the settlement the authority derived when it settled. Initial stacks are read back to what
 * the seats *brought*: `startHand` posts the blinds before it returns, so the pre-blind stack
 * is the stack plus what the seat has already committed this hand.
 */
function toRecord(hand: RecordedHand): HandRecord {
  const { initial, state } = hand;
  return {
    version: HAND_RECORD_VERSION,
    sessionId: SESSION_ID,
    handNo: state.hand,
    mode: "offline",
    ranked: false,
    startedAtMs: hand.startedAtMs,
    endedAtMs: hand.endedAtMs,
    seed: initial.seed,
    dealerSeat: initial.dealerSeat,
    rulesVersion: RULES_VERSION,
    dictionaryId: initial.dictionary.id,
    dictionaryFingerprint: initial.dictionary.source.sha256,
    config: {
      smallBlind: initial.stakes.smallBlind,
      bigBlind: initial.stakes.bigBlind,
      turnDurationMs: initial.turnDurationMs,
      autoSubmitDrafts: initial.autoSubmitDrafts,
      powerUpDeal: initial.powers === undefined ? "off" : "choose3",
    },
    seats: initial.seats.map((seat) => ({
      playerId: seat.id,
      userId: null,
      name: seat.id,
      initialStack: seat.stack + seat.committedHand,
    })),
    actions: hand.entries,
    summary: summarizeHand(state),
  };
}

/** A submission spelling `word` from what the seat holds, or `null` when it cannot. */
function spelledSubmission(
  state: OfflineState,
  seatIndex: number,
  word: string,
): { plays: TilePlay[] } | null {
  const available = [...availableTiles(state, seatIndex)];
  const plays: TilePlay[] = [];
  for (const letter of word) {
    const index = available.findIndex((tile) => tile.letter === letter);
    const tile = index < 0 ? undefined : available[index];
    if (tile === undefined) return null;
    plays.push(
      "alternativeLetter" in tile
        ? { tileId: tile.id, chosenFace: tile.letter }
        : { tileId: tile.id },
    );
    available.splice(index, 1);
  }
  return { plays };
}

/** Which test word each seat can spell from its deal, in seat order (`null` when none). */
function spellableWords(state: OfflineState): (string | null)[] {
  return state.seats.map((_, index) => {
    const word = TEST_WORDS.find((candidate) => spelledSubmission(state, index, candidate) !== null);
    return word ?? null;
  });
}

/** The first seed where at least `need` seats can each spell a word. */
function findSpellableSeed(players: readonly string[], need: number): { seed: number; words: (string | null)[] } {
  for (let seed = 1; seed <= 50_000; seed += 1) {
    const state = dealt({ seed, players });
    const words = spellableWords(state);
    if (words.filter((word) => word !== null).length >= need) return { seed, words };
  }
  assert.fail(`no seed among the first 50,000 deals gives ${need} seats a spellable word`);
}

/**
 * A polite four-seat showdown where every seat that can spell a word confirms it and the rest
 * run out of §19's clock — the record the tamper tests below start from.
 */
function recordedShowdown(): { record: HandRecord; confirmed: string[] } {
  const { seed, words } = findSpellableSeed(SEATS, 2);
  const hand = new RecordedHand(dealt({ seed }), NOW);
  hand.playPoliteToWindow();

  const confirmed: string[] = [];
  words.forEach((word, index) => {
    if (word === null || hand.state.phase === "payout") return;
    const seat = hand.state.seats[index];
    assert.ok(seat, `seat ${index}`);
    const submission = spelledSubmission(hand.state, index, word);
    assert.ok(submission, `seat ${index} can still spell ${word}`);
    hand.apply({ type: "confirmWord", playerId: seat.id, submission }, hand.endedAtMs + 1_000);
    confirmed.push(seat.id);
  });
  if (hand.state.phase !== "payout") hand.timeOutWords();

  return { record: toRecord(hand), confirmed };
}

/** The refusal a failed verification returned, as a thrown assertion when it did not fail. */
function refusalOf(record: HandRecord): { kind: string; sequence?: number } {
  const verified = verifyHandRecord(record, DICTIONARY);
  if (verified.ok) assert.fail("the tampered record verified; the tamper changed nothing");
  const { kind, sequence } = verified.refusal;
  return sequence === undefined ? { kind } : { kind, sequence };
}

describe("replayHand / verifyHandRecord (STO-454)", () => {
  it("replays a recorded showdown to the same payout, words, scores, and stacks", () => {
    const { record, confirmed } = recordedShowdown();

    const verified = verifyHandRecord(record, DICTIONARY);
    if (!verified.ok) assert.fail(verified.refusal.reason);

    assert.equal(verified.summary.outcome, "showdown");
    assert.deepEqual(verified.summary, record.summary, "the replay derives the stamped settlement");

    // The ladder places the whole field: four distinct places over four seats.
    assert.deepEqual(
      [...verified.summary.seats].map((seat) => seat.place).sort((a, b) => (a ?? 0) - (b ?? 0)),
      [1, 2, 3, 4],
    );

    // A polite hand is one blind-sized bet in the pot, paid to one winner, chips preserved.
    assert.equal(verified.summary.pots.length, 1);
    assert.equal(verified.summary.pots[0]?.amount, 80);
    assert.equal(verified.summary.pots[0]?.winners.length, 1);
    assert.equal(
      verified.summary.seats.reduce((total, seat) => total + seat.finalStack, 0),
      4_000,
    );

    for (const seat of verified.summary.seats) {
      assert.equal(seat.privateTiles.length, 2, "every seat was dealt its two tiles");
      if (confirmed.includes(seat.playerId)) {
        assert.ok(seat.submission, `${seat.playerId} confirmed a word`);
        assert.ok(seat.word, `${seat.playerId}'s word is a real word`);
        assert.equal(seat.reason, null);
      } else {
        assert.equal(seat.submission, null, "a seat that confirmed nothing has no submission");
        assert.equal(seat.word, null);
        assert.equal(seat.reason, "timer-expired");
        assert.equal(seat.score, 0);
      }
    }

    // The same record replays to the same settlement: nothing ambient rode along.
    const again = verifyHandRecord(record, DICTIONARY);
    if (!again.ok) assert.fail(again.refusal.reason);
    assert.deepEqual(again.summary, verified.summary);
  });

  it("replays a later hand with carried stacks and a moved button, drawing from the recorded hand's stream", () => {
    // A seed whose second hand is decided by §21.3's draw — everyone times out, the draw
    // places the field — and whose draw differs when the hand number is forged to 1.
    let record: HandRecord | undefined;
    for (let seed = 1; seed <= 5_000 && record === undefined; seed += 1) {
      // Hand 1: a three-fold preflop ending, with the server's fold of the small blind in it.
      const first = new RecordedHand(dealt({ seed }), NOW);
      first.apply({ type: "fold", playerId: "mira" }, NOW + 1_000);
      first.apply({ type: "fold", playerId: "hero" }, NOW + 2_000, "bot");
      first.apply({ type: "foldTurn" }, NOW + 3_000, "disconnect");
      assert.equal(first.state.phase, "payout", "three folds leave one seat, and the hand pays out");

      // The deal rolls the session on; the deal action itself belongs to no record.
      const second = new RecordedHand(reduce(first.state, { type: "deal" }, NOW + 10_000), NOW + 10_000);
      second.playPoliteToWindow();
      second.timeOutWords();
      const candidate = toRecord(second);

      const verified = verifyHandRecord(candidate, DICTIONARY);
      if (!verified.ok) continue;
      const forged = verifyHandRecord({ ...candidate, handNo: 1 }, DICTIONARY);
      if (!forged.ok && forged.refusal.kind === "summary") record = candidate;
    }
    assert.ok(record, "a second hand exists whose draw the wrong hand number would re-roll");
    if (record === undefined) return;

    assert.equal(record.handNo, 2);
    assert.equal(record.dealerSeat, 1, "the button stepped one seat clockwise");
    assert.deepEqual(
      record.seats.map((seat) => seat.initialStack),
      [1_000, 990, 1_010, 1_000],
      "hand 2 starts from hand 1's carried stacks",
    );

    const verified = verifyHandRecord(record, DICTIONARY);
    if (!verified.ok) assert.fail(verified.refusal.reason);

    // Everyone timed out: no words, no scores, and the draw placed the whole field.
    assert.equal(verified.summary.outcome, "showdown");
    for (const seat of verified.summary.seats) {
      assert.equal(seat.word, null);
      assert.equal(seat.reason, "timer-expired");
      assert.equal(seat.score, 0);
      assert.equal(seat.submission, null);
    }

    // The pinned hand number is load-bearing: replaying hand 2 as hand 1 re-rolls the draw
    // and refuses the settlement the table actually reached.
    const forged = verifyHandRecord({ ...record, handNo: 1 }, DICTIONARY);
    assert.ok(!forged.ok && forged.refusal.kind === "summary");
  });

  it("replays a fold-out with player, timeout, and disconnect folds in the log", () => {
    const hand = new RecordedHand(dealt(), NOW);
    hand.apply({ type: "fold", playerId: "mira" }, NOW + 1_000);
    hand.apply({ type: "timeoutTurn" }, hand.state.endsAtMs, "timeout");
    hand.apply({ type: "foldTurn" }, hand.state.endsAtMs + 1, "disconnect");
    assert.equal(hand.state.phase, "payout");

    const record = toRecord(hand);
    const verified = verifyHandRecord(record, DICTIONARY);
    if (!verified.ok) assert.fail(verified.refusal.reason);

    // §26's fold-out: no reveal, no words, no places — the survivor takes both layers.
    assert.equal(verified.summary.outcome, "fold-out");
    for (const seat of verified.summary.seats) {
      assert.equal(seat.word, null);
      assert.equal(seat.reason, null, "the clock never refused a seat that was never judged");
      assert.equal(seat.submission, null);
      assert.equal(seat.place, null);
      assert.equal(seat.score, 0);
    }
    assert.deepEqual(
      verified.summary.pots.map((pot) => ({ amount: pot.amount, winners: pot.winners })),
      [
        { amount: 20, winners: ["jay"] },
        { amount: 10, winners: ["jay"] },
      ],
      "the two live blinds layer the pot the survivor sweeps",
    );
    assert.deepEqual(
      verified.summary.seats.map((seat) => seat.finalStack),
      [1_000, 990, 1_010, 1_000],
    );
  });

  it("replays a heads-up word timeout: the confirmed word stands, the silent seat scores nothing", () => {
    const { seed, words } = findSpellableSeed(HEADS_UP, 1);
    const speaker = words.findIndex((word) => word !== null);
    const word = words[speaker];
    assert.ok(word != null, "a seat can spell a word");

    const hand = new RecordedHand(dealt({ seed, players: HEADS_UP }), NOW);
    hand.playPoliteToWindow();
    const seat = hand.state.seats[speaker];
    assert.ok(seat, `seat ${speaker}`);
    const submission = spelledSubmission(hand.state, speaker, word);
    assert.ok(submission, "the seat can still spell its word");
    hand.apply({ type: "confirmWord", playerId: seat.id, submission }, hand.endedAtMs + 1_000);
    hand.timeOutWords();

    const record = toRecord(hand);
    const verified = verifyHandRecord(record, DICTIONARY);
    if (!verified.ok) assert.fail(verified.refusal.reason);

    const speaking = verified.summary.seats[speaker];
    const silent = verified.summary.seats[1 - speaker];
    assert.ok(speaking && silent, "both seats have standings");
    assert.equal(speaking.submission?.plays.length, word.length);
    assert.equal(speaking.word, word);
    assert.equal(speaking.reason, null);
    assert.equal(speaking.place, 1);
    assert.deepEqual(verified.summary.pots[0]?.winners, [seat.id]);
    assert.equal(silent.word, null);
    assert.equal(silent.reason, "timer-expired");
    assert.equal(silent.submission, null);
    assert.equal(silent.place, 2);
  });

  it("replays an auto-submitted draft as the confirmation it became", () => {
    const { seed, words } = findSpellableSeed(HEADS_UP, 1);
    const speaker = words.findIndex((entry) => entry !== null);
    const word = words[speaker];
    assert.ok(word != null, "a seat can spell a word");

    const hand = new RecordedHand(
      dealt({ seed, players: HEADS_UP, wordBuilding: { autoSubmitDrafts: true } }),
      NOW,
    );
    hand.playPoliteToWindow();
    const seat = hand.state.seats[speaker];
    assert.ok(seat, `seat ${speaker}`);
    const submission = spelledSubmission(hand.state, speaker, word);
    assert.ok(submission, "the seat can still spell its word");
    hand.apply({ type: "draftWord", playerId: seat.id, submission }, hand.endedAtMs + 1_000);
    hand.timeOutWords();

    const record = toRecord(hand);
    assert.equal(record.config.autoSubmitDrafts, true, "the setting rides on the record");

    const verified = verifyHandRecord(record, DICTIONARY);
    if (!verified.ok) assert.fail(verified.refusal.reason);

    const standing = verified.summary.seats[speaker];
    assert.ok(standing && standing.submission, "the left-behind draft is the confirmed word the table opted into");
    assert.equal(standing.word, word);
    assert.equal(standing.reason, null);
  });

  it("replays a layered settlement: the short all-in seat contests the main pot only", () => {
    const hand = new RecordedHand(
      dealt({ stacks: [{ playerId: "hero", stack: 40 }] }),
      NOW,
    );
    hand.apply({ type: "call", playerId: "mira" }, NOW + 1_000);
    hand.apply({ type: "allIn", playerId: "hero" }, NOW + 2_000);
    hand.apply({ type: "raise", playerId: "ellis", amount: 100 }, NOW + 3_000);
    hand.apply({ type: "call", playerId: "jay" }, NOW + 4_000);
    hand.apply({ type: "call", playerId: "mira" }, NOW + 5_000);
    hand.playPoliteToWindow();
    hand.timeOutWords();

    const record = toRecord(hand);
    assert.equal(record.seats[0]?.initialStack, 40, "the short seat brought forty chips");

    const verified = verifyHandRecord(record, DICTIONARY);
    if (!verified.ok) assert.fail(verified.refusal.reason);

    assert.equal(verified.summary.pots.length, 2, "the all-in short stack layers the pot");
    const [main, side] = verified.summary.pots;
    assert.equal(main?.amount, 160);
    assert.ok(main?.eligible.includes("hero"), "the all-in seat contests the main pot");
    assert.equal(side?.amount, 180);
    assert.ok(!side?.eligible.includes("hero"), "the all-in seat cannot win the side pot");
    assert.equal(
      verified.summary.seats.reduce((total, seat) => total + seat.finalStack, 0),
      3_040,
      "chips are preserved across the layers",
    );
  });

  it("refuses a changed settlement claim, a forged split, and a changed score", () => {
    const { record } = recordedShowdown();

    const pot = record.summary.pots[0];
    assert.ok(pot, "the showdown record has its pot");
    assert.deepEqual(
      refusalOf({ ...record, summary: { ...record.summary, pots: [{ ...pot, amount: pot.amount + 1 }] } }),
      { kind: "summary" },
      "a changed payout is not the settlement the replay reached",
    );
    assert.deepEqual(
      refusalOf({
        ...record,
        summary: {
          ...record.summary,
          pots: [{ ...pot, winners: [...pot.winners, record.seats[0]?.playerId ?? "hero"] }],
        },
      }),
      { kind: "summary" },
      "a claimed split the replay does not produce is a changed claim",
    );
    assert.deepEqual(
      refusalOf({
        ...record,
        summary: {
          ...record.summary,
          seats: record.summary.seats.map((seat) => ({ ...seat, score: seat.score + 1 })),
        },
      }),
      { kind: "summary" },
      "a changed score is a changed claim",
    );
  });

  it("refuses an illegal action at the entry that forged it", () => {
    const { record } = recordedShowdown();
    const [first, second] = record.actions;
    assert.ok(first && second, "the log has its opening actions");

    // The first entry is the seat under the gun calling; the small blind is not to act yet.
    const forgedSeat = record.seats[1]?.playerId ?? "ellis";
    assert.notEqual(first.action, undefined);
    assert.ok("playerId" in first.action, "the opening action names its seat");
    assert.deepEqual(
      refusalOf({
        ...record,
        actions: [{ ...first, action: { ...first.action, playerId: forgedSeat } }, ...record.actions.slice(1)],
      }),
      { kind: "illegal-action", sequence: 0 },
      "an action by a seat that is not to act is refused where it stands",
    );
  });

  it("refuses a truncated log as unsettled", () => {
    const { record } = recordedShowdown();
    assert.deepEqual(
      refusalOf({ ...record, actions: record.actions.slice(0, -1) }),
      { kind: "unsettled" },
      "dropping the closing action leaves the hand unpaid",
    );
  });

  it("refuses an impossible word at the entry that claims it", () => {
    const { record } = recordedShowdown();
    const index = record.actions.findIndex((entry) => entry.action.type === "confirmWord");
    const entry = record.actions[index];
    assert.ok(entry, "the showdown record confirmed a word");

    const action = entry.action as { type: "confirmWord"; playerId: string; submission: { plays: TilePlay[] } };
    const forged = {
      ...entry,
      action: {
        ...action,
        submission: { plays: action.submission.plays.map((play) => ({ ...play, tileId: "forged-tile" })) },
      },
    };
    assert.deepEqual(
      refusalOf({ ...record, actions: record.actions.map((current) => (current === entry ? forged : current)) }),
      { kind: "illegal-action", sequence: index },
      "a word built from tiles nobody holds never becomes a word",
    );
  });

  it("refuses a clock that runs backwards or past the hand's end", () => {
    const { record } = recordedShowdown();
    const [first, second] = record.actions;
    assert.ok(first && second, "the log has its opening actions");

    assert.deepEqual(
      refusalOf({
        ...record,
        actions: [
          { ...first, atMs: second.atMs },
          { ...second, atMs: first.atMs },
          ...record.actions.slice(2),
        ],
      }),
      { kind: "time-order", sequence: 1 },
      "an entry whose clock reading precedes the one before it is out of order",
    );
    assert.deepEqual(
      refusalOf({ ...record, endedAtMs: NOW }),
      { kind: "time-order", sequence: 0 },
      "no entry may be taken after the hand's recorded end",
    );
  });

  it("pins the rules version and the dictionary artifact", () => {
    const { record } = recordedShowdown();

    assert.deepEqual(
      refusalOf({ ...record, rulesVersion: "0" }),
      { kind: "rules-version" },
      "an older rules version is refused, not re-judged under new rules",
    );
    assert.deepEqual(
      refusalOf({ ...record, dictionaryFingerprint: "b".repeat(64) }),
      { kind: "dictionary" },
      "the hand is re-verified only against the artifact it was judged with",
    );
  });

  it("refuses inputs that cannot start a hand", () => {
    const { record } = recordedShowdown();
    assert.deepEqual(
      refusalOf({
        ...record,
        seats: record.seats.map((seat) => ({ ...seat, initialStack: seat.playerId === "jay" ? 1_000 : 0 })),
      }),
      { kind: "unstartable" },
      "one funded seat is a session that has ended, not a hand to replay (ADR 0002)",
    );
  });

  it("summarizeHand refuses a hand that has not paid out", () => {
    assert.throws(() => summarizeHand(dealt()), OfflineActionError);
  });
});
