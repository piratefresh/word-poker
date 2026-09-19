#!/usr/bin/env node
/**
 * Keeps the workspace's pure packages pure.
 *
 * `packages/game-rules` (the deterministic engine) and `packages/contracts` (the wire
 * vocabulary) are shared by the native app and the server, so they must stay free of
 * frameworks, Node builtins, ambient clocks, and ambient randomness — the seed and the
 * clock are injected by the caller (AGENTS.md). Determinism itself is covered by unit
 * tests; this script is the mechanical half of the rule.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Repo-relative source roots that must stay framework-free. */
const PURE_SOURCES = ["packages/game-rules/src", "packages/contracts/src"];

/** Imports a pure package may never make. */
const FORBIDDEN_IMPORTS = [
  {
    pattern: /^(react|react-dom|react-native|expo|@expo\/|@react-native\/|@react-native-community\/)/,
    why: "framework import",
  },
  { pattern: /^(colyseus|@colyseus\/)/, why: "framework import" },
  { pattern: /^@wordpoker\/(mobile|server|db)$/, why: "app dependency (pure packages point one way only)" },
];

/** Ambient inputs that must be injected instead of read. */
const AMBIENT_READS = [
  { pattern: /\bMath\s*\.\s*random\b/, why: "ambient randomness — inject a seeded rng" },
  { pattern: /\bcrypto\s*\.\s*getRandomValues\b/, why: "ambient randomness — inject a seeded rng" },
  { pattern: /\bDate\s*\.\s*now\b/, why: "wall clock — inject a clock" },
  { pattern: /\bnew\s+Date\b/, why: "wall clock — inject a clock" },
  { pattern: /\bperformance\s*\.\s*now\b/, why: "wall clock — inject a clock" },
];

/** Layering: contracts is the vocabulary game-rules speaks, so it never points back. */
const LAYERING = [
  {
    source: "packages/contracts/src",
    pattern: /^@wordpoker\/game-rules$/,
    why: "contracts must not depend on the engine",
  },
];

const IMPORT_SPECIFIERS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

/** Blanks comment bodies while preserving line numbers, so prose about a rule is not a violation. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
}

function sourceFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const violations = [];
let scanned = 0;

for (const sourceRoot of PURE_SOURCES) {
  for (const file of sourceFiles(join(repoRoot, sourceRoot))) {
    scanned += 1;
    const lines = stripComments(readFileSync(file, "utf8")).split(/\r?\n/);
    const relPath = relative(repoRoot, file);
    const layer = LAYERING.filter((rule) => relPath.startsWith(rule.source));

    lines.forEach((line, index) => {
      const location = `${relPath}:${index + 1}`;

      for (const specifierPattern of IMPORT_SPECIFIERS) {
        for (const match of line.matchAll(specifierPattern)) {
          const specifier = match[1];
          if (isBuiltin(specifier)) {
            violations.push(`${location} — Node builtin import "${specifier}"`);
            continue;
          }
          for (const rule of [...FORBIDDEN_IMPORTS, ...layer]) {
            if (rule.pattern.test(specifier)) violations.push(`${location} — ${rule.why}: "${specifier}"`);
          }
        }
      }

      for (const rule of AMBIENT_READS) {
        if (rule.pattern.test(line)) violations.push(`${location} — ${rule.why}: ${line.trim()}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`check:boundaries — ${violations.length} violation(s):`);
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log(`check:boundaries — clean (${scanned} files in ${PURE_SOURCES.join(", ")})`);
