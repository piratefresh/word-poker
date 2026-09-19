# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Game rules spec

The canonical gameplay rules live in [`docs/FINAL_RULES.md`](docs/FINAL_RULES.md), which
indexes the focused rule files under [`docs/rules/`](docs/rules/) (balances & buy-ins,
scoring, tiles, hand flow, betting & pots, table lifecycle, interface, edge cases). When
implementing or changing game logic, treat these as the source of truth and keep them in
sync with the code in `packages/game-rules` and `packages/contracts`.

# Story tracker

Stories and bugs for this repo live in the Linear project **Word Poker Native**
(workspace `magnus-adhd-brain`, team Story Time):

https://linear.app/magnus-adhd-brain/project/word-poker-native-8db6058274e1

Current epic: **Native workspace foundation** (STO-260). Create work as a
ticket in that project rather than as a doc in this repo.

# Workspace architecture

pnpm monorepo: `apps/*` (deployables) + `packages/*` (shared libs). Apps today:
`apps/mobile` (Expo) and `apps/server` (Colyseus). Never duplicate game logic between
them — it lives in a shared package so client and server can never disagree on the rules.

- **`packages/game-rules`** — the pure, deterministic engine: word/hand evaluation,
  scoring, legal-move validation, the betting-phase machine
  (`preflop → flop → turn → river → payout`), and round/timer math. No I/O, no framework
  (no Colyseus, no React), no wall-clock or RNG reads inside — inject the clock and seed
  so the same inputs always give the same outputs.
- **`packages/contracts`** — the wire vocabulary both sides agree on: client→server
  action/command types, server→client event and state shapes, shared enums (e.g.
  `ROUND_PHASES`), and their validators. `apps/server` and `apps/mobile` both import this
  to type the socket boundary.

Authority model: the **server is the source of truth** — it owns all mutation, runs
`game-rules` to advance state and reject illegal actions. The **client imports the same
`game-rules` only for optimistic prediction / instant UI** (preview a move, grey out
illegal ones); it never treats its own state as authoritative, and the server always wins
on reconcile.

Caution: `@colyseus/schema` state classes are server-runtime-specific — keep them in
`apps/server` as a projection of the domain types. Put the domain/message types in
`contracts`, not the Colyseus schema.

`packages/game-rules` (the seeded rng so far) and `packages/contracts` (`ROUND_PHASES`,
the tile/player/action types) are the shared packages; `apps/server` consumes them as
TypeScript source.
