# Quests & Login Streak — Coin Rewards

## Context

The game has no progression: hands pay table chips and nothing carries between sessions. This plan adds
**quests that pay coins** (win with a 2/3/4/5/6-letter word, win a pot over 500, …) and a **daily login
streak** that pays coins.

The Wallet now exists (STO-346, `REVENUECAT_COIN_STORE_PLAN.md`): RevenueCat Virtual Currency `COIN` holds
the balance, and every change our server makes goes through `@wordpoker/economy`'s
`applyWalletChange(userId, kind, amount, { ref })`, logged in `wallet_event` and retried from `pending` on
the player's next `GET /api/wallet`. `WALLET_EVENT_KINDS` already reserves `"quest"` and `"streak"`. So this
plan builds **no balance, ledger or retry of its own** — rewards are wallet events, and the event log itself
is what makes each reward once-only.

Both tables count: offline (engine in-process) and online (Colyseus room). Both adapters converge on one
settled-hand payload (`SettledHand` → `buildSettledSnapshot`,
`apps/mobile/src/components/screens/results/results-snapshot.ts`), and quest facts are derived from exactly
that, client-reported like the results rating (`results-rating+api.ts` precedent): the server validates
shape and dedupes, not re-judges. The "submit an adjective" quest is dropped for v1 (the shipped dictionary
has no part-of-speech data).

## Decisions

| Topic | Decision |
|---|---|
| Balance | RevenueCat `COIN`, read through the existing `GET /api/wallet`. No `player_wallet`/`wallet_entry`, no `creditWallet`. |
| Paying a reward | `applyWalletChange(userId, "quest", reward, { ref: questId })` / `applyWalletChange(userId, "streak", reward, { ref: "<UTC date>" })`. |
| Once-only | A new partial unique index on `wallet_event (user_id, kind, ref) where kind in ('quest','streak')`. A repeat opens no row → `already_recorded`, no RevenueCat call. |
| Streak state | Derived from the player's `streak` wallet events (`ref` = `YYYY-MM-DD`). No `login_streak` table. |
| Retries | Nothing new: a reward RevenueCat missed stays `pending` and `GET /api/wallet` re-sends it. |
| Who earns | Signed-in **and email-verified** (same gate as the welcome grant), so throwaway accounts cannot farm streaks. |
| Release | Home's Quests entry sits behind the existing `EXPO_PUBLIC_COIN_STORE` flag — coins mean nothing until buy-ins spend them. |
| Tracking | A story under the **STO-444** economy epic, beside STO-346. |

## Approach

Each step leaves the workspace typechecking with its own tests passing.

### Step 0 — Linear

One story in **Word Poker Native** (team Story Time) under **STO-444**, the steps below as its checklist.

### Step 1 — Quest catalog + pure evaluator in `packages/game-rules`

New `packages/game-rules/src/quests.ts` (pure, no I/O), exported from `src/index.ts`:

```ts
export interface QuestDefinition {
  readonly id: QuestId;          // from contracts
  readonly title: string;        // "SHORT AND SWEET"
  readonly description: string;  // "Win a showdown with a 2-letter word."
  readonly goal: number;         // 1 = one-shot
  readonly reward: number;       // coins
}
export const QUEST_CATALOG: readonly QuestDefinition[];

export interface QuestProgressEntry { readonly progress: number; readonly streak: number; readonly done: boolean; }
export type QuestProgressMap = Record<QuestId, QuestProgressEntry>;

export function emptyQuestProgress(): QuestProgressMap;
/** Pure: one hand's effect on the whole map, and the quests this hand completed. */
export function applyQuestHand(map: QuestProgressMap, facts: QuestHandFacts): { next: QuestProgressMap; completed: readonly QuestId[] };
```

Catalog (retuning is a data-only change):

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

Rewards are small beside the 5,000 welcome grant and the 2,000-coin smallest pack; the whole catalog pays
2,150 once. Retune against pack prices before the flag turns on.

Predicates:
- Word ladder + `word-25`: `revealed && heroWon` and `heroWord.length === L` / `heroScore >= 25`.
- `heavy-letter`: `revealed && heroWord !== null && /[JXQZ]/.test(heroWord)` (played, not won).
- `pot-500`: `heroWon && pot > 500` (fold-out counts).
- `fold-out`: `!revealed && heroWon`.
- `tile-draw`: `revealed && heroWon && heroDecidedBy === "tile-draw"`.
- `wild-power-win`: `heroWon && wildTable && heroUsedPower`.
- `hands-25`: +1 every hand; `wins-10`: +1 iff `heroWon`.
- `win-streak-3`: `streak = heroWon ? streak + 1 : 0`; `progress` holds the best streak reached; done at 3.
- A `done` entry is frozen. Input map untouched.

