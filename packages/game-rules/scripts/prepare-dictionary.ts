/**
 * Dev/build-time: prepare the bundled dictionary artifact from the raw word list.
 *
 * The engine never reads files (AGENTS.md: the dictionary is injected data), so this
 * script is the only thing that touches `en_US-large.txt`, and it runs by hand or in a
 * build step — never at play time.
 *
 * Source: `en_US-large.txt` at the repository root — a broad en_US word list, *not* TWL
 * or SOWPODS. The raw file stays out of the repository; the artifact records its name,
 * line count, and SHA-256 so the prepared set stays pinned to the reviewed source.
 *
 * Policy (docs/rules/tiles.md §11–§12): trim, uppercase, keep only 2+ letter A–Z words
 * (drops `A's`, single letters, digits, punctuation, accents), dedupe, sort. Sorting is
 * what makes the artifact byte-identical for byte-identical input, whatever the row order.
 *
 * Usage: pnpm --filter @wordpoker/game-rules dictionary:prepare [path/to/en_US-large.txt]
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DICTIONARIES, type DictionaryId } from "../src/dictionary";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const defaultSourcePath = resolve(repoRoot, "en_US-large.txt");
const outPath = resolve(here, "../data/en_US-large.json");

/** Stable identity of the prepared set; `label` is what the client shows before play. */
const DICTIONARY_ID: DictionaryId = "en_US-large";
const DICTIONARY_LABEL = DICTIONARIES[DICTIONARY_ID].label;

/** A word the engine can accept: at least two A–Z letters, nothing else. */
const LEGAL_WORD = /^[A-Z]{2,}$/;

function normalize(text: string): string[] {
  const words = new Set<string>();
  for (const line of text.split("\n")) {
    const word = line.trim().toUpperCase();
    if (LEGAL_WORD.test(word)) words.add(word);
  }
  return [...words].sort();
}

function countLines(text: string): number {
  return text === "" ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

const sourcePath = resolve(process.argv[2] ?? defaultSourcePath);
const bytes = readFileSync(sourcePath);
const text = bytes.toString("utf8");
const lines = countLines(text);
const words = normalize(text);

const artifact = {
  id: DICTIONARY_ID,
  label: DICTIONARY_LABEL,
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
