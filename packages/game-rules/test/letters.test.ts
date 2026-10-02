import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { LETTER_VALUES } from "../src/tiles/letters";

/**
 * The values are transcribed from the rules document, which is where the tiers are decided,
 * so this guard reads §6 back out of it: the table is pinned against the markdown the players
 * read rather than against a second copy of itself. Editing the doc — moving `K` to another
 * tier, say — fails here until `letters.ts` follows.
 */
const RULES_DOC = readFileSync(
  fileURLToPath(new URL("../../../docs/rules/scoring.md", import.meta.url)),
  "utf8",
);

/** §6's table as it is written: a tier's points, then the letters at that tier. */
function valuesFromRulesDoc(): Record<string, number> {
  const start = RULES_DOC.indexOf("## Letter Point Values");
  const end = RULES_DOC.indexOf("## Tile Bag Distribution");
  assert.ok(start >= 0 && end > start, "§6's letter-value table must stay where this guard can read it");

  const values: Record<string, number> = {};
  const rows = RULES_DOC.slice(start, end).matchAll(/^\|\s*(\d+)\s*\|\s*([A-Z](?:\s*,\s*[A-Z])*)\s*\|\s*$/gm);
  for (const row of rows) {
    const points = Number(row[1]);
    const letters = row[2];
    assert.ok(letters !== undefined, `§6 row "${row[0]}" does not list letters`);
    for (const letter of letters.split(/\s*,\s*/)) {
      values[letter] = points;
    }
  }

  return values;
}

describe("LETTER_VALUES", () => {
  it("matches §6's table letter for letter", () => {
    const fromRules = valuesFromRulesDoc();

    // A table this guard failed to parse would agree with anything, so its size is checked
    // before the comparison: 26 letters, each listed once.
    assert.equal(Object.keys(fromRules).length, 26, "§6 must list every letter exactly once");
    assert.deepEqual({ ...LETTER_VALUES }, fromRules);
  });

  it("covers the whole alphabet and nothing else", () => {
    assert.deepEqual(
      Object.keys(LETTER_VALUES).sort(),
      [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].sort(),
    );
  });

  it("is frozen, so no caller can reprice a letter for everyone else", () => {
    assert.ok(Object.isFrozen(LETTER_VALUES));
  });
});
