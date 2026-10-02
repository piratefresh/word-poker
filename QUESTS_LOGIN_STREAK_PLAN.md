# Quests & Login Streak — Coin Rewards

## Context

The game has no progression: hands pay table chips and nothing carries between sessions. The user wants **quests that unlock coins** (win with a 2/3/4/5/6-letter word, win a pot over 500, …) plus a **daily login streak** that pays coins. Coins land in a new server-side **coin ledger** (Postgres via `@wordpoker/db`), tagged by source so a later RevenueCat purchase webhook can credit `source: "purchase"` with zero rework. No RevenueCat SDK/webhook work is in this plan. Both tables count: offline (engine in-process) and online (Colyseus room) — both adapters already converge on one settled-hand payload (`SettledHand` → `buildSettledSnapshot`, `apps/mobile/src/components/screens/results/results-snapshot.ts`), and quest facts are derived from exactly that, client-reported like the results rating (`results-rating+api.ts` precedent): the server validates shape and dedupes, not re-judges. The "submit an adjective" quest is dropped for v1 (the shipped dictionary has no part-of-speech data); quest predicates use only facts the engine already reports.

## Approach

Order builds a dependency tree; each step leaves the workspace typechecking with its own tests passing.

### Step 0 — Linear tickets

File the story in Linear project **Word Poker Native** (team Story Time) via the Linear MCP tools, epic **Native workspace foundation** (STO-260): one story for this feature, linking the sub-areas below as checklist items.

### Step 1 — Quest catalog + pure evaluator in `packages/game-rules`

New `packages/game-rules/src/quests.ts` (pure, no I/O — same rules as the rest of the engine):

```ts
export interface QuestDefinition {
  readonly id: QuestId;          // string literal union
  readonly title: string;        // UI copy, e.g. "SHORT AND SWEET"
  readonly description: string;  // one line, e.g. "Win a showdown with a 2-letter word."
  readonly goal: number;         // target count (1 = one-shot)
  readonly reward: number;       // coins paid into the wallet on completion
}
export const QUEST_CATALOG: readonly QuestDefinition[];

/** One settled hand, from the hero's chair — the only input quest judging gets. */
export interface QuestHandFacts {
  readonly revealed: boolean;          // showdown reached (§20); false = fold-out (§26)
  readonly heroWon: boolean;           // place 1 at a reveal, or took the pot on a fold-out
  readonly heroWord: string | null;    // hero's revealed word, uppercase; null if none
  readonly heroScore: number;          // hero's §7 total, 0 when no word
  readonly heroDecidedBy: ShowdownDecider | null;  // what fixed the hero's place
  readonly pot: number;                // every chip the hand's pots hold
  readonly wildTable: boolean;
  readonly heroUsedPower: boolean;     // a power rides the hero's street action
}

export interface QuestProgressEntry { readonly progress: number; readonly streak: number; readonly done: boolean; }
export type QuestProgressMap = Record<QuestId, QuestProgressEntry>;

export function emptyQuestProgress(): QuestProgressMap;
/** Pure: one hand's effect on the whole map. Returns the next map and the quests this hand completed. */
export function applyQuestHand(map: QuestProgressMap, facts: QuestHandFacts): { next: QuestProgressMap; completed: readonly QuestId[] };
```

Catalog (exact ids, goals, rewards — retuning numbers later is a data-only change):

| id | title | description | goal | reward |
| --- | --- | --- | --- | --- |
| `win-word-2` | SHORT AND SWEET | Win a showdown with a 2-letter word. | 1 | 100 |
| `win-word-3` | TRIPLE THREAT | Win a showdown with a 3-letter word. | 1 | 75 |
| `win-word-4` | FOURS ARE WILD | Win a showdown with a 4-letter word. | 1 | 75 |
| `win-word-5` | HIGH FIVE | Win a showdown with a 5-letter word. | 1 | 100 |
| `win-word-6` | SIX SHOOTER | Win a showdown with a 6-letter word. | 1 | 150 |
| `win-word-7` | FULL RACK | Win a showdown using all seven tiles. | 1 | 250 |
| `word-25` | HEAVY HITTER | Win a showdown with a word worth 25+ points. | 1 | 200 |
| `heavy-letter` | RARE FIND | Play a word containing a J, X, Q or Z. | 1 | 100 |
| `pot-500` | POT SNATCHER | Win a pot worth more than 500 chips. | 1 | 200 |
| `fold-out` | LAST ONE STANDING | Win a hand where every other seat folded. | 1 | 150 |
| `tile-draw` | LUCK OF THE DRAW | Win first place on the tiebreaking tile draw. | 1 | 150 |
| `wild-power-win` | POWER PLAY | Win a hand at a Wild table after using your power. | 1 | 150 |
| `hands-25` | NIGHT OUT | Play 25 hands. | 25 | 100 |
| `wins-10` | WINNER WINNER | Win 10 hands. | 10 | 150 |
| `win-streak-3` | ON A ROLL | Win 3 hands in a row. | 3 | 200 |

