import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideBotWord, decideOfflineMove } from "../src/bot/bot";
import { BOSS_TELL, PRESSURE_FULL, bossStyle, bossTells, bossWord, type BossId } from "../src/bot/boss";
import { fixedDeal, type FixedDealSpec } from "../src/tiles/fixed-deal";
import { reduce, startHand, type OfflineState } from "../src/table/offline";
import { TEST_DICTIONARY, testDictionary } from "./fixtures";

const NOW = 1_000_000;
const SEED = 20261105;
// Q and V: no word, no vowel to build on, nothing flexible — a weak pre-flop hand.
const JUNK: FixedDealSpec = { hands: { 1: ["Q", "V"] } };

/** Heads-up, hero on the button (first to act pre-flop), the boss in the big blind. */
function table(boss: BossId | null, spec: FixedDealSpec = JUNK, dictionary = TEST_DICTIONARY): OfflineState {
  return startHand({
    seed: SEED,
    players: ["hero", "boss"],
    nowMs: NOW,
    dictionary,
    deal: fixedDeal({ seed: SEED, playerCount: 2, spec }),
    ...(boss === null ? {} : { bosses: { boss } }),
  });
}

const raise = (state: OfflineState, amount: number) => reduce(state, { type: "raise", playerId: "hero", amount }, NOW);
const tell = (state: OfflineState) => bossTells(state)[0];

describe("story bosses (STO-974)", () => {
  it("a table without bosses has no tells and carries none", () => {
    const state = table(null);
    assert.equal(state.bosses, undefined);
    assert.deepEqual(bossTells(state), []);
  });

  it("The Professor's bar fills one step per doubling of the hero's bet, full at 16 big blinds", () => {
    const state = table("professor");
    assert.equal(tell(state)?.kind, "pressure");
    assert.equal(tell(state)?.level, 0);
    assert.equal(tell(raise(state, 40))?.level, 1);
    assert.equal(tell(raise(state, 80))?.level, 2);
    assert.equal(tell(raise(state, 320))?.level, PRESSURE_FULL);
    assert.equal(tell(raise(state, 320))?.max, PRESSURE_FULL);
  });

  it("The Professor calls a junk hand until his bar is full, then folds it", () => {
    const pushed = raise(table("professor"), 300);
    assert.equal(decideOfflineMove(pushed, "boss").type, "call");
    // The same junk hand from the ordinary seat-one bot lets it go.
    assert.equal(decideOfflineMove(raise(table(null), 300), "boss").type, "fold");
    const full = reduce(table("professor"), { type: "allIn", playerId: "hero" }, NOW);
    assert.equal(tell(full)?.level, PRESSURE_FULL);
    assert.equal(decideOfflineMove(full, "boss").type, "fold");
  });

  it("The Hustler raises the hand open even with junk", () => {
    const limped = reduce(table("hustler"), { type: "call", playerId: "hero" }, NOW);
    assert.equal(decideOfflineMove(limped, "boss").type, "raise");
    assert.equal(decideOfflineMove(reduce(table(null), { type: "call", playerId: "hero" }, NOW), "boss").type, "check");
  });

  it("The Hustler's stack is messiest on his weakest hand", () => {
    assert.deepEqual([tell(table("hustler"))?.kind, tell(table("hustler"))?.level], ["chip-stack", 3]);
  });

  it("Vowel Vinny's jar counts the vowels he holds; Lady Q glints on a rare tile", () => {
    assert.deepEqual([tell(table("vowel-vinny", { hands: { 1: ["A", "E"] } }))?.level, tell(table("vowel-vinny"))?.level], [2, 0]);
    assert.deepEqual([tell(table("lady-q"))?.kind, tell(table("lady-q"))?.level], ["glint", 1]);
    assert.equal(tell(table("lady-q", { hands: { 1: ["A", "E"] } }))?.level, 0);
  });

  it("The Dealer plays one of the four styles each hand, drawn from the hand's seed", () => {
    const styles = new Set(Array.from({ length: 60 }, (_, seed) => bossStyle("dealer", seed)));
    assert.deepEqual([...styles].sort(), Object.keys(BOSS_TELL).sort());
    const dealer = table("dealer");
    assert.equal(tell(dealer)?.kind, BOSS_TELL[bossStyle("dealer", dealer.seed)]);
    assert.equal(bossStyle("dealer", 7), bossStyle("dealer", 7));
  });

  it("each boss's word follows its style: long, vowel-heavy, rare letters, or the best score", () => {
    const dictionary = testDictionary(["ZA", "TEAS"]);
    const spec = { hands: { 1: ["Z", "A"] }, board: ["T", "E", "A", "S", "R"] };
    const deal = fixedDeal({ seed: SEED, playerCount: 2, spec });
    const options = { available: [...(deal.privateTiles[1] ?? []), ...deal.community], dictionary };
    assert.equal(bossWord(options, "professor")?.word, "TEAS");
    assert.equal(bossWord(options, "vowel-vinny")?.word, "TEAS");
    assert.equal(bossWord(options, "lady-q")?.word, "ZA");
    assert.equal(bossWord(options, "hustler")?.word, "ZA");
    // Through the table: the word a boss seat confirms in §19's window.
    const river = { ...table("professor", spec, dictionary), revealed: 5 };
    const plays = decideBotWord(river, 1)?.plays.length;
    assert.equal(plays, 4);
  });

  it("the boss seats ride into the next hand", () => {
    const folded = reduce(table("professor"), { type: "fold", playerId: "hero" }, NOW);
    assert.equal(folded.phase, "payout");
    assert.deepEqual(reduce(folded, { type: "deal" }, NOW).bosses, { boss: "professor" });
  });
});
