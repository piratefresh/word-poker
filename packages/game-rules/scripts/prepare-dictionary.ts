/**
 * Dev/build-time: prepare the bundled dictionary artifact from the raw word list.
 *
 * The engine never reads files (AGENTS.md: the dictionary is injected data), so this
 * script is the only thing that touches the raw list, and it runs by hand or in a
 * build step — never at play time.
 *
 * Source: ESDB size 60, American English, variant level 1, without abbreviations or
 * special categories. See data/README.md for the pinned source and export command.
 *
 * Policy (docs/rules/tiles.md §11–§12): trim, keep only 2+ lowercase a–z words BEFORE
 * uppercasing (drops names, acronyms, single letters, punctuation, accents), dedupe, sort. Sorting is
 * what makes the artifact byte-identical for byte-identical input, whatever the row order.
 *
 * Usage: pnpm --filter @wordpoker/game-rules dictionary:prepare <source.txt> [output.json]
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DICTIONARIES } from "../src/words/dictionary";
import type { DictionaryId } from "@wordpoker/contracts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const outPath = resolve(process.argv[3] ?? resolve(here, "../data/en_US-large.json"));

/** Stable identity of the prepared set; `label` is what the client shows before play. */
const DICTIONARY_ID: DictionaryId = "en_US-large";
const DICTIONARY_LABEL = DICTIONARIES[DICTIONARY_ID].label;

/** Filter before uppercasing, while names and acronyms are still distinguishable. */
const LEGAL_WORD = /^[a-z]{2,}$/;

function normalize(text: string): string[] {
  const words = new Set<string>();
  for (const line of text.split("\n")) {
    const word = line.trim();
    if (LEGAL_WORD.test(word)) words.add(word.toUpperCase());
  }
  return [...words].sort();
}

function countLines(text: string): number {
  return text === "" ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

if (!process.argv[2]) {
  throw new Error("Pass an ESDB export path; see packages/game-rules/data/README.md");
}
const sourcePath = resolve(process.argv[2]);
const bytes = readFileSync(sourcePath);
const text = bytes.toString("utf8");
const lines = countLines(text);
const words = normalize(text);

const artifact = {
  id: DICTIONARY_ID,
  label: DICTIONARY_LABEL,
  copyright: readFileSync(resolve(here, "../data/ESDB-COPYRIGHT.txt"), "utf8"),
  source: {
    file: basename(sourcePath),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    lines,
  },
  count: words.length,
  words,
};

const json = `${JSON.stringify(artifact)}\n`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, json);

console.log(`dictionary:prepare — ${sourcePath}`);
console.log(
  `  source: ${artifact.source.file} (${bytes.length} bytes, ${lines} lines, sha256 ${artifact.source.sha256})`,
);
console.log(`  entries: ${words.length}`);
console.log(`  wrote: ${relative(repoRoot, outPath)} (${json.length} bytes)`);
