import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DICTIONARIES,
  DictionaryArtifactError,
  createDictionary,
  loadDictionary,
  type DictionaryArtifact,
} from "../src/words/dictionary";

/**
 * The dictionary is prepared data (`dictionary:prepare`) that no reviewer reads end to end, so
 * these numbers are pinned independently of it: the raw list's fingerprint was taken from the
 * reviewed source (`sha256sum en_US-large.txt` — 1,800,994 bytes, 168,211 lines) and the entry
 * count from the same normalization policy. Nothing below is derived from the artifact under
 * test; regenerating it from a different source or with different rules has to fail here.
 */
const SOURCE_SHA256 = "5168f54df086cfcbf4980ceef028b99d133df057e2734181a0b77b809b28d2b0";
const SOURCE_LINES = 168_211;
const ENTRY_COUNT = 141_962;

const ARTIFACT_PATH = fileURLToPath(new URL("../data/en_US-large.json", import.meta.url));

/** The artifact straight off disk: `JSON.parse` is the boundary, the assertions are the check. */
const artifact: DictionaryArtifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));

/** Words the rules doc's own examples use, plus two-letter entries the list is known to hold. */
const PRESENT = ["STRONG", "MONSTER", "MARKET", "QI", "AA"] as const;

/** Non-words of every kind §11 can be handed: below the length floor, absent, or never a word. */
const ABSENT = ["A", "Z", "ZA", "ZZZZ", "A'S", "123"] as const;

function artifactWith(overrides: Partial<DictionaryArtifact>): DictionaryArtifact {
  return { ...artifact, ...overrides };
}

describe("the shipped dictionary artifact", () => {
  it("records the reviewed source it was prepared from", () => {
    assert.equal(artifact.id, "en_US-large");
    assert.equal(artifact.source.file, "en_US-large.txt");
    assert.equal(artifact.source.sha256, SOURCE_SHA256, "prepared from a different raw list");
    assert.equal(artifact.source.lines, SOURCE_LINES, "raw list line count changed");
  });

  it("holds the pinned entries and only playable words", () => {
    assert.equal(artifact.count, ENTRY_COUNT);
    assert.equal(artifact.words.length, ENTRY_COUNT, "artifact is truncated or padded");

    for (const word of artifact.words) {
      assert.match(word, /^[A-Z]{2,}$/, `"${word}" breaks the normalization policy`);
    }
  });

  it("carries only the labels this build displays", () => {
    assert.equal(artifact.label, DICTIONARIES["en_US-large"].label);
  });
});

describe("loadDictionary", () => {
  it("answers the pinned vocabulary, however the caller spells it", async () => {
    const dictionary = await loadDictionary();

    assert.equal(dictionary.size, ENTRY_COUNT);
    for (const word of PRESENT) {
      assert.ok(dictionary.isWord(word), `expected "${word}" to be a word`);
      assert.ok(dictionary.isWord(word.toLowerCase()), `expected "${word}" lowercase to match`);
      assert.ok(dictionary.isWord(`  ${word.toLowerCase()} `), `expected " ${word} " to match`);
    }
  });

  it("refuses everything the artifact cannot hold", async () => {
    const dictionary = await loadDictionary();

    for (const word of ABSENT) {
      assert.ok(!dictionary.isWord(word), `expected "${word}" not to be a word`);
    }
    // Upper-casing would turn these into words the tiles could never spell.
    assert.ok(!dictionary.isWord("ß"));
    assert.ok(!dictionary.isWord("straße"));
  });
});

describe("createDictionary", () => {
  it("refuses an artifact for a dictionary no mode can ask for", () => {
    assert.throws(
      () => createDictionary(artifactWith({ id: "twl" })),
      (error: Error) => {
        assert.ok(error instanceof DictionaryArtifactError);
        assert.match(error.message, /twl/);
        return true;
      },
    );
  });

  it("refuses a label that disagrees with the displayed name", () => {
    assert.throws(
      () => createDictionary(artifactWith({ label: "en_US-large" })),
      DictionaryArtifactError,
    );
  });

  it("refuses a count that disagrees with the words it arrived with", () => {
    assert.throws(
      () => createDictionary(artifactWith({ count: ENTRY_COUNT - 1 })),
      DictionaryArtifactError,
    );
  });

  it("refuses words the binary search cannot reach", () => {
    assert.throws(
      () => createDictionary(artifactWith({ count: 2, words: ["STRONG", "MARKET"] })),
      DictionaryArtifactError,
    );
    assert.throws(
      () => createDictionary(artifactWith({ count: 2, words: ["MARKET", "MARKET"] })),
      DictionaryArtifactError,
    );
  });
});

describe("dictionary prefix search", () => {
  it("finds exact words and their prefixes without admitting invalid characters", () => {
    const dictionary = createDictionary(artifactWith({ count: 3, words: ["AT", "CATS", "QI"] }));
    for (const prefix of ["", "A", "AT", "CA", "CAT", "CATS", " qi "]) assert.equal(dictionary.hasPrefix?.(prefix), true, prefix);
    for (const prefix of ["B", "CATZ", "QIY", "ZZ", "?", "A1"]) assert.equal(dictionary.hasPrefix?.(prefix), false, prefix);
    assert.equal(createDictionary(artifactWith({ count: 0, words: [] })).hasPrefix?.(""), false);
  });
});