Predicate rules (what `applyQuestHand` implements, exactly):
- Word ladder + `word-25`: `facts.revealed && facts.heroWon` and `heroWord.length === L` / `heroScore >= 25`.
- `heavy-letter`: `facts.revealed && facts.heroWord !== null && /[JXQZ]/.test(heroWord)` (played, not won).
- `pot-500`: `facts.heroWon && facts.pot > 500` (fold-out counts).
- `fold-out`: `!facts.revealed && facts.heroWon`.
- `tile-draw`: `facts.revealed && facts.heroWon && facts.heroDecidedBy === "tile-draw"`.
- `wild-power-win`: `facts.heroWon && facts.wildTable && facts.heroUsedPower`.
- `hands-25`: +1 for every hand; `wins-10`: +1 iff `heroWon`.
- `win-streak-3`: `streak = heroWon ? streak + 1 : 0`, complete at 3 (never decrements `progress` past what it reached; `progress` holds the best streak reached).
- Completed quests never accrue further; `applyQuestHand` treats a `done` entry as frozen. Function is pure — same inputs, same outputs, input map untouched.

Tests `packages/game-rules/test/quests.test.ts` (node test runner, mirrors existing suites): catalog invariants (unique ids, `goal >= 1`, `reward > 0`, every `QuestId` present); each predicate true/false; fold-out vs reveal; streak reset on a loss; counter completion boundary (exactly at goal, not over); purity (input map not mutated); double-apply idempotence once done. Export from `packages/game-rules/src/index.ts`.

### Step 2 — Wire vocabulary in `packages/contracts`

New `packages/contracts/src/quests.ts` + export from `src/index.ts`:

```ts
export const QUEST_WALLET_SOURCES = ["quest", "streak", "grant", "purchase"] as const;
export type QuestWalletSource = (typeof QUEST_WALLET_SOURCES)[number];

/** The claim the mobile client POSTs once per settled hand. */
export interface QuestHandClaim {
  readonly handToken: string;     // client-generated, unique per settled hand; the dedupe key
  readonly facts: QuestHandFacts; // structurally validated, never re-judged
}
export function isQuestHandClaim(value: unknown): value is QuestHandClaim; // recursive shape check, mirrors isBettingAction style

export interface QuestStateResponse {
  readonly coins: number;                                  // wallet balance
  readonly streak: { readonly current: number; readonly longest: number; readonly dayCreditedToday: boolean };
  readonly quests: readonly { readonly id: QuestId; readonly progress: number; readonly goal: number; readonly done: boolean }[];
}
export interface QuestClaimResponse { readonly completed: readonly QuestId[]; readonly coins: number; readonly duplicate: boolean; }
```

`QuestId`/`QuestHandFacts` types are imported from `@wordpoker/contracts` by `game-rules` — declare them here (contracts owns the wire vocabulary) and have game-rules import the *types* from contracts, keeping the catalog + evaluator in game-rules. Validator tests in `packages/contracts/test/quests.test.ts`.

### Step 3 — Persistence in `packages/db`

New entities (defineEntity style, mirroring `entities/results-rating.ts`) in `entities/index.ts`:

