import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OfflineAction, PowerUpId, Tile } from "@wordpoker/contracts";
import { chooseBotPower, decideBotPowerUse } from "../src/bot/bot-power";
import { chooseOfflineWord, decideOfflineMove } from "../src/bot/bot";
import { botProfile } from "../src/bot/bot-profile";
import { OfflineActionError } from "../src/core/errors";
import { availableTiles, canUsePower, reduce, startHand, type OfflineState } from "../src/table/offline";
import { cloneState, testDictionary } from "./fixtures";

const NOW = 1_000_000;
const PLAYERS = ["hero", "ellis", "jay", "mira"];
const DICTIONARY = testDictionary(["AT", "QI", "RAT", "STAR"]);
const OFFERS: readonly PowerUpId[] = ["vowel_magnet", "random_wild"];

function draw(seed = 62): OfflineState {
  return startHand({ seed, players: PLAYERS, nowMs: NOW, dictionary: DICTIONARY, powerUps: { deal: "choose3" } });
}

function holding(seed = 62): OfflineState {
  let state = draw(seed);
  assert.ok(state.powers);
  for (const slot of state.powers.draw.slots) {
    state = reduce(state, { type: "pickPower", playerId: slot.playerId, powerUpId: "random_wild" }, NOW);
  }
  return state;
}

function tile(id: string, letter: string, points = 1): Tile {
  return { id, letter, points };
}

function rack(state: OfflineState, seat: number, tiles: readonly Tile[]): OfflineState {
  return { ...state, seats: state.seats.map((value, index) => index === seat ? { ...value, privateTiles: tiles } : value) };
}

function forbidden(): never { throw new Error("read hidden information"); }

/** Preserve public ids/statuses for legality, but make all hidden payloads unreadable. */
function poison(state: OfflineState, seat: number): OfflineState {
  const copy = cloneState(state);
  copy.seats.forEach((value, index) => {
    if (index !== seat) Object.defineProperty(value, "privateTiles", { get: forbidden });
  });
  for (let index = copy.revealed; index < copy.community.length; index += 1) {
    Object.defineProperty(copy.community, index, { get: forbidden });
  }
  Object.defineProperty(copy, "wordChecks", { get: forbidden });
  copy.wordWindow?.slots.forEach((slot) => {
    Object.defineProperty(slot, "draft", { get: forbidden });
    Object.defineProperty(slot, "submission", { get: forbidden });
  });
  copy.powers?.draw.slots.forEach((slot) => {
    if (slot.seat !== seat) {
      Object.defineProperty(slot, "offers", { get: forbidden });
      Object.defineProperty(slot, "picked", { get: forbidden });
    }
  });
  if (copy.powers !== undefined) {
    for (const playerId of PLAYERS.filter((id) => id !== PLAYERS[seat])) {
      Object.defineProperty(copy.powers.held, playerId, { get: forbidden });
    }
    const own = copy.powers.held[PLAYERS[seat] ?? ""];
    if (own !== undefined) Object.defineProperty(own, "swap", { get: forbidden });
  }
  return copy;
}

