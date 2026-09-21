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

**One documented exception: the word builder's sortable strip** (`word-builder/strip.tsx`). The kit's
horizontal `Sortable` is the only thing that animates the other tiles out of a dragged tile's way, but it
arms its drag with a 200ms long-press that is not configurable — on the web, with a pointer, a tile reads as
one that will not move. So the strip drives its own pan (Reanimated + gesture-handler, the same ground the kit
sits on): it arms on `DRAG_ACTIVATE_PX` of travel, like dnd-kit's pointer sensor, and slides the rest of the
tiles aside as the dragged one crosses their places. This is the *only* place a pan is hand-rolled; everything
else still goes through the library. Do not spread this pattern — if a second surface needs it, lift it into a
shared hook first.

# Word builder

`apps/mobile/src/components/word-builder/` is the one builder for every mode: `WordHand` is the
sortable strip of tiles and goes in the felt's rack slot (`GameScreen`'s `rack` prop), and
`WordPreview` is the draft as one line of text directly above it — it draws nothing until the
strip spells something. The builder carries no buttons of its own: the shuffle is
`WordShuffleButton`, placed in the felt's action row (`GameScreen`'s `bettingLeading` prop) beside
fold, check and the bet, and the confirm is that row's check — §19's window is what turns it from
the tap that walks the round into the tap that locks the word in. `WordBuilder` owns the draft the
two share; a mode's adapter hands it a `WordDraft` — plays, word, score, reason, confirmed,
`open`, `confirmable` — and gets the seat's edits back as one `onDraft(plays)` call
(`apps/mobile/src/lib/use-offline-game.ts` is the offline adapter). Never write a second builder:
the engine judges the draft, the builder only draws it and reports it.

The word is built the whole hand, in parallel with the betting, not only at the river: `open` is
true while the seat may still play and sort tiles, and `confirmable` is the narrower gate that
§19's word window opens for locking the word in. The offline adapter holds the seat's draft
locally across every street and judges it against `game-rules` for the live preview, then hands
the confirmed submission to the engine.

The tiles are sorted where they lie: a tap toggles a tile in or out of the word *without moving
it*, a drag reorders it through the strip, and the word is the selected tiles read left to right —
the word's order *is* the strip's order, and there is no second row of played tiles. Shuffle
rearranges only the tiles the word does not hold. The seat's order is the one source of truth: the
strip re-seeds its layout from that order (see `strip.tsx`), so an external edit — a tap, a fresh
tile dealt — is never fought by a private copy of the list. A tile ignores a press for
`DRAG_SETTLE_MS` after a drop, because the pan does not cancel the tile's own press on the web —
the pointer never leaves the tile, since the tile travels with it.

The rack is a straight row of `TILE_METRICS`'s `medium` tile, and the places spread into the room
the felt gives them — up to a tile and `MAX_GAP` — closing in on each other (the gap first, then
some of the tile) when that room is narrower than the row, so a hand of seven stays on screen and
stays tappable. The strip's places and its drag are measured in that tile, so the two cannot
drift apart.

# End-to-end (web)

UI flows live in `.maestro/` and drive the Expo web build through Maestro's Chromium:

```bash
pnpm --filter @wordpoker/mobile web                 # in one terminal
maestro test --platform web .maestro/offline-hand.yaml
```

Headed is the default (`--headless` hides the browser; headless also takes `--screen-size`). Keep a Chrome
whose version matches the `chromedriver` on `PATH`. Each flow's header documents its own selectors and what
it needs.

## E2E test user

Flows behind the auth guard sign in as the shared E2E user `e2e@wordpoker.dev`, seeded straight into
Postgres (Better Auth's own hash) by an idempotent script — rerun it whenever the password stops working;
it resets the password and keeps the user's id:

```bash
node --env-file=apps/mobile/.env scripts/seed-test-user.mjs
```

`.maestro/sign-in.yaml` signs in as that user through the real sign-in screen (safe to rerun: it signs out
an existing session first, and always ends past the guard on the home screen). A headed run keeps the
session in Maestro's Chrome profile; a headless run starts on a fresh profile every time, so flows that
need a session compose the sign-in conditionally — `offline-hand.yaml` shows the pattern. Non-UI agents
don't need the browser at all: `POST /api/auth/sign-in/email` with the same JSON credentials returns the
session cookie.

The password is the default in that seed script, and it is deliberately not written here: this file is
injected into every session's system prompt, and omp's secret obfuscator (`.omp/secrets.yml`, enabled by
`.omp/config.yml`) leaves static prompt text alone. Take it from `.maestro/sign-in.yaml` — a read is
provider-visible text, so a session sees a `$$…$$` placeholder where the password sits, and a tool
argument carrying that placeholder is restored locally before it runs.

# End-to-end (native)

The same offline hand also runs as a device flow: `apps/mobile/.maestro/native/offline-hand.yaml`
(`appId:`, a `wordpoker://offline?seed=…` deep link instead of a URL, and the ids and labels a
device's accessibility tree exposes). It sits beside `eas.json` because that is the working directory
an EAS workflow job gets — a job's paths resolve from there, not from the repository root.

The build under test is eas.json's `e2e-test` profile: an .apk for Android, a simulator .app for
iOS, and `EXPO_PUBLIC_E2E_AUTH_BYPASS=1`. The table lives behind the sign-in guard and a device has
no auth server to reach, so that flag makes the guard take the seat as signed in
(`apps/mobile/src/lib/e2e.ts`). Never set it outside that profile — a build with it boots past the
guard. Nothing else is missing on a device: the dictionary ships in the bundle, the bots run
in-process, and the seed is the whole of the table's randomness.

```bash
cd apps/mobile
eas build --platform android --profile e2e-test    # or --platform ios
eas build:run --platform android --latest          # installs it on a booted emulator/device
maestro test --platform android .maestro/native/offline-hand.yaml
```

Android wants a booted emulator or an adb-visible device; `--platform ios` needs a Mac with a
Simulator. The flow takes the action row by testID (`action-check-call`, `action-wager`) — the felt's
nameplates print CHECK and CALL as seat status too, so a text selector there is ambiguous — and
everything else by the string a component prints, matched whole and case-sensitively, unlike the web.

EAS Workflows can run these flows on its own emulator and simulator — a `maestro` job with
`flow_path: .maestro/native` behind the `e2e-test` profile, as the Expo E2E example shows — but that
job type and the workers it needs (`linux-*-nested-virtualization` for Android, `macos-*` for iOS)
require a paid Expo plan on this account (September 2026), so no workflow file is checked in. Add
one when that changes; trigger it from an `e2e` label on a pull request, or by hand.

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
