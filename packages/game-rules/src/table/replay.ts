/**
 * replay.ts — STO-454: replaying a recorded hand, and verifying what it claims it settled.
 *
 * A hand record (`@wordpoker/contracts`' `HandRecord`, STO-453) carries everything a hand was
 * dealt from — the seed, the seat order with the stacks they brought, the button, the table's
 * config — plus the accepted action log with the clock reading each action was taken at. That
 * is exactly `startHand`'s inputs plus a walk of `reduce`, so the same engine that played the
 * hand can play it again: {@link replayHand} rebuilds the table and runs the recorded actions
 * in order, refusing at the first entry the engine refuses, and reports the settled table it
 * ends on — or that the log ends before the hand paid out, which is a truncated record rather
 * than an illegal one.
 *
 * The record's `source` field (player, bot, timeout, disconnect) is metadata about who took
 * the action, not something the engine can check: a bot's fold and a player's fold are the
 * same fold. Replay judges the action itself, at the clock reading recorded with it — which
 * is what the original acceptance judged, so an accepted action replays as accepted and a
 * forged one (wrong seat, unbuildable word, clock already run out) is refused where it stands.
 *
 * §21.3's draw and §25's odd-chip order key their randomness to `handSeed(state) = seed +
 * hand − 1`, so the recorded hand number rides on the rebuilt state before the first action:
 * without it, a session's second hand would draw its tie-break from the first hand's stream
 * and settle ties differently than the table did.
 *
 * Versioning: a record names the rules and the dictionary it was played under, and replay
 * refuses a mismatch outright (`rules-version`, `dictionary`) rather than re-judging an old
 * hand under new rules and calling the answer a verification. How old versions stay readable:
 * the record's `summary` is a snapshot the authority derived when the hand was recorded, and
 * history display reads that snapshot — replay is only ever asked to *re-verify* same-version
 * hands. A rules change that alters settlement bumps `RULES_VERSION`, and pre-bump records
 * fail `rules-version` explicitly instead of silently mis-verifying.
 *
 * Purity is the engine's (AGENTS.md): no I/O, no wall clock, no ambient randomness — the
 * dictionary arrives as an argument, the only timestamps are the record's own, and the same
 * record replays to the same settlement every time.
 */

import type { HandRecord, HandRecordSummary, HandRecordStanding } from "@wordpoker/contracts";

import { OfflineActionError } from "../core/errors";
import type { Dictionary } from "../words/dictionary";
import { reduce, startHand, type OfflineState } from "./offline";

/**
 * The rules this build's engine settles hands under, stamped into every record a recorder
 * writes (STO-455 online, STO-457 offline) and pinned by every replay: `1` is the engine as
 * of the first recorded hands, and the number moves only when a change alters how a recorded
 * action log settles — never for a refactor.
 */
export const RULES_VERSION = "1";

/** Why a replay stopped: which pin or entry refused, in the record's own terms. */
export type ReplayRefusalKind =
  /** The record was played under rules this engine cannot re-verify. */
  | "rules-version"
  /** The dictionary handed over is not the artifact the hand was judged against. */
  | "dictionary"
  /** The recorded inputs cannot start a hand (fewer than two seats with chips, ADR 0002). */
  | "unstartable"
  /** An entry's clock reading goes backwards, or past the hand's recorded end. */
  | "time-order"
  /** The engine refused an action the log claims was accepted. */
  | "illegal-action"
  /** The log ends before the hand paid out. */
  | "unsettled"
  /** The log replays, but not to the settlement the record claims. */
  | "summary";

/** One refusal: the kind, the entry it stopped at when it stopped at one, and why. */
export interface ReplayRefusal {
  readonly kind: ReplayRefusalKind;
  /** The failing action entry's zero-based sequence, when the refusal names one. */
  readonly sequence?: number;
  readonly reason: string;
}

/** A replay that ran: the settled table, and the snapshot derived off it. */
export interface ReplayVerified {
  readonly ok: true;
  readonly state: OfflineState;
  readonly summary: HandRecordSummary;
}

