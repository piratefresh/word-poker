import { HAND_RECORD_VERSION, type HandRecord, type HandRecordAction, type OfflineAction } from "@wordpoker/contracts";
import { RULES_VERSION, summarizeHand, type OfflineState } from "@wordpoker/game-rules";

export function historySessionId(): string {
  // An opaque deduplication identity, not a credential; native has no Web Crypto dependency.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 3) | 8).toString(16);
  });
}

export class OfflineHandRecorder {
  private actions: HandRecordAction[] = [];
  constructor(
    private dealt: OfflineState,
    private startedAtMs: number,
    private readonly ownerId: string,
    private readonly sessionId = historySessionId(),
  ) {}

  transition(previous: OfflineState, next: OfflineState, action: OfflineAction, atMs: number): HandRecord | null {
    if (previous === next) return null;
    if (action.type === "deal") {
      this.dealt = next;
      this.startedAtMs = atMs;
      this.actions = [];
      return null;
    }
    const source = action.type.startsWith("timeout") ? "timeout" :
      "playerId" in action && action.playerId !== "hero" ? "bot" : "player";
    this.actions.push({ sequence: this.actions.length, atMs, source, action });
    if (next.phase !== "payout" || previous.phase === "payout") return null;
    return {
      version: HAND_RECORD_VERSION, sessionId: this.sessionId, handNo: next.hand,
      mode: "offline", ranked: false, startedAtMs: this.startedAtMs, endedAtMs: atMs,
      seed: this.dealt.seed, dealerSeat: this.dealt.dealerSeat, rulesVersion: RULES_VERSION,
      dictionaryId: next.dictionary.id, dictionaryFingerprint: next.dictionary.source.sha256,
      config: {
        tableName: next.powers ? "Offline · Wild Power" : "Offline · Normal",
        ...next.stakes, turnDurationMs: next.turnDurationMs,
        autoSubmitDrafts: next.autoSubmitDrafts, powerUpDeal: next.powers ? "choose3" : "off",
      },
      seats: this.dealt.seats.map((seat) => ({
        playerId: seat.id, userId: seat.id === "hero" ? this.ownerId : null,
        name: seat.id === "hero" ? "You" : seat.id[0].toUpperCase() + seat.id.slice(1),
        initialStack: seat.stack + seat.committedHand,
      })),
      actions: [...this.actions], summary: summarizeHand(next),
    };
  }
}