- `PlayerWallet` — table `player_wallet`: `userId` text PK (Better Auth user id), `coins` integer not null default 0, `updatedAt` datetime.
- `WalletEntry` — table `wallet_entry`: `id` uuid PK (`gen_random_uuid()`), `createdAt` datetime, `userId` text, `amount` integer (signed), `source` text, `questId` text nullable. The audit trail and the RevenueCat seam.
- `QuestProgress` — table `quest_progress`: `userId` + `questId` composite PK, `progress` integer default 0, `streak` integer default 0, `completedAt` datetime nullable.
- `QuestHandLog` — table `quest_hand_log`: `id` uuid PK, `userId` text, `handToken` text, `createdAt`; **unique (userId, handToken)** — the idempotency guard.
- `LoginStreak` — table `login_streak`: `userId` text PK, `currentStreak` integer default 0, `longestStreak` integer default 0, `lastCreditDate` date nullable.

Hand-written migration `src/migrations/Migration<timestamp>_quests_wallet.ts` (up + down), registered in `src/migrations/index.ts`. Run with `pnpm --filter @wordpoker/db db:migrate`.

New service `src/quests-service.ts`, exported from `src/index.ts` (follows the `saveResultsRating` optional-orm pattern):

- `getQuestState(userId): Promise<QuestStateResponse>` — reads wallet, streak, progress rows; creates nothing.
- `creditDailyStreak(userId, today = new Date()): Promise<{ credited: boolean; day: number; reward: number; coins: number }>` — UTC day. If `lastCreditDate === today`: no-op. If `lastCreditDate === yesterday`: `currentStreak + 1`, else reset to 1. Day within the cycle = `((currentStreak - 1) % 7) + 1`; reward from `STREAK_REWARDS = [50, 75, 100, 125, 150, 200, 300]` (export from contracts so client and server agree). Updates `longestStreak`, sets `lastCreditDate`, credits wallet (`source: "streak"`) — all in one `em.transaction()`.
- `applyQuestHandClaim(userId, claim: QuestHandClaim): Promise<QuestClaimResponse>` — one transaction: insert `QuestHandLog` (on unique conflict → `{ completed: [], coins: current, duplicate: true }`), load progress rows (fill missing from `emptyQuestProgress()`), run `applyQuestHand`, persist changed rows, and for each newly completed quest credit the wallet (`source: "quest"`, `questId`) and insert a `WalletEntry`. Wallet updates go through the balance row + entry insert together.
- `creditWallet(userId, amount, source, questId?): Promise<number>` — shared helper returning the new balance.

Tests `test/quests.test.ts` mirror `results-rating.test.ts`: self-provisioning test database from `TEST_DATABASE_URL ?? DATABASE_URL`, skipped with a message when neither is set. Cases: streak credit increments, resets after a missed day, is idempotent within the day, pays the right cycle day, updates longest; claim applies progress, completes + credits exactly the catalog reward, duplicate token no-ops; wallet balance equals entry sum.

### Step 4 — API routes (mobile)

New `apps/mobile/src/app/api/quests+api.ts` (mirrors `results-rating+api.ts` conventions: validate body, refuse with `{ error }` 400, never leak exception text):

