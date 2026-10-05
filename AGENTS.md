# Project overview

Word Poker is Texas Hold'em played with letter tiles: seats bet through
`preflop → flop → turn → river → payout` while building a word from their private tiles and the
community tiles, and the best-scoring word wins the pot. Modes: offline (CPU bots, in-process),
online (Colyseus rooms, Classic or Wild power-ups), and a tutorial. Coins live in a RevenueCat-backed
Wallet. Rules: [`docs/FINAL_RULES.md`](docs/FINAL_RULES.md). Product: [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md).

# Before writing any code

Stop at the first rung that holds:

1. **Does this need to be built at all?** (YAGNI)
2. **Does it already exist in this codebase?** Reuse the helper, util, or pattern that's already here — don't re-write it.
3. **Does the standard library already do this?** Use it.
4. **Does a native platform feature cover it?** Use it.
5. **Does an already-installed dependency solve it?** Use it.

Deletion over addition. Boring over clever. Fewest files possible.
Question complex requests: "Do you actually need X, or does Y cover it?"

# Setup commands

```bash
pnpm install
pnpm start                                   # Expo dev server (mobile)
pnpm --filter @wordpoker/mobile web          # Expo web
pnpm dev:server                              # Colyseus (not `pnpm server` — reserved name)
pnpm typecheck                               # every workspace
pnpm check:boundaries                        # import-boundary rules (e.g. economy)
pnpm --filter @wordpoker/mobile test         # jest
pnpm --filter @wordpoker/mobile lint         # expo lint
pnpm --filter @wordpoker/server test         # mocha
pnpm --filter @wordpoker/game-rules test     # node --test (same for contracts, db, economy)
```

Edits to an Expo `+api.ts` route need a dev-server restart.

# Project structure

```
apps/
├── mobile/src/          # Expo app
│   ├── app/             # expo-router routes (+ app/api/* server routes)
│   ├── auth/            # Better Auth client/ and server/
│   ├── components/      # UI: word-builder/, screens/game/, powers/, chip/, table/, ui/ …
│   ├── features/        # mode adapters: offline/, online/, table/, tutorial/
│   ├── lib/             # small shared helpers (format, wallet client, web-id, e2e …)
│   ├── motion/          # animation clocks/gates
│   └── constants/       # theme, links
└── server/              # Colyseus rooms; schema classes stay here
packages/
├── game-rules/          # pure deterministic engine
├── contracts/           # wire types + validators
├── db/                  # Postgres schema + wallet_event log
├── economy/             # server-only Wallet ops
└── 3d/                  # 3D/splat assets (not code)
```

Naming follows [`docs/CODE_STYLE.md`](docs/CODE_STYLE.md): kebab-case files (PascalCase server classes
where already established), PascalCase components and types, camelCase values, UPPER_SNAKE_CASE fixed
constants, `use-*.ts` hooks; mobile tests sit beside their subject as `*.test.ts`, other packages use their `test/` folder. Platform forks use
`.web.tsx` / `.android.ts` suffixes rather than runtime branches. Game logic never lives in an app —
see *Workspace architecture* below.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# UI components

Prefer `@expo/ui` whenever it supports the needed component and target platform. Use other components or custom UI when `@expo/ui` isn't a good fit.

# Drag and drop

Use **`react-native-reanimated-dnd`** (https://github.com/entropyconquers/react-native-reanimated-dnd) for
any drag-and-drop interaction — tiles into a word, chips into a pot, reorderable lists. Do not hand-roll pan
gestures or a custom DnD layer on top of Reanimated. The app mounts `GestureHandlerRootView` once at the root
(`apps/mobile/src/app/_layout.tsx`); wrap the surface that drags in the library's `DropProvider`, make the
sources `Draggable` and the targets `Droppable`, and keep a tap path for accessibility and tests.

The word builder's sortable strip is the one exception; see `apps/mobile/src/components/word-builder/AGENTS.md`.

# Area guides (read when you work there)

- **Word builder** (rack, strip, preview, the hand-rolled pan): `apps/mobile/src/components/word-builder/AGENTS.md`
- **Offline table** (CPU beat, seat actions, Wild power draw): `apps/mobile/src/features/offline/AGENTS.md`
- **End-to-end** (Maestro web/native, `pnpm smoke:online*`, the E2E user): `docs/agents/e2e.md`

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

# Agent skills

## Issue tracker

Issues live in Linear — project **Word Poker Native** (workspace `magnus-adhd-brain`,
team Story Time), through the Linear MCP tools. See `docs/agents/issue-tracker.md`.

## Triage labels

The five triage roles keep their own names; the category roles map `bug` → `Bug`,
`enhancement` → `Improvement`. See `docs/agents/triage-labels.md`.

## Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root.
See `docs/agents/domain.md`.

# Code style

Follow [`docs/CODE_STYLE.md`](docs/CODE_STYLE.md) across the monorepo.

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
- **`packages/economy`** — server-only Wallet operations (STO-346): the RevenueCat
  Developer API v2 client (the Wallet's balance is RevenueCat Virtual Currency `COIN`),
  `applyWalletChange`/`grantWelcome`/`retryPending` over `packages/db`'s `wallet_event`
  log, the coin catalog, and webhook parsing. It holds the secret key, so only
  `apps/mobile`'s API routes (and the server-only `src/auth/server/auth.ts`) and `apps/server` may
  import it — `pnpm check:boundaries` refuses it anywhere else.

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
