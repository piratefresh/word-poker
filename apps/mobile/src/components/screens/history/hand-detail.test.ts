import { POWER_UPS, type HandRecordAction, type HistoryHand, type RecordedHandAction } from "@wordpoker/contracts";

import type { LocalHistoryHand } from "@/lib/history/history-store";

import { describeAction, heroUsedTiles, logLines, netsBalance, recordBadge, seatViews } from "./hand-detail";

const T0 = new Date(2026, 9, 17, 21, 40).getTime();
const tile = (id: string, letter: string) => ({ id, letter, points: 1 });
const standing = (playerId: string, finalStack: number, extra: Partial<HistoryHand["summary"]["seats"][number]> = {}) =>
  ({ playerId, privateTiles: [], submission: null, word: null, score: 0, reason: null, place: null, finalStack, ...extra });

/** Hero wins 240 from Mira at showdown; Kat folded and Ace is a hidden folded bot. */
function hand(overrides: Partial<HistoryHand> = {}): HistoryHand {
  return {
    id: "s:1", sessionId: "s", handNo: 1, mode: "online", ranked: true, startedAtMs: T0, endedAtMs: T0 + 90_000,
    dictionaryId: "en_US-large", heroId: "hero",
    seats: [{ playerId: "mira", name: "Mira", initialStack: 1000 }, { playerId: "hero", name: "You", initialStack: 1000 },
      { playerId: "kat", name: "Kat", initialStack: 1000 }],
    summary: {
      outcome: "showdown", community: ["S", "T", "O", "N", "E"].map((l, i) => tile(`c${i}`, l)),
      seats: [
        standing("hero", 1160, { privateTiles: [tile("h0", "E"), tile("h1", "R")], word: "STONER", score: 24, place: 1,
          submission: { plays: [{ tileId: "c0" }, { tileId: "c1" }, { tileId: "c2" }, { tileId: "c3" }, { tileId: "h1" }] } }),
        standing("mira", 900, { word: "TONE", score: 8, place: 2, privateTiles: [tile("m0", "A")] }),
        standing("kat", 940),
      ],
      pots: [{ amount: 200, eligible: ["hero", "mira"], winners: ["hero"] }, { amount: 40, eligible: ["hero"], winners: ["hero"] }],
    },
    actions: [],
    ...overrides,
  };
}

const entry = (action: RecordedHandAction, source: HandRecordAction["source"] = "player", sequence = 0): HandRecordAction =>
  ({ sequence, atMs: T0 + sequence * 1000, source, action });
const describe_ = (action: RecordedHandAction, source?: HandRecordAction["source"], h = hand()) => describeAction(h, entry(action, source));
const submission = { plays: [{ tileId: "c0" }] };

test("describeAction words every stored event type, with first-person grammar for the hero", () => {
  expect(describe_({ type: "fold", playerId: "kat" })).toMatchObject({ who: "Kat", verb: "folds" });
  expect(describe_({ type: "fold", playerId: "hero" })).toMatchObject({ who: "You", verb: "fold" });
  expect(describe_({ type: "check", playerId: "mira" })).toMatchObject({ verb: "checks" });
  expect(describe_({ type: "call", playerId: "hero" })).toMatchObject({ who: "You", verb: "call" });
  expect(describe_({ type: "bet", playerId: "mira", amount: 20 })).toMatchObject({ verb: "bets", amount: "20" });
  expect(describe_({ type: "raise", playerId: "kat", amount: 240 })).toMatchObject({ verb: "raises to", amount: "240" });
  expect(describe_({ type: "allIn", playerId: "kat" })).toMatchObject({ verb: "goes all-in" });
  expect(describe_({ type: "allIn", playerId: "hero" })).toMatchObject({ verb: "go all-in" });
  expect(describe_({ type: "confirmWord", playerId: "mira", submission })).toMatchObject({ verb: "reveals", amount: "TONE · 8" });
  expect(describe_({ type: "confirmWord", playerId: "hero", submission })).toMatchObject({ verb: "reveal", amount: "STONER · 24" });
  expect(describe_({ type: "pickPower", playerId: "mira", powerUpId: "random_wild" })).toMatchObject({ verb: "picks", amount: POWER_UPS.random_wild.title });
  expect(describe_({ type: "usePowerUp", playerId: "hero", powerUpId: "blank_tile", tileId: "h0" })).toMatchObject({ who: "You", verb: "use" });
  expect(describe_({ type: "timeoutTurn" })).toMatchObject({ who: "Clock" });
  expect(describe_({ type: "foldTurn" })).toMatchObject({ verb: "auto-folded" });
  expect(describe_({ type: "timeoutWords" })).toMatchObject({ who: "Clock" });
  expect(describe_({ type: "timeoutPowerDraw" })).toMatchObject({ who: "Clock" });
});