- `GET` — authenticate with the server-side Better Auth instance from `src/lib/auth.ts` (`auth.api.getSession({ headers: request.headers })` — follow the wiring `app/api/auth/[...all]+api.ts` uses; verify the exact call against Better Auth ^1.7 docs). 401 when no session. Then `creditDailyStreak` (so the first authenticated open of the day pays, on the server's clock) and return `getQuestState`.
- `POST` — body is a `QuestHandClaim`; refuse anything `isQuestHandClaim` rejects; 401 when unauthenticated; return `QuestClaimResponse`.

No `apps/server` change: online quest facts are derived from the state the room already broadcasts (the reveal payload `GameRoomProjection` builds with `playedWord`).

### Step 5 — Client plumbing (mobile)

- `apps/mobile/src/lib/quests-client.ts` — mirrors `results-rating.ts`: `fetchQuestState(): Promise<QuestStateResponse & { streakCredited: ... }>` and `sendQuestHandClaim(claim): Promise<QuestClaimResponse>`; GET carries the response's streak-credit info so the UI can banner it. Both go through `apiBaseURL`.
- `apps/mobile/src/lib/quest-facts.ts` — pure mapper `resultsFacts(snapshot: ResultsSnapshot, extras: { wildTable: boolean; heroUsedPower: boolean }): QuestHandFacts`. Hero seat = `snapshot.seats.find(s => s.isYou)` (the roster already marks it). `heroWon = snapshot.revealed ? hero.place === 1 : (hero?.takesPot ?? false)` — verify `foldOutResult` in `results-snapshot.ts` sets `takesPot: true` on the fold-out card; if it does not, fix it there (it should — the card prints "TAKES THE POT"). `heroWord = hero?.word ?? null`; `heroScore = hero?.total ?? 0`; `heroDecidedBy = hero?.decidedBy ?? null` (field added in Step 6); `pot = snapshot.pot`; `revealed = snapshot.revealed`.
- `apps/mobile/src/lib/quests-provider.tsx` — React context mounted once in `apps/mobile/src/app/_layout.tsx` inside the auth guard's signed-in tree (mount it regardless; it renders children and no-ops without a session). Loads state on mount (`GET`; 401 → idle), holds an optimistic `QuestProgressMap` + `coins` + `streak`, exposes:
  - `state: QuestStateResponse | null`, `lastCompletions: readonly QuestDefinition[]` (the quests the most recent hand completed — for the results chips), `streakBanner: { day: number; reward: number } | null` (set when the GET credited today's streak; cleared on dismiss).
  - `reportHand(facts: QuestHandFacts)` — generates `handToken` (`Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)` — a dedupe key, not a secret; avoids `crypto.randomUUID` availability questions on Hermes), applies `applyQuestHand` locally for instant UI, POSTs the claim, reconciles with the response. Failed POSTs queue in memory and flush on the next `reportHand`/remount — the token makes retries safe.
- Tests: `quest-facts.test.ts` (showdown, fold-out, no-word seat — reuse the `playOutHand` fixtures pattern from `results-snapshot.test.ts`), `use-quests`/provider test with the client module stubbed (pattern: screens stub `results-rating.ts` today).

### Step 6 — `decidedBy` through the results pipeline

- Add `readonly decidedBy: ShowdownDecider | null` to `SettledStanding` (`results-snapshot.ts`) and to `ResultsSeat` (`results-types.ts`); map it in `buildResultsSnapshot` (offline — engine standings already carry `standing.decidedBy`) and in `use-online-game.ts`'s `SettledHand` construction. If the online schema/projection (`GameRoomProjection.ts`, `rooms/schema`) does not project `decidedBy` today, add it there too (additive schema field) — it is part of `ShowdownStanding` in contracts, so the room has it. Extend the two snapshot builders' existing tests rather than adding new suites.

### Step 7 — UI

- **Quests screen**: `apps/mobile/src/components/screens/quests/quests-screen.tsx` + route `apps/mobile/src/app/quests.tsx`. Sections: wallet total (`testID="quest-wallet"`, `accessibilityLabel` "Wallet coins"), streak strip — seven day pips with the cycle's rewards, current day highlighted, longest streak caption (`testID="quest-streak"`), and one row per catalog quest (`testID="quest-row-<id>"`): title, description, `progress/goal` or a ✓ when done, reward badge "+N". Style follows `parlor-stats.tsx` chips / `mode-card.tsx` (colors, `fonts.mono` labels, `colors.gold` accents). Signed-out/idle state renders an empty list with a "Sign in to earn coins" line.
- **Home entry**: add a MODES entry in `home-screen.tsx` — `key: "quests"`, `href: "/quests"`, `glyph: "📜"`, `label: "Quests"`, `description: "Earn coins for wins & streaks"`, `tone: "warm"`.
- **Streak banner**: on the home screen when `streakBanner` is set — one gold chip row "DAY 4 STREAK · +125 COINS" (`testID="quest-streak-banner"`), auto-hides on tap. No blocking overlay.
- **Results chips**: in `results-screen.tsx`, under the summary and clear of the action row, render `lastCompletions` as compact gold rows "★ <TITLE> · +<reward>" (`testID="quest-complete-<id>"`). Render nothing when the list is empty — existing Maestro flows (`offline-hand.yaml`, results overlay ids) must be unaffected; chips sit inside the existing scroll content, never over `DEAL`.
- **Lobby wallet chip**: `parlor-view.ts` gains a leading `WALLET` stat chip (label "WALLET", value = coin count, gold accent) fed from the quests provider; `lobby-screen.tsx` passes it in. Keep the existing table stats after it.

### Step 8 — Wire the two tables

- `apps/mobile/src/components/screens/offline/offline-game-screen.tsx`: when the results overlay mounts (`payout && !sessionOver && results !== null`), call `reportHand(resultsFacts(results, { wildTable: powersParam, heroUsedPower }))` once per hand — key the guard on `results.hand` inside the provider. `wildTable` from the route param the adapter already reads (`/offline?powers=wild`); `heroUsedPower` from the adapter's `seatActions` for the hero (a used power rides beside the street's action) or its powers state — read `power-view.ts` at implementation and pick the field that says "hero's power was used".
- `apps/mobile/src/components/screens/online/online-felt.tsx`: same call when `results !== null && results.hand !== dismissed`, with `wildTable` from the room's power-up setting and `heroUsedPower` from the online powers view (the smoke listens for public "power used" events, so the client sees its own use).
- Both go through the provider from Step 5 — no engine or room changes.

## Critical files & anchors

- `apps/mobile/src/components/screens/results/results-snapshot.ts` — `SettledHand`/`buildSettledSnapshot`: the seam both tables already share; gets `decidedBy`.
- `apps/mobile/src/app/api/results-rating+api.ts` + `apps/mobile/src/lib/results-rating.ts` — the route/client conventions Steps 4–5 copy verbatim in spirit.
- `packages/db/src/entities/results-rating.ts` + `packages/db/test/results-rating.test.ts` — entity + self-provisioning test patterns Step 3 copies.
- `packages/game-rules/src/index.ts` — export surface for the new `quests.ts`.
- `apps/mobile/src/lib/power-view.ts` — where both adapters' power state is already decoded; source of `heroUsedPower`.

## Verification

Prereqs: local Postgres with `DATABASE_URL`/`TEST_DATABASE_URL` (same env the db suite already uses), seeded E2E user (`node --env-file=apps/mobile/.env scripts/seed-test-user.mjs`).

1. `pnpm --filter @wordpoker/contracts test && pnpm --filter @wordpoker/game-rules test` — catalog invariants + every predicate, incl. streak reset and token idempotence logic (unit level).
2. `pnpm --filter @wordpoker/db test && pnpm --filter @wordpoker/db db:migrate` — ledger/streak/claim against a real (self-provisioned) database.
3. `pnpm --filter @wordpoker/mobile typecheck && pnpm --filter @wordpoker/mobile test` — mapper, provider, screen tests; snapshot suites still green after the `decidedBy` addition.
4. End-to-end on web: `pnpm --filter @wordpoker/mobile web`, then in a browser — sign in as `e2e@wordpoker.dev`; home shows the Quests card and (first visit of the UTC day) the streak banner "DAY 1 · +50"; the Quests screen shows wallet 50 and 0/1 progress rows; play one offline hand to its results — the Quests screen now shows `hands-25` at 1/25 and `heavy-letter`/ladder quests tick if the dealt hand satisfies them (unit tests are the deterministic completion proof; this checks the wiring). Confirm `player_wallet`/`wallet_entry`/`quest_progress` rows via psql.
5. Re-run `.maestro/offline-hand.yaml` (headed) unchanged — proves the results chips and new home card did not break the flow's selectors.

## Assumptions & contingencies

- **Coin economy**: starting balance 0; catalog/streak rewards as tabled (data-only retune later). "Coins" is the display name.
- **Streak day** = UTC server date at first authenticated `GET /api/quests`; auto-credited, no claim button.
- **Trust model**: hand claims are client-reported and shape-validated + deduped, exactly like results ratings (casual PvE stage). Server-side re-judgment of online hands is a future hardening step, not this plan.
- **RevenueCat** is out of scope; the `wallet_entry.source` enum reserves `"purchase"`.
- If `foldOutResult` does not set `takesPot: true`, fix it in `results-snapshot.ts` rather than special-casing the mapper.
- If the online projection lacks `decidedBy`, add it to the Colyseus schema + `GameRoomProjection` (additive) — the engine standings already carry it.
- If neither adapter can derive `heroUsedPower` cleanly from `seatActions`/power view, fall back to gating `wild-power-win` on the offline table only for v1 (facts field stays, online passes `false`) — do not invent a room message for it.
- If Better Auth's `getSession` differs in 1.7 from `auth.api.getSession({ headers })`, follow `app/api/auth/[...all]+api.ts` and the versioned Better Auth docs rather than improvising.
