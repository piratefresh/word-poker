import { POWER_UPS, type HandRecordAction, type HistoryHand, type Tile } from "@wordpoker/contracts";

import { ledger } from "@/constants/theme";
import type { LocalHistoryHand } from "@/lib/history/history-store";

export type LogSource = "player" | "bot" | "timeout";

/** One action-log line: who, what, and an amount are styled separately. */
export interface LogLine {
  key: string;
  atMs: number;
  who: string;
  verb: string;
  amount?: string;
  /** Null for system rows (showdown, pots), which carry no pill. */
  source: LogSource | null;
}

const heroName = (hand: HistoryHand) => hand.seats.find((seat) => seat.playerId === hand.heroId)?.name ?? "You";
const nameOf = (hand: HistoryHand, playerId: string) => hand.seats.find((seat) => seat.playerId === playerId)?.name ?? playerId;
const standing = (hand: HistoryHand, playerId: string) => hand.summary.seats.find((seat) => seat.playerId === playerId);
const potLabel = (index: number) => (index === 0 ? "main pot" : "side pot");
// Timeouts and disconnects are both the clock acting for the seat.
const sourceOf = (source: HandRecordAction["source"]): LogSource => (source === "disconnect" ? "timeout" : source);

/** The log wording for one stored event; null for events that are never shown (drafts, checks). */
export function describeAction(hand: HistoryHand, entry: HandRecordAction): Omit<LogLine, "key" | "atMs"> | null {
  const { action } = entry;
  const source = sourceOf(entry.source);
  if (!("playerId" in action)) {
    switch (action.type) {
      case "timeoutTurn": return { who: "Clock", verb: "ran out on a turn", source };
      case "foldTurn": return { who: "Seat", verb: "auto-folded", source };
      case "timeoutWords": return { who: "Clock", verb: "ran out on words", source };
      case "timeoutPowerDraw": return { who: "Clock", verb: "ran out on the power draw", source };
      default: return null;
    }
  }
  const who = nameOf(hand, action.playerId);
  const me = action.playerId === hand.heroId;
  const s = me ? "" : "s";
  switch (action.type) {
    case "fold": return { who, verb: `fold${s}`, source };
    case "check": return { who, verb: `check${s}`, source };
    case "call": return { who, verb: `call${s}`, source };
    case "bet": return { who, verb: `bet${s}`, amount: String(action.amount), source };
    case "raise": return { who, verb: `raise${s} to`, amount: String(action.amount), source };
    case "allIn": return { who, verb: me ? "go all-in" : "goes all-in", source };
    case "confirmWord": {
      const result = standing(hand, action.playerId);
      return { who, verb: `reveal${s}`, amount: result?.word ? `${result.word} · ${result.score}` : undefined, source };
    }
    case "pickPower": return { who, verb: `pick${s}`, amount: POWER_UPS[action.powerUpId].title, source };
    case "usePowerUp": return { who, verb: `use${s}`, amount: POWER_UPS[action.powerUpId].title, source };
    default: return null;
  }
}

/** The ordered log: stored events, a showdown marker before the first reveal, then who took each pot. */
export function logLines(hand: HistoryHand): LogLine[] {
  const lines: LogLine[] = [];
  const showdown = hand.summary.outcome === "showdown";
  for (const entry of hand.actions) {
    if (showdown && entry.action.type === "confirmWord" && !lines.some((line) => line.who === "Table")) {
      lines.push({ key: "showdown", atMs: entry.atMs, who: "Table", verb: "showdown", source: null });
    }
    const line = describeAction(hand, entry);
    if (line) lines.push({ key: String(entry.sequence), atMs: entry.atMs, ...line });
  }
  hand.summary.pots.forEach((pot, index) => {
    const winners = pot.winners.map((id) => nameOf(hand, id));
    const single = winners.length === 1;
    const verb = single ? `${winners[0] === heroName(hand) ? "take" : "takes"} ${potLabel(index)}` : `split ${potLabel(index)}`;
    lines.push({ key: `pot-${index}`, atMs: hand.endedAtMs, who: single ? winners[0] : winners.join(", "), verb, amount: String(pot.amount), source: null });
  });
  return lines;
}

export interface SeatView {
  playerId: string;
  name: string;
  isHero: boolean;
  isBot: boolean;
  folded: boolean;
  /** Total of the pots this seat won; 0 when it won none. */
  won: number;
  net: number;
  start: number;
  end: number;
  word: string | null;
  score: number;
  tiles: readonly Tile[];
}

export function potShare(hand: HistoryHand, playerId: string): number {
  return hand.summary.pots.reduce((sum, pot) => sum + (pot.winners.includes(playerId) ? Math.floor(pot.amount / pot.winners.length) : 0), 0);
}

/** The hero first, then opponents in seat order. */
export function seatViews(hand: HistoryHand): SeatView[] {
  const views = hand.seats.map((seat): SeatView => {
    const result = standing(hand, seat.playerId);
    const won = potShare(hand, seat.playerId);
    const word = result?.word ?? null;
    const end = result?.finalStack ?? seat.initialStack;
    return {
      playerId: seat.playerId, name: seat.name, isHero: seat.playerId === hand.heroId,
      isBot: hand.mode === "offline" ? seat.playerId !== hand.heroId
        : hand.actions.some(({ source, action }) => source === "bot" && "playerId" in action && action.playerId === seat.playerId),
      // Opponents that folded never revealed tiles; place is null for seats out of the showdown.
      folded: hand.actions.some(({ action }) => action.type === "fold" && action.playerId === seat.playerId)
        || (result?.place === null && won === 0 && !word),
      won, net: end - seat.initialStack, start: seat.initialStack, end, word,
      score: result?.score ?? 0, tiles: result?.privateTiles ?? [],
    };
  });
  return [...views.filter((view) => view.isHero), ...views.filter((view) => !view.isHero)];
}

/** Chips only move between seats, so nets must cancel out. */
export const netsBalance = (views: readonly SeatView[]): boolean => views.reduce((sum, view) => sum + view.net, 0) === 0;

export interface RecordBadge { text: string; color: string; backgroundColor: string }

export function recordBadge({ hand, status }: Pick<LocalHistoryHand, "hand" | "status">): RecordBadge {
  if (hand.mode === "online") return { text: "RECORDED BY SERVER", color: "#2f6b3f", backgroundColor: "#d7e6c8" };
  if (status === "rejected") return { text: "UPLOAD REJECTED · UNRANKED", color: ledger.rejectedLink, backgroundColor: ledger.rejectedBg };
  if (status === "pending") return { text: "ON DEVICE · UNRANKED", color: "#8a5a10", backgroundColor: "#f4dfa6" };
  return { text: "VERIFIED · UNRANKED", color: "#2f6b3f", backgroundColor: "#d7e6c8" };
}

/** Ids of community tiles in the hero's submitted word; null when the hero submitted nothing. */
export function heroUsedTiles(hand: HistoryHand): ReadonlySet<string> | null {
  const plays = standing(hand, hand.heroId)?.submission?.plays;
  return plays ? new Set(plays.map((play) => play.tileId)) : null;
}
