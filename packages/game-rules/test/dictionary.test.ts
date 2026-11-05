import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
 * these numbers are pinned independently of it: the ESDB export's fingerprint and line count
 * were taken before preparation (see data/README.md). Nothing below is derived from the artifact under
 * test; regenerating it from a different source or with different rules has to fail here.
 */
const SOURCE_SHA256 = "b50d11e4b493376f3e4f562c5c420560e0735af8e4fb1b20badd86c6c0b43e89";
const SOURCE_LINES = 108_339;
const ENTRY_COUNT = 78_656;

const ARTIFACT_PATH = fileURLToPath(new URL("../data/en_US-large.json", import.meta.url));

/** The artifact straight off disk: `JSON.parse` is the boundary, the assertions are the check. */
const artifact: DictionaryArtifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));

/** Words the rules doc's own examples use, plus two-letter entries the list is known to hold. */
const PRESENT = ["STRONG", "MONSTER", "MARKET", "AT", "TO", "ZOO"] as const;

/** Non-words of every kind §11 can be handed: below the length floor, absent, or never a word. */
const ABSENT = ["A", "Z", "ZA", "ZZZZ", "A'S", "123", "AAA", "ABB", "NASA", "LONDON", "XIV"] as const;

function artifactWith(overrides: Partial<DictionaryArtifact>): DictionaryArtifact {
  return { ...artifact, ...overrides };
}

describe("the shipped dictionary artifact", () => {
  it("records the reviewed source it was prepared from", () => {
    assert.equal(artifact.id, "en_US-large");
    assert.equal(artifact.source.file, "esdb-en-us-60.txt");
    assert.equal(artifact.source.sha256, SOURCE_SHA256, "prepared from a different raw list");
    assert.equal(artifact.source.lines, SOURCE_LINES, "raw list line count changed");
    assert.equal(artifact.copyright, readFileSync(new URL("../data/ESDB-COPYRIGHT.txt", import.meta.url), "utf8"));
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

describe("dictionary preparation", () => {
  it("filters before uppercasing, then deduplicates and sorts", () => {
    const directory = mkdtempSync(join(tmpdir(), "word-poker-dictionary-"));
    try {
      const source = join(directory, "words.txt");
      const output = join(directory, "dictionary.json");
      writeFileSync(source, "zoo\r\nAAA\nABB\nLondon\nNASA\naa\n cat \ncat\nto\na\nA's\ncafé\nstraße\n123\n");
      execFileSync(process.execPath, [
        "--import", "tsx",
        fileURLToPath(new URL("../scripts/prepare-dictionary.ts", import.meta.url)),
        source, output,
      ]);
      const prepared: DictionaryArtifact = JSON.parse(readFileSync(output, "utf8"));
      assert.deepEqual(prepared.words, ["AA", "CAT", "TO", "ZOO"]);
      assert.equal(prepared.count, 4);
      assert.equal(createDictionary(prepared).isWord("CAT"), true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
