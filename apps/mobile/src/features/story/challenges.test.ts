import { createDictionary, evaluateBestWord, topWords, fixedDeal, nodeStars, nodeThreshold, storyChapter, storyNode } from "@wordpoker/game-rules";

import { CHALLENGES, type Challenge } from "./challenges";

const KITCHEN = storyChapter("kitchen-table");
const starsFor = (challenge: Challenge, score: number) =>
  nodeStars(nodeThreshold(KITCHEN, storyNode(KITCHEN, challenge.id)), { won: true, score });

// The shipped list itself (jest can't take `loadDictionary`'s lazy import): the stars are only
// honest against the words the table will actually accept.
const dictionary = createDictionary(require("../../../../../packages/game-rules/data/en_US-large.json"));

function bestWord(challenge: Challenge) {
  const deal = fixedDeal({ seed: 1, playerCount: challenge.players.length, spec: challenge.deal });
  return evaluateBestWord({ available: [...(deal.privateTiles[0] ?? []), ...deal.community], dictionary });
}

test.each(CHALLENGES.map((challenge) => [challenge.id, challenge] as const))(
  "%s: the best word the hero's seven tiles can build, and only about that, earns 3★",
  (_, challenge) => {
    const best = bestWord(challenge)?.score ?? 0;
    expect(starsFor(challenge, best)).toBe(3);
    // 3★ is within reach of the lesson's word, not of any word: a third short of it is not 3★.
    expect(starsFor(challenge, Math.floor(best * 0.75))).toBeLessThan(3);
  },
);

test("First Hand holds no seven-letter word: the Full Rack Bonus is Word Wizard's", () => {
  expect(bestWord(CHALLENGES[0]!)?.word.length).toBeLessThan(7);
});

test("First Hand: Ellis's authored best word beats BOATS but not KNOBS, and uses no seven-letter rack", () => {
  const challenge = CHALLENGES[0]!;
  const deal = fixedDeal({ seed: 1, playerCount: challenge.players.length, spec: challenge.deal });
  const ellis = topWords({ available: [...(deal.privateTiles[1] ?? []), ...deal.community], dictionary }, 1)[0]!;
  expect(ellis.word.length).toBeLessThan(7);
  expect(ellis.score).toBeGreaterThan(10);
  expect(ellis.score).toBeLessThan(bestWord(challenge)!.score);
});