/** A replay that refused: nothing was derived, and `refusal` says where and why. */
export interface ReplayRefused {
  readonly ok: false;
  readonly refusal: ReplayRefusal;
}

export type ReplayOutcome = ReplayVerified | ReplayRefused;

/**
 * The canonical settled summary of a paid-out hand — the same shape whether it is being
 * stamped on a record (the authority at settlement) or derived by a replay (verification), so
 * the two can only agree or name their difference, never drift.
 *
 * Folded and sitting-out seats carry `word`/`reason`/`place` as `null` and score `0`: the
 * ladder places only the seats that reached the reveal, and a private tile list is what the
 * seat was dealt, not what it showed. A seat that confirmed nothing has `submission: null` —
 * a draft is not a word, and the auto-submitted draft a table opted into confirms is recorded
 * as the confirmation it became.
 *
 * @throws {OfflineActionError} When the state has not paid out — a summary is a settlement's,
 * and a hand still in play has none to derive.
 */
export function summarizeHand(state: OfflineState): HandRecordSummary {
  const result = state.result;
  if (state.phase !== "payout" || result === null) {
    throw new OfflineActionError(
      `a hand's summary is derived once it has paid out; the table is at ${state.phase}`,
    );
  }

  const window = state.wordWindow;
  const seats: HandRecordStanding[] = state.seats.map((seat, index) => {
    const slot = window?.slots.find((candidate) => candidate.seat === index);
    const standing = result.standings.find((candidate) => candidate.playerId === seat.id);

    return {
      playerId: seat.id,
      privateTiles: [...seat.privateTiles],
      submission: slot?.status === "confirmed" ? slot.submission : null,
      word: standing?.word ?? null,
      score: standing?.score ?? 0,
      reason: standing?.reason ?? null,
      place: standing?.place ?? null,
      finalStack: seat.stack,
    };
  });

  return {
    outcome: window === null ? "fold-out" : "showdown",
    community: [...state.community],
    seats,
    pots: result.payout.pots.map((pot) => ({
      amount: pot.amount,
      eligible: [...pot.eligible],
      winners: [...pot.winners],
    })),
  };
}

/**
 * Replays one recorded hand: rebuilds the table the record says it was dealt from and runs its
 * accepted action log through the same `reduce` that accepted it the first time. Returns the
 * settled table and the summary derived off it, or the first thing the record gets wrong — an
 * engine refusal at the entry that forged it, a truncated log, a clock that runs backwards.
 *
 * The shape of `record` is the caller's to check (`isHandRecord`, STO-453); replay's refusal
 * kinds are about *playing* the hand, not re-validating its JSON. Pinned inputs
 * (`rulesVersion`, `dictionaryId`, `dictionaryFingerprint`) are checked here because playing
 * under the wrong rules or vocabulary is a replay that cannot mean anything.
 */
export function replayHand(record: HandRecord, dictionary: Dictionary): ReplayOutcome {
  const pinned = pin(record, dictionary);
  if (pinned !== null) return { ok: false, refusal: pinned };

  let state: OfflineState;
  try {
    const started = startHand({
      seed: record.seed,
      players: record.seats.map((seat) => seat.playerId),
      nowMs: record.startedAtMs,
      dictionary,
      wordBuilding: { autoSubmitDrafts: record.config.autoSubmitDrafts },
      stakes: { smallBlind: record.config.smallBlind, bigBlind: record.config.bigBlind },
      stacks: record.seats.map((seat) => ({ playerId: seat.playerId, stack: seat.initialStack })),
      dealerSeat: record.dealerSeat,
      turnDurationMs: record.config.turnDurationMs,
      powerUps: { deal: record.config.powerUpDeal },
    });
    // `startHand` names every hand it deals hand 1; §21.3/§25's draw streams key to
    // `seed + hand − 1`, so the recorded hand number rides along before the first action.
    state = { ...started, hand: record.handNo };
  } catch (error) {
    return { ok: false, refusal: refusedBy(error, "unstartable") };
  }

  let previousMs = record.startedAtMs;
  for (const [sequence, entry] of record.actions.entries()) {
    if (entry.atMs < previousMs || entry.atMs > record.endedAtMs) {
      return {
        ok: false,
        refusal: {
          kind: "time-order",
          sequence,
          reason:
            `entry ${sequence}'s clock reading (${entry.atMs}) is before the one before it ` +
            `(${previousMs}) or after the hand's recorded end (${record.endedAtMs})`,
        },
      };
    }
    previousMs = entry.atMs;

    try {
      state = reduce(state, entry.action, entry.atMs);
    } catch (error) {
      return { ok: false, refusal: refusedBy(error, "illegal-action", sequence) };
    }
  }

  if (state.phase !== "payout" || state.result === null) {
    return {
      ok: false,
      refusal: {
        kind: "unsettled",
        reason: `the recorded actions end with the table at ${state.phase}; a hand verifies once it has paid out`,
      },
    };
  }

  return { ok: true, state, summary: summarizeHand(state) };
}

