# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring
the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root. This is a single-context repo: there is no
  `CONTEXT-MAP.md`.
- **`docs/adr/`**: read the ADRs that touch the area you're about to work in.
- **`docs/FINAL_RULES.md`** and the focused files under `docs/rules/`: the gameplay spec the
  engine implements. Not a glossary — but when it names a concept (tiles, streets, the word
  window, showdown), that spelling is the one to use.

If `CONTEXT.md` or `docs/adr/` don't exist yet, proceed silently. `/domain-modeling`
(reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily
when a term or decision actually gets resolved.

## The vocabulary already has a home

`packages/game-rules` and `packages/contracts` are the two shared packages both sides
import (`AGENTS.md` §Workspace architecture), and their exported names — `dealHand`,
`WORD_WINDOW_MS`, `SubmissionResolution`, `ROUND_PHASES` — are the domain's terms in code.
Use those spellings in issues, proposals, and test names rather than a synonym.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   └── rules/              ← FINAL_RULES.md and the focused rule files
├── apps/
│   ├── mobile/
│   └── server/
└── packages/
    ├── contracts/
    └── game-rules/
```

## Use the glossary's vocabulary

When your output names a domain concept — an issue title, a refactor proposal, a
hypothesis, a test name — use the term as defined in `CONTEXT.md`, and the rules' spelling
where `CONTEXT.md` is silent. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently
overriding:

> _Contradicts ADR-0007 (…), but worth reopening because…_