Tests `packages/game-rules/test/quests.test.ts`: catalog invariants (unique ids, `goal >= 1`, `reward > 0`,
every `QuestId` present); each predicate true/false; fold-out vs reveal; streak reset on a loss; completion
exactly at goal; purity; a done quest never re-completes.

### Step 2 — Wire vocabulary in `packages/contracts`

New `packages/contracts/src/quests.ts`, exported from `src/index.ts` (game-rules imports the types from
here). No wallet-source enum — `WALLET_EVENT_KINDS` already has `quest`/`streak`; update its comment to
point at this plan's story.

```ts
export const QUEST_IDS = [/* the 15 ids above */] as const;
export type QuestId = (typeof QUEST_IDS)[number];

/** One settled hand, from the hero's chair — the only input quest judging gets. */
export interface QuestHandFacts {
  readonly revealed: boolean;
  readonly heroWon: boolean;
  readonly heroWord: string | null;     // uppercase
  readonly heroScore: number;
  readonly heroDecidedBy: ShowdownDecider | null;
  readonly pot: number;
  readonly wildTable: boolean;
  readonly heroUsedPower: boolean;
}

/** Coins for day 1…7 of the streak; day 8 starts the cycle again. */
export const STREAK_REWARDS = [50, 75, 100, 125, 150, 200, 300] as const;

/** POSTed once per settled hand. */
export interface QuestHandClaim { readonly handToken: string; readonly facts: QuestHandFacts; }
export function isQuestHandClaim(value: unknown): value is QuestHandClaim; // style of coins.ts validators

/** `GET /api/quests`. The balance is not here — `GET /api/wallet` owns it. */
export interface QuestStateResponse {
  readonly streak: { readonly current: number; readonly creditedToday: number | null }; // reward paid by this GET, else null
  readonly quests: readonly { readonly id: QuestId; readonly progress: number; readonly done: boolean }[];
}
export function isQuestStateResponse(value: unknown): value is QuestStateResponse;

/** `POST /api/quests`. */
export interface QuestClaimResponse { readonly completed: readonly QuestId[]; readonly duplicate: boolean; }
export function isQuestClaimResponse(value: unknown): value is QuestClaimResponse;
```

Tests in `packages/contracts/test/quests.test.ts`: validators accept/refuse (bad token, unknown fields
types, out-of-range numbers), `STREAK_REWARDS` has 7 positive entries.

### Step 3 — Persistence in `packages/db`

Entities (defineEntity, `results-rating.ts` style) in `entities/index.ts`:

- `QuestProgress` — `quest_progress`: `user_id` + `quest_id` PK, `progress` int default 0, `streak` int
  default 0, `completed_at` timestamptz null.
- `QuestHandLog` — `quest_hand_log`: `id` uuid PK, `user_id`, `hand_token`, `created_at`; **unique
  (user_id, hand_token)**.

Hand-written `Migration<timestamp>_quests.ts`, registered in `src/migrations/index.ts`: the two tables plus

```sql
create unique index "wallet_event_reward_once" on "wallet_event" ("user_id", "kind", "ref")
  where "kind" in ('quest', 'streak');
```

New `src/quests.ts`, exported from `src/index.ts`, optional-`orm` pattern; inserts that can collide use
`insert … on conflict do nothing returning` like `wallet-event.ts`:

- `questProgress(userId)` → the stored rows.
- `recordQuestHand(userId, handToken, apply: (map) => { next, completed })` — one `em.transaction()`: insert
  the hand log (no row back → `{ completed: [], duplicate: true }`), load progress, run `apply`, upsert the
  changed rows. Taking `apply` as a parameter keeps db free of game-rules.
- `streakDates(userId)` — the `ref`s of the player's `streak` wallet events, newest first (any status: a
  pending row is still a day logged in).

Tests `test/quests.test.ts` mirror `results-rating.test.ts` (self-provisioned DB, skipped without
`TEST_DATABASE_URL ?? DATABASE_URL`): a duplicate token is a no-op; progress persists across calls; a second
`quest` wallet event with the same `ref` opens no row while a different `ref` does; `streakDates` order.

