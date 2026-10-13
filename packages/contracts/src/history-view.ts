import { isHandRecord, type HandRecord, type HandRecordAction, type HandRecordSummary } from "./history";

/** Public history omits replay seeds, account IDs, hidden racks and private drafts. */
export interface HistoryHand {
  readonly id: string;
  readonly sessionId: string;
  readonly tableName?: string;
  readonly handNo: number;
  readonly mode: "online" | "offline";
  readonly ranked: boolean;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly dictionaryId: HandRecord["dictionaryId"];
  readonly heroId: string;
  readonly seats: readonly { playerId: string; name: string; initialStack: number }[];
  readonly summary: HandRecordSummary;
  readonly actions: readonly HandRecordAction[];
}

export interface HistoryPage {
  readonly hands: readonly HistoryHand[];
  readonly cursor: string | null;
  readonly hasMore: boolean;
}

export function isHistoryCursor(value: unknown): value is string {
  return typeof value === "string" && /^h1:\d{1,19}$/.test(value) &&
    BigInt(value.slice(3)) <= 9_223_372_036_854_775_807n;
}

/** One visibility policy for local offline rows and authenticated server reads. */
export function historyHand(record: Pick<HandRecord, "sessionId" | "handNo" | "mode" | "ranked" | "startedAtMs" | "endedAtMs" | "dictionaryId" | "seats" | "summary" | "actions"> & Partial<Pick<HandRecord, "config">>, id: string, heroId: string): HistoryHand {
  const visible = new Set(record.summary.seats.filter((seat) =>
    seat.playerId === heroId || (record.summary.outcome === "showdown" && seat.place !== null),
  ).map((seat) => seat.playerId));
  return {
    id, sessionId: record.sessionId, handNo: record.handNo, mode: record.mode,
    ...(record.config?.tableName ? { tableName: record.config.tableName } : {}),
    ranked: record.ranked, startedAtMs: record.startedAtMs, endedAtMs: record.endedAtMs,
    dictionaryId: record.dictionaryId, heroId,
    seats: record.seats.map(({ playerId, userId, name, initialStack }, index) => ({
      playerId, name: playerId === heroId ? "You" : name === userId ? `Seat ${index + 1}` : name,
      initialStack,
    })),
    summary: {
      ...record.summary,
      // Fold-outs never reveal the undealt streets.
      community: record.summary.outcome === "showdown" ? record.summary.community : [],
      seats: record.summary.seats.map((seat) => visible.has(seat.playerId) ? seat : {
        ...seat, privateTiles: [], submission: null, word: null, score: 0, reason: null,
      }),
    },
    actions: record.actions.filter(({ action }) => {
      if (action.type === "draftWord" || action.type === "checkWord") return action.playerId === heroId;
      return action.type !== "confirmWord" || visible.has(action.playerId);
    }),
  };
}

export function isHistoryHand(value: unknown): value is HistoryHand {
  if (typeof value !== "object" || value === null) return false;
  const hand = value as HistoryHand;
  if (typeof hand.id !== "string" || hand.id.length > 160 || typeof hand.heroId !== "string" ||
    !Array.isArray(hand.seats) || !hand.seats.some((seat) => seat?.playerId === hand.heroId) ||
    !hand.summary || !Array.isArray(hand.summary.community) || !Array.isArray(hand.actions)) return false;
  if (hand.summary.community.length !== 0 && hand.summary.community.length !== 5) return false;
  if (hand.tableName !== undefined && (typeof hand.tableName !== "string" || hand.tableName.length === 0 || hand.tableName.length > 64)) return false;
  // Reuse the bounded record validator; display intentionally lacks replay pins and hidden board.
  return isHandRecord({
    ...hand, version: 1, seed: 0, dealerSeat: 0, rulesVersion: "1",
    dictionaryFingerprint: "0".repeat(64),
    config: { smallBlind: 1, bigBlind: 2, turnDurationMs: 60_000, autoSubmitDrafts: false, powerUpDeal: "off" },
    seats: hand.seats.map((seat) => ({ ...seat, userId: null })),
    summary: { ...hand.summary, community: hand.summary.community.length ? hand.summary.community :
      Array.from({ length: 5 }, (_, index) => ({ id: `hidden-${index}`, letter: "A", points: 1 })),
    },
    actions: hand.actions.map((entry, sequence) => ({ ...entry, sequence })),
  });
}

export function isHistoryPage(value: unknown): value is HistoryPage {
  if (typeof value !== "object" || value === null) return false;
  const page = value as HistoryPage;
  return Array.isArray(page.hands) && page.hands.length <= 50 && page.hands.every(isHistoryHand) &&
    (page.cursor === null || isHistoryCursor(page.cursor)) && typeof page.hasMore === "boolean" &&
    (!page.hasMore || page.cursor !== null);
}