test("drafts and word checks are not logged", () => {
  expect(describe_({ type: "draftWord", playerId: "hero", submission })).toBeNull();
  expect(describe_({ type: "checkWord", playerId: "hero", submission })).toBeNull();
});

test("timeouts and disconnects carry the TIMEOUT source; bots keep BOT", () => {
  expect(describe_({ type: "fold", playerId: "kat" }, "timeout")?.source).toBe("timeout");
  expect(describe_({ type: "fold", playerId: "kat" }, "disconnect")?.source).toBe("timeout");
  expect(describe_({ type: "fold", playerId: "kat" }, "bot")?.source).toBe("bot");
});

test("the log marks the showdown before the first reveal and ends with the pot takers", () => {
  const h = hand({ actions: [
    entry({ type: "call", playerId: "hero" }, "player", 0),
    entry({ type: "confirmWord", playerId: "mira", submission }, "player", 1),
    entry({ type: "confirmWord", playerId: "hero", submission }, "timeout", 2),
  ] });
  const lines = logLines(h);
  expect(lines.map((line) => `${line.who} ${line.verb}${line.amount ? ` ${line.amount}` : ""}`)).toEqual([
    "You call", "Table showdown", "Mira reveals TONE · 8", "You reveal STONER · 24", "You take main pot 200", "You take side pot 40",
  ]);
  expect(lines.filter((line) => line.source === null).map((line) => line.key)).toEqual(["showdown", "pot-0", "pot-1"]);
});

test("seats list the hero first; folded opponents show no tiles; winners carry their pot total", () => {
  const seats = seatViews(hand());
  expect(seats.map((seat) => seat.name)).toEqual(["You", "Mira", "Kat"]);
  expect(seats[0]).toMatchObject({ won: 240, net: 160, start: 1000, end: 1160, folded: false });
  expect(seats[1]).toMatchObject({ folded: false, word: "TONE", net: -100 });
  expect(seats[2]).toMatchObject({ folded: true, tiles: [], word: null, net: -60 });
});

test("the hero folding is read from the log; a hero fold-out win is not a fold", () => {
  const folded = seatViews(hand({ actions: [entry({ type: "fold", playerId: "hero" })] }));
  expect(folded[0].folded).toBe(true);
  const base = hand();
  const foldOut = seatViews({ ...base, summary: { ...base.summary, outcome: "fold-out", community: [],
    seats: [standing("hero", 1160), standing("mira", 900), standing("kat", 940)] } });
  expect(foldOut[0].folded).toBe(false);
});

test("bots are every opponent offline, and only sourced bots online", () => {
  expect(seatViews(hand({ mode: "offline" })).map((seat) => seat.isBot)).toEqual([false, true, true]);
  const online = seatViews(hand({ actions: [entry({ type: "fold", playerId: "kat" }, "bot")] }));
  expect(online.map((seat) => seat.isBot)).toEqual([false, false, true]);
});

test("nets balance when pots cover every loss, and flag when they do not", () => {
  expect(netsBalance(seatViews(hand()))).toBe(true);
  const broken = hand();
  expect(netsBalance(seatViews({ ...broken, summary: { ...broken.summary, seats: broken.summary.seats.map((s) =>
    s.playerId === "kat" ? { ...s, finalStack: 900 } : s) } }))).toBe(false);
});

test("community tiles outside the hero's word are the unused ones", () => {
  expect([...heroUsedTiles(hand())!]).toEqual(["c0", "c1", "c2", "c3", "h1"]);
  const base = hand();
  expect(heroUsedTiles({ ...base, summary: { ...base.summary, seats: [standing("hero", 1160)] } })).toBeNull();
});

test("the record badge covers online, pending, verified and rejected hands", () => {
  const row = (status: LocalHistoryHand["status"], mode: HistoryHand["mode"]) => ({ hand: hand({ mode }), status });
  expect(recordBadge(row("synced", "online")).text).toBe("RECORDED BY SERVER");
  expect(recordBadge(row("pending", "offline")).text).toBe("ON DEVICE · UNRANKED");
  expect(recordBadge(row("synced", "offline")).text).toBe("VERIFIED · UNRANKED");
  expect(recordBadge(row("rejected", "offline")).text).toBe("UPLOAD REJECTED · UNRANKED");
});
