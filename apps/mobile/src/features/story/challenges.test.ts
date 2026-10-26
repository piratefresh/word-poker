import { createDictionary, evaluateBestWord, fixedDeal } from "@wordpoker/game-rules";

import { CHALLENGES, starsFor, type Challenge } from "./challenges";

// The shipped list itself (jest can't take `loadDictionary`'s lazy import): the stars are only
// honest against the words the table will actually accept.
const dictionary = createDictionary(require("../../../../../packages/game-rules/data/en_US-large.json"));

function bestWord(challenge: Challenge) {
  const deal = fixedDeal({ seed: 1, playerCount: challenge.players.length, spec: challenge.deal });
  return evaluateBestWord({ available: [...(deal.privateTiles[0] ?? []), ...deal.community], dictionary });
}

test.each(CHALLENGES.map((challenge) => [challenge.id, challenge] as const))(
  "%s: the top star is the best word the hero's seven tiles can build",
  (_, challenge) => {
    const best = bestWord(challenge);
    expect(best?.score).toBe(challenge.stars[2]);
    expect(starsFor(challenge, best?.score ?? 0)).toBe(3);
    expect(starsFor(challenge, 0)).toBe(0);
  },
);

test("First Hand holds no seven-letter word: the Full Rack Bonus is Word Wizard's", () => {
  expect(bestWord(CHALLENGES[0]!)?.word.length).toBeLessThan(7);
});