### Step 4 — Reward flow in `packages/economy`

New `src/rewards.ts` (economy already depends on db + contracts; add `@wordpoker/game-rules`), exported from
`src/index.ts`, with the same `deps` injection as `wallet.ts`:

- `streakLength(dates, today)` — pure: length of the run of consecutive UTC days ending at `today`.
- `creditDailyStreak(userId, now = new Date())` — `today` = UTC `YYYY-MM-DD`; `day = streakLength([today,
  ...streakDates], today)`; reward `STREAK_REWARDS[(day - 1) % 7]`;
  `applyWalletChange(userId, "streak", reward, { ref: today })`. `already_recorded` → nothing paid today.
  Concurrent GETs are safe: the unique index lets one through.
- `claimQuestHand(userId, claim)` — `recordQuestHand(userId, claim.handToken, map => applyQuestHand(map,
  claim.facts))`, then for each completed quest `applyWalletChange(userId, "quest", reward, { ref: id })`.
  A `pending` result is fine — `GET /api/wallet` finishes it.
- `payCompletedQuests(userId)` — `applyWalletChange` for every `done` quest; the index makes each a no-op
  once paid. Heals a crash between the progress commit and the wallet call. Called from the quests GET.

Tests `test/rewards.test.ts` with the fake store/client `wallet.test.ts` already uses: streak day 1, +1 on
consecutive days, reset after a gap, cycle wraps after 7, second credit the same day pays nothing; claim pays
exactly the catalog reward once; heal pays a done-but-unpaid quest and skips a paid one.

### Step 5 — API route

New `apps/mobile/src/app/api/quests+api.ts`, conventions of `wallet+api.ts` (`json` helper, session via
`auth.api.getSession({ headers })`, exception text logged not sent):

- 401 without a session; 403 "Verify your email to earn coins." when `!session.user.emailVerified`.
- `GET` — `creditDailyStreak`, `payCompletedQuests` (both logged-not-thrown on RevenueCat failure; the rows
  stay pending), then `QuestStateResponse` from `questProgress` + `streakDates`.
- `POST` — 400 unless `isQuestHandClaim`; `QuestClaimResponse` from `claimQuestHand`.

Route tests beside `wallet-routes.test.ts`, mocking `@/auth/server/auth`, `@wordpoker/economy` and
`@wordpoker/db`: 401/403/400, GET credits then reads, POST passes the claim through, duplicate → `duplicate:
true`.

No `apps/server` change: online facts come from the reveal payload the room already broadcasts.

### Step 6 — Client plumbing (`apps/mobile`)

- `src/lib/wallet-client.ts` gains `fetchQuestState()` and `sendQuestHandClaim(claim)`, reusing its
  `sessionInit()` and `failure()` (401 → `WalletAuthError`, 403 → a typed `WalletUnverifiedError`).
- `src/lib/quest-facts.ts` — pure `resultsFacts(snapshot, { wildTable, heroUsedPower }): QuestHandFacts`.
  Hero = `snapshot.seats.find(s => s.isYou)`; `heroWon = snapshot.revealed ? hero.place === 1 :
  hero.takesPot` (the fold-out card already sets `takesPot: true`, `results-snapshot.ts:165`); word, total,
  `decidedBy` (Step 7), `pot`, `revealed` straight across.
