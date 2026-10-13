import { isHandRecord, type OfflineAction } from "@wordpoker/contracts";
import { DICTIONARIES, createDictionary, reduce, startHand, verifyHandRecord } from "@wordpoker/game-rules";
import { OfflineHandRecorder } from "./hand-recorder";

const dictionary = createDictionary({
  id: "en_US-large", label: DICTIONARIES["en_US-large"].label, source: { file: "fixture", sha256: "a".repeat(64), lines: 1 },
  count: 1, words: ["AA"],
});

test.each(["off", "choose3"] as const)("captures replayable %s hands including a later deal and changing stacks", (powerUpDeal) => {
  let nowMs = 1_000_000;
  let state = startHand({ seed: 42, players: ["hero", "ellis", "jay", "mira"], dictionary, nowMs, powerUps: { deal: powerUpDeal } });
  const recorder = new OfflineHandRecorder(state, nowMs, "account-a");
  for (let hand = 1; hand <= 2; hand += 1) {
    while (state.phase !== "payout") {
      const action: OfflineAction = state.powers?.draw.status === "open" ? { type: "timeoutPowerDraw" } :
        { type: "fold", playerId: state.seats[state.toActIndex ?? 0].id };
      nowMs = Math.max(nowMs + 1, state.powers?.draw.status === "open" ? state.powers.draw.endsAtMs : nowMs);
      const next = reduce(state, action, nowMs);
      const record = recorder.transition(state, next, action, nowMs);
      state = next;
      if (record) {
        expect(isHandRecord(record)).toBe(true);
        expect(record.handNo).toBe(hand);
        expect(record.ranked).toBe(false);
        expect(record.seats.filter((seat) => seat.userId !== null)).toHaveLength(1);
        expect(verifyHandRecord(record, dictionary)).toMatchObject({ ok: true });
      }
    }
    nowMs += 1;
    const next = reduce(state, { type: "deal" }, nowMs);
    recorder.transition(state, next, { type: "deal" }, nowMs);
    state = next;
  }
});