describe("offline bot powers (§44)", () => {
  it("pins reviewed picks for rack fit and the three seat personalities", () => {
    // Vowel-less racks favor Vowel Magnet; aggressive Jay also gives Wild more weight.
    for (const [seed, expected] of [
      [62, ["vowel_magnet", "random_wild", "vowel_magnet"]],
      [16, ["vowel_magnet", "vowel_magnet", "vowel_magnet"]],
      [127, ["vowel_magnet", "vowel_magnet", "random_wild"]],
    ] as const) {
      assert.deepEqual(PLAYERS.slice(1).map((id) => chooseBotPower(draw(seed), id)), expected);
    }
  });

  it("picks only offered powers, deterministically, without mutation or hidden reads", () => {
    for (const seed of [62, 16, 127]) {
      const state = draw(seed);
      const before = cloneState(state);
      for (let seat = 1; seat < 4; seat += 1) {
        const id = PLAYERS[seat];
        assert.ok(id);
        const picked = chooseBotPower(state, id);
        assert.ok(state.powers?.draw.slots[seat]?.offers.includes(picked));
        assert.equal(chooseBotPower(state, id), picked);
        assert.equal(chooseBotPower(poison(state, seat), id), picked);
      }
      assert.deepEqual(state, before);
    }
  });

  it("rejects absent, closed, picked and empty offers", () => {
    assert.throws(() => chooseBotPower(draw(), "ghost"), OfflineActionError);
    assert.throws(() => chooseBotPower(holding(), "mira"), OfflineActionError);
    const picked = reduce(draw(), { type: "pickPower", playerId: "mira", powerUpId: "random_wild" }, NOW);
    assert.throws(() => chooseBotPower(picked, "mira"), OfflineActionError);
    const state = draw();
    assert.ok(state.powers);
    const empty = { ...state, powers: { ...state.powers, draw: { ...state.powers.draw,
      slots: state.powers.draw.slots.map((slot) => ({ ...slot, offers: [] })),
    } } };
    assert.throws(() => chooseBotPower(empty, "mira"), OfflineActionError);
  });

  it("weights vowel-less racks by the reviewed formula for every style", () => {
    for (const seat of [1, 2, 3]) {
      let vowels = 0;
      for (let seed = 0; seed < 1024; seed += 1) {
        let state = rack(draw(seed), seat, [tile("b", "B"), tile("c", "C")]);
        assert.ok(state.powers);
        state = { ...state, powers: {
          ...state.powers, draw: { ...state.powers.draw,
            slots: state.powers.draw.slots.map((slot) => ({ ...slot, offers: OFFERS })),
          },
        } };
        if (chooseBotPower(state, PLAYERS[seat] ?? "") === "vowel_magnet") vowels += 1;
      }
      const expected = 4 / (4 + 0.5 + botProfile(seat).aggression);
      assert.ok(Math.abs(vowels / 1024 - expected) < 0.05, `${seat}: ${vowels / 1024}, expected ${expected}`);
    }
  });

  it("counts an alternative vowel face exactly like a primary vowel", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const primary = rack(draw(seed), 1, [tile("a", "A"), tile("b", "B")]);
      const alternative = rack(draw(seed), 1, [{ ...tile("a", "Z"), alternativeLetter: "A" }, tile("b", "B")]);
      assert.equal(chooseBotPower(primary, "ellis"), chooseBotPower(alternative, "ellis"));
    }
  });

  it("uses only its own tile at a live time, deterministically and without hidden reads or mutation", () => {
    const state = holding();
    const before = cloneState(state);
    const use = decideBotPowerUse(state, "mira", NOW);
    assert.ok(use, "seed 62's weak Mira spends its Mulligan on a dead tile");
    assert.equal(use.powerUpId, state.powers?.held.mira?.id);
    assert.ok(state.seats[3]?.privateTiles.some((tile) => tile.id === use.tileId));
    assert.deepEqual(decideBotPowerUse(state, "mira", state.endsAtMs - 1), use);
    assert.deepEqual(decideBotPowerUse(poison(state, 3), "mira", NOW), use);
    assert.deepEqual(state, before);
    const after = reduce(state, { type: "usePowerUp", playerId: "mira", ...use }, NOW);
    assert.equal(after.toActIndex, state.toActIndex);
    assert.equal(after.endsAtMs, state.endsAtMs);
    assert.deepEqual(after.betting, state.betting);
  });

  it("obeys engine legality and the exact turn and word deadlines", () => {
    const state = holding();
    assert.ok(state.powers);
    const classic = startHand({ seed: 62, players: PLAYERS, nowMs: NOW, dictionary: DICTIONARY });
    const variants = [classic, draw(), { ...state, powers: { ...state.powers, held: {} } },
      { ...state, powers: { ...state.powers, held: { mira: { id: "random_wild" as const, used: true } } } },
      { ...state, toActIndex: 1 }, rack(state, 3, []),
      { ...state, seats: state.seats.map((seat) => seat.id === "mira" ? { ...seat, folded: true } : seat) },
    ];
    for (const invalid of variants) assert.equal(decideBotPowerUse(invalid, "mira", NOW), null);
    assert.equal(decideBotPowerUse(state, "ghost", NOW), null);
    const window: OfflineState = { ...state, betting: null, toActIndex: null, phase: "river", revealed: 5,
      seats: state.seats.map((seat) => ({ ...seat, allIn: true })),
      wordWindow: { status: "open",
        slots: PLAYERS.map((playerId, seat) => ({ playerId, seat, status: "drafting" as const, draft: null })),
      },
    };
    for (const legal of [state, window]) {
      assert.ok(canUsePower(legal, "mira", legal.endsAtMs - 1));
      for (const offset of [0, 1]) assert.equal(decideBotPowerUse(legal, "mira", legal.endsAtMs + offset), null);
    }
    const confirmed: OfflineState = { ...window, wordWindow: { status: "open",
      slots: [{ seat: 3, playerId: "mira", status: "confirmed", submission: { plays: [] } }],
    } };
    assert.equal(decideBotPowerUse(confirmed, "mira", NOW), null);
    assert.deepEqual(decideBotPowerUse(poison(window, 3), "mira", NOW), decideBotPowerUse(window, "mira", NOW));
  });

  it("targets the first dead tile, then lowest value with id ties, without sorting the rack", () => {
    for (const tiles of [
      [tile("z", "Z"), tile("a", "X")],
      [tile("z", "A", 1), tile("a", "T", 1)],
      [tile("z", "A", 1), tile("a", "T", 2)],
      [tile("z", "A"), tile("a", "T"), tile("d", "X")],
    ]) {
      const expected = tiles.length === 3 ? "d" : tiles[1]?.points === 2 ? "z" : "a";
      let uses = 0;
      for (let seed = 0; seed < 50; seed += 1) {
        const state = rack(holding(seed), 3, tiles);
        const before = cloneState(state);
        const use = decideBotPowerUse(state, "mira", NOW);
        if (use !== null) { assert.equal(use.tileId, expected); uses += 1; }
        assert.deepEqual(state, before);
      }
      assert.ok(uses > 0);
    }
  });

  it("replays fixed Wild hands with separate legal pick/use/bet/confirm actions and a monotonic clock", () => {
    function play(seed: number): OfflineAction[] {
      let state = draw(seed);
      let now = NOW;
      const trace: OfflineAction[] = [];
      for (let step = 0; step < 250; step += 1) {
        if (state.phase === "payout") return trace;
        now += 900;
        let action: OfflineAction;
        if (now >= state.endsAtMs) {
          action = { type: state.powers?.draw.status === "open" ? "timeoutPowerDraw" :
            state.wordWindow?.status === "open" ? "timeoutWords" : "timeoutTurn" };
        } else if (state.powers?.draw.status === "open") {
          const slot = state.powers.draw.slots.find((slot) => slot.picked === null);
          assert.ok(slot);
          const powerUpId = slot.playerId === "hero" ? slot.offers[0] : chooseBotPower(state, slot.playerId);
          assert.ok(powerUpId);
          action = { type: "pickPower", playerId: slot.playerId, powerUpId };
        } else if (state.wordWindow?.status === "open") {
          let move: OfflineAction | undefined;
          for (const slot of state.wordWindow.slots) {
            if (slot.status !== "drafting") continue;
            const use = slot.playerId === "hero" ? null : decideBotPowerUse(state, slot.playerId, now);
            if (use !== null) { move = { type: "usePowerUp", playerId: slot.playerId, ...use }; break; }
            const submission = chooseOfflineWord({ available: availableTiles(state, slot.seat), dictionary: state.dictionary });
            if (submission !== null) { move = { type: "confirmWord", playerId: slot.playerId, submission }; break; }
          }
          if (move === undefined) { now = state.endsAtMs; action = { type: "timeoutWords" }; }
          else action = move;
        } else {
          const seat = state.seats[state.toActIndex ?? -1];
          assert.ok(seat);
          const use = seat.id === "hero" ? null : decideBotPowerUse(state, seat.id, now);
          action = use !== null ? { type: "usePowerUp", playerId: seat.id, ...use } : seat.id === "hero"
            ? { type: (state.betting?.currentBet ?? 0) > seat.committedRound ? "call" : "check", playerId: seat.id }
            : decideOfflineMove(state, seat.id);
        }
        if (action.type === "usePowerUp") {
          assert.ok(canUsePower(state, action.playerId, now));
          assert.ok(state.seats.find((seat) => seat.id === action.playerId)?.privateTiles.some((tile) => tile.id === action.tileId));
        }
        trace.push(action);
        state = reduce(state, action, now);
      }
      assert.fail("bounded replay did not finish");
    }
    for (const seed of [7, 42, 527, 20260919]) assert.deepEqual(play(seed), play(seed));
  });
});