- `src/lib/quests-provider.tsx` — context mounted once in `src/app/_layout.tsx`; no-ops without a session or
  when unverified. Holds `state`, `coins` (from `fetchWallet()`), `lastCompletions`, and `streakBanner`
  (set when the GET's `streak.creditedToday` is non-null). `reportHand(facts)`: token
  `Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)` (dedupe key, not a secret),
  `applyQuestHand` locally for instant UI, POST, reconcile, and `fetchWallet()` again when anything
  completed. Failed POSTs queue in memory and flush on the next `reportHand` — the token makes retries safe.
- Tests: `quest-facts.test.ts` (showdown, fold-out, no-word seat — `results-snapshot.test.ts` fixtures);
  provider test with `wallet-client` stubbed.

### Step 7 — `decidedBy` through the results pipeline

Add `readonly decidedBy: ShowdownDecider | null` to `SettledStanding` (`results-snapshot.ts`) and
`ResultsSeat` (`results-types.ts`); map it in `buildResultsSnapshot` (offline — engine standings carry it)
and in `use-online-game.ts`'s `SettledHand`. If the room's projection (`GameRoomProjection.ts`,
`rooms/schema`) lacks it, add it there (additive). Extend the existing snapshot tests.

### Step 8 — UI

- **Quests screen**: `src/components/screens/quests/quests-screen.tsx` + route `src/app/quests.tsx`.
  Wallet total (`quest-wallet`, from the provider's `coins`), streak strip — seven pips with
  `STREAK_REWARDS`, today's highlighted (`quest-streak`) — and one row per catalog quest
  (`quest-row-<id>`): title, description, `progress/goal` or ✓, "+N". Style of `parlor-stats.tsx` /
  `mode-card.tsx`. Signed out: "Sign in to earn coins"; unverified: "Verify your email to earn coins".
- **Home entry**: `"quests"` in `ModeKey`, `MODES` entry (`href: "/quests"`, `glyph: "📜"`, `label:
  "Quests"`, `description: "Earn coins for wins & streaks"`, `tone: "warm"`) behind the same
  `EXPO_PUBLIC_COIN_STORE` check as the store entry.
- **Streak banner**: home, when `streakBanner` is set — "DAY 4 STREAK · +125 COINS"
  (`quest-streak-banner`), hides on tap.
- **Results chips**: in `results-screen.tsx`, inside the scroll content and clear of `DEAL`,
  "★ <TITLE> · +<reward>" per `lastCompletions` (`quest-complete-<id>`); nothing when empty, so
  `offline-hand.yaml` is unaffected.
- **Lobby wallet chip**: `parlor-view.ts` gains a leading `WALLET` chip fed from the provider's `coins`.

### Step 9 — Wire the two tables

- `offline-game-screen.tsx`: when the results overlay mounts, `reportHand(resultsFacts(results, {
  wildTable, heroUsedPower }))` once per `results.hand`. `wildTable` from `?powers=wild`; `heroUsedPower`
  from the hero's power state in `power-view.ts`.
- `online-felt.tsx`: same, `wildTable` from the room's power-up setting, `heroUsedPower` from the online
  powers view.

## Critical files & anchors

- `packages/economy/src/wallet.ts` (`applyWalletChange`, `retryPending`) and `test/wallet.test.ts` (fakes).
- `packages/db/src/wallet-event.ts` (`on conflict do nothing` writers),
  `src/migrations/Migration20261004120000_wallet_event.ts` (index style).
- `apps/mobile/src/app/api/wallet+api.ts`, `src/lib/wallet-client.ts`, `src/lib/wallet-routes.test.ts`.
- `apps/mobile/src/components/screens/results/results-snapshot.ts` — the shared settled-hand seam.
- `apps/mobile/src/components/screens/home/home-screen.tsx` — `ModeKey`, `MODES`, the store flag.

## Verification

Prereqs: Postgres via the db suite's env, the seeded (verified) E2E user, RevenueCat env per
`REVENUECAT_COIN_STORE_PLAN.md` Step 9.

1. `pnpm --filter @wordpoker/contracts test && pnpm --filter @wordpoker/game-rules test`.
2. `pnpm --filter @wordpoker/db db:migrate && pnpm --filter @wordpoker/db test`.
3. `pnpm --filter @wordpoker/economy test`.
4. `pnpm check:boundaries && pnpm typecheck && pnpm --filter @wordpoker/mobile test`.
5. Web with `EXPO_PUBLIC_COIN_STORE=1`, signed in as the E2E user: home shows Quests and the banner
   "DAY 1 STREAK · +50 COINS"; `GET /api/wallet` is 50 higher; reload — no second banner, one `streak` row
   in `wallet_event`. Play one offline hand: `hands-25` reads 1/25. `psql`: `quest_progress` rows, and a
   `quest` wallet event per completion with `ref` = quest id.
6. `.maestro/offline-hand.yaml` passes unchanged.

## Assumptions & contingencies

- **Trust model**: claims are client-reported, shape-validated and deduped, like ratings. Server-side
  re-judging of online hands is later hardening. Real coins now raise the stakes — keep rewards small until
  then.
- **Streak day** = UTC date of the first `GET /api/quests` that day; no claim button.
- **Failed rows**: a reward RevenueCat refuses for good (`rejected`) keeps its unique slot and is not
  re-paid. Acceptable; it shows in `wallet_event`.
- If `heroUsedPower` cannot be derived cleanly online, pass `false` there for v1 — no new room message.
- If the online projection lacks `decidedBy`, add it (additive schema field).
