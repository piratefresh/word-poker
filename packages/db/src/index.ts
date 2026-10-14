/**
 * index.ts — what the rest of the workspace may use this package for (STO-379, spec §6).
 *
 * The entities (so a caller can query them), one writer for the results screen's rating, and the
 * Wallet's audit log (STO-346). Nothing validates here — the API route owns the request shape and
 * refuses a bad body before it reaches this package, and the entity's column types are the
 * backstop under that.
 *
 * The ORM is cached for the life of the process (`orm.ts`). Every writer takes an optional `orm`
 * so a test can point at its own database without touching the process-wide one.
 */

import type { MikroORM } from "@mikro-orm/postgresql";

import { ResultsRating } from "./entities/index";
import { getOrm } from "./orm";

export {
  PlayerProgress,
  QuestHandLog,
  QuestProgress,
  ResultsRating,
  WALLET_EVENT_STATUSES,
  WalletEvent,
  type PlayerProgressRow,
  type QuestHandLogRow,
  type QuestProgressRow,
  type WalletEventRow,
  type WalletEventStatus,
} from "./entities/index";
export { closeOrm, getOrm } from "./orm";
export { pgConnectionString } from "../mikro-orm.config";
export {
  GameSession, GameHand, HandSeat, HandAction,
  type GameSessionRow, type GameHandRow, type HandSeatRow, type HandActionRow,
} from "./entities/index";
export {
  playerProgress,
  questProgress,
  recordQuestHand,
  setLevelPaid,
  streakDates,
  type PlayerProgressRecord,
  type QuestProgressEntry,
  type QuestProgressMap,
  type QuestProgressRecord,
} from "./quests";
export { adoptGuestHistory, countPlayedHands } from "./guest";
export {
  hasWelcomeEvent,
  openWalletEvent,
  pendingWalletEvents,
  recordReportedEvent,
  settleWalletEvent,
  type OpenWalletEventInput,
  type ReportedWalletEventInput,
  type SettleWalletEventInput,
  type WalletEventRecord,
} from "./wallet-event";

/** One hand's report: which hand, how it felt, and what stood out about it. */
export interface ResultsRatingInput {
  /** The hand's number within its table (`HAND #18`). */
  readonly handNo: number;
  /** The seed the hand was dealt from — what makes a report replayable. */
  readonly seed: number;
  /** 1–5, or null when the player left only tags or a note. */
  readonly rating: number | null;
  readonly tags: readonly string[];
  /** The player's own words; empty when the form was left to the chips. */
  readonly note: string;
}

/** Stores one rating and resolves with its id. */
export async function saveResultsRating(
  input: ResultsRatingInput,
  options: { orm?: MikroORM } = {},
): Promise<string> {
  const instance = options.orm ?? (await getOrm());
  const em = instance.em.fork();

  const rating = em.create(ResultsRating, {
    handNo: input.handNo,
    seed: input.seed,
    rating: input.rating,
    // Copied rather than aliased: the entity owns its array, and the caller's may be frozen.
    tags: [...input.tags],
    note: input.note,
  });

  em.persist(rating);
  await em.flush();

  return rating.id;
}
export { displayName, recordReferral, referrerOf, paidReferralCount, referralCount, friendCode, userForFriendCode, requestFriend, acceptFriend, removeFriend, friendList, areFriends } from "./friends";
export { notifyUsers, savePushToken, deletePushToken, type NotificationKind } from "./notify";
export { beat, goOffline, isOnline, inviteToTable, takeInvites, PRESENCE_GRACE_MS } from "./presence";
export { saveHistoryHand, handRecordDigest, HandRecordConflictError } from "./history";
export { readHistoryHands, readHistoryHand } from "./history-read";