/**
 * What an upload is checked against (STO-458): replay the record under the dictionary it
 * names, then hold its claimed settlement to the one the replay derived. The derived summary
 * is the authority's — a client's `summary` is a claim, and a changed score, word, winner, or
 * final stack is refused as `summary` rather than laundered into a match.
 */
export function verifyHandRecord(record: HandRecord, dictionary: Dictionary): ReplayOutcome {
  const replay = replayHand(record, dictionary);
  if (!replay.ok) return replay;

  const claimed = record.summary;
  if (
    replay.summary.outcome !== claimed.outcome ||
    !sameValue(replay.summary.community, claimed.community) ||
    !sameValue(replay.summary.seats, claimed.seats) ||
    !sameValue(replay.summary.pots, claimed.pots)
  ) {
    return {
      ok: false,
      refusal: {
        kind: "summary",
        reason: "the replayed settlement differs from the summary the record claims",
      },
    };
  }

  return replay;
}

/** The pins a replay cannot run without: the recorded rules version and dictionary artifact. */
function pin(record: HandRecord, dictionary: Dictionary): ReplayRefusal | null {
  if (record.rulesVersion !== RULES_VERSION) {
    return {
      kind: "rules-version",
      reason:
        `the hand was played under rules ${record.rulesVersion}; this engine re-verifies ${RULES_VERSION} ` +
        `(the stored summary stays readable; only same-version hands replay)`,
    };
  }
  if (dictionary.id !== record.dictionaryId) {
    return {
      kind: "dictionary",
      reason: `the hand was judged against "${record.dictionaryId}"; handed "${dictionary.id}"`,
    };
  }
  if (dictionary.source.sha256 !== record.dictionaryFingerprint) {
    return {
      kind: "dictionary",
      reason:
        `the hand was judged against artifact ${record.dictionaryFingerprint}; ` +
        `handed ${dictionary.source.sha256}`,
    };
  }
  return null;
}

/**
 * An engine refusal as a replay refusal. Only the engine's own named errors are refusals —
 * anything else is a bug in this module or the engine, and a bug is not a verdict.
 */
function refusedBy(
  error: unknown,
  kind: ReplayRefusalKind,
  sequence?: number,
): ReplayRefusal {
  if (!(error instanceof OfflineActionError)) throw error;

  const reason = `${error.name}: ${error.message}`;
  return sequence === undefined ? { kind, reason } : { kind, sequence, reason };
}

/**
 * Deep equality over the plain data a summary is made of: primitives, arrays, plain objects.
 * A wire parse keeps the key order its client happened to send, so the values are walked
 * rather than comparing serialisations.
 */
function sameValue(derived: unknown, claimed: unknown): boolean {
  if (derived === claimed) return true;
  if (typeof derived !== "object" || typeof claimed !== "object" || derived === null || claimed === null) {
    return false;
  }
  if (Array.isArray(derived) || Array.isArray(claimed)) {
    if (!Array.isArray(derived) || !Array.isArray(claimed) || derived.length !== claimed.length) {
      return false;
    }
    return derived.every((value, index) => sameValue(value, claimed[index]));
  }

  const left = derived as Record<string, unknown>;
  const right = claimed as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => key in right && sameValue(left[key], right[key]))
  );
}
