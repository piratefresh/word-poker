# RevenueCat coin store + Wallet on RevenueCat Virtual Currency

Tracking: **STO-346** (Wallet top-up via RevenueCat) under the **STO-444** economy epic. The API host this
feature needs in production is **STO-520**.

## Context

The rules give every player a **Wallet** of Coins (`docs/rules/balances-and-tables.md` §1): it pays table
buy-ins, re-buys and top-ups, and takes a Table Stack back when the player leaves. Nothing persists a balance
today, the game server has no player identity yet (`GameRoom.ts`: "no `onAuth`/identity until Epic B"), and
nothing in the app spends coins.

This plan sells coin packs through RevenueCat and makes **RevenueCat Virtual Currency (currency `COIN`) the
Wallet's source of truth**. A purchase credits itself (each product grants its coins in the RevenueCat
dashboard); our backend makes every other change — the welcome grant now, buy-ins and cash-outs later —
through RevenueCat's Developer API v2, and logs each one in a small `wallet_event` table. The store ships
behind a flag that stays off until table buy-ins spend the Wallet.

## Decisions

Settled in review (2026-10-04); each is the reason for a step below.

| Topic | Decision |
|---|---|
| Balance | RevenueCat Virtual Currency `COIN` holds it. No balance table of our own. |
| Server-side RevenueCat calls | A new server-only package, `packages/economy` (thin `fetch` client for API v2 + wallet operations). RevenueCat ships no official Node SDK, and the in-app SDK cannot add or remove currency. |
| Ledger shape | Built for the whole economy: event kinds include `buy_in`/`cash_out`/`refund`; spends go through RevenueCat, which refuses to overdraw (HTTP 422). The Colyseus side is a later story. |
| Audit log | `wallet_event` table: every change our server makes, plus every purchase/refund RevenueCat reports through its webhook. |
| Welcome grant | **5,000 coins**, paid once per user when the account becomes eligible (`isAccountEligible`): it **verifies its email** (Better Auth `afterEmailVerification`) or signs in with a server-verified Game Center/Google identity (STO-593). No public grant endpoint. |
| Existing accounts | One-off, rerunnable backfill grants every existing account, verified or not (verification never existed before this). |
| Packs | Three consumables, `coins_small` / `coins_medium` / `coins_large` at ~$0.99 / $4.99 / $9.99 granting **2,000 / 12,000 / 30,000** (rising coins-per-dollar). Amounts are dashboard data, not code. |
| Pack display data | Coin amounts come from RevenueCat's `product_grants` through our catalog endpoint; labels and badges from Offering metadata; price from `priceString`; "Best Value" computed from coins per price. A pack without a grant is hidden. Store-side product names stay neutral ("Small Coin Pack"). |
| Reading the balance | `GET /api/wallet` on every platform (web runs online play and every Maestro smoke). |
| Sandbox | Free sandbox purchases for testers only: RevenueCat sandbox access set to **"Allowed App User IDs only"**. |
| Refunds | RevenueCat's built-in behaviour: a refunded pack removes its coins, floored at 0 (Google partial refunds remove nothing). Logged, not otherwise acted on. |
| Retries | A `pending` event is retried on that player's next `GET /api/wallet` (reusing its id as the `Idempotency-Key`). A game-server drainer arrives with buy-ins/cash-outs. |
| Purchase webhook | Built and curl-tested here; pointed at from the RevenueCat dashboard (paid plan) once a public host exists. |
| Release | Home's Coin Store entry is behind `EXPO_PUBLIC_COIN_STORE`, off until table buy-ins debit the Wallet (Epic B identity + STO-471). |
| Android package | `com.wordpoker.wordpoker` (what the APK and both native Maestro flows use). |

## Approach

Each step leaves the workspace typechecking with its own tests passing.

### Step 0 — Tracking

- Work against **STO-346** (already a child of STO-444); no new story.
- The production API host is **STO-520**: Expo API routes need `web.output: "server"` and a host (today
  `apps/mobile/app.json` exports `"static"`, so no `+api` route ships), and that host is also what production
  sign-in, the catalog and the webhook URL wait on.

### Step 1 — Coin vocabulary in `packages/contracts`

New `packages/contracts/src/coins.ts`, exported from `src/index.ts` in the style of the `rooms` block:

```ts
export const COIN_CURRENCY = "COIN";
export const COIN_PACK_IDS = ["coins_small", "coins_medium", "coins_large"] as const;
export type CoinPackId = (typeof COIN_PACK_IDS)[number];

/** What a wallet_event records; `quest`/`streak` are reserved for QUESTS_LOGIN_STREAK_PLAN.md. */
export const WALLET_EVENT_KINDS = [
  "welcome", "purchase", "refund", "adjustment", "buy_in", "cash_out", "quest", "streak",
] as const;
export type WalletEventKind = (typeof WALLET_EVENT_KINDS)[number];

export const WELCOME_GRANT = 5000;

export interface WalletResponse { readonly coins: number; }
export interface CoinCatalog { readonly packs: readonly { readonly productId: string; readonly coins: number }[]; }
```

Plus `isWalletResponse` / `isCoinCatalog` validators in the existing validator style. No coin amounts per
pack live here — the dashboard owns them.

Tests `packages/contracts/test/coins.test.ts`: unique pack ids, exact kind literals, validators accept/refuse.

### Step 2 — `wallet_event` in `packages/db`

Entity `packages/db/src/entities/wallet-event.ts` (`defineEntity`, header-comment style of
`results-rating.ts`), re-exported from `entities/index.ts` so `mikro-orm.config.ts` and the migrator see it.

Hand-written `src/migrations/Migration<timestamp>_wallet_event.ts`, registered in `src/migrations/index.ts`:

```sql
create table "wallet_event" (
  "id" uuid primary key default gen_random_uuid(),   -- also the Idempotency-Key for our own RevenueCat calls
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "user_id" text not null,                             -- Better Auth user id = RevenueCat app user id
  "kind" text not null,                                -- contracts' WALLET_EVENT_KINDS
  "amount" integer not null,                           -- signed
  "status" text not null,                              -- pending | applied | failed
  "attempts" integer not null default 0,
  "last_error" text null,                              -- short code, never a response body
  "balance_after" integer null,                        -- the balance RevenueCat returned
  "product_id" text null,
  "ref" text null,                                     -- room/session for buy-in/cash-out, quest id
  "rc_event_id" text null,                             -- webhook event id
  "rc_transaction_id" text null                        -- virtual_currency_transaction_id
);
create unique index "wallet_event_welcome_once" on "wallet_event" ("user_id") where "kind" = 'welcome';
create unique index "wallet_event_rc_event_unique" on "wallet_event" ("rc_event_id") where "rc_event_id" is not null;
create index "wallet_event_user_created_idx" on "wallet_event" ("user_id", "created_at");
create index "wallet_event_pending_idx" on "wallet_event" ("user_id") where "status" = 'pending';
```

Service `src/wallet-event.ts`, exported from `src/index.ts`, with the `saveResultsRating` optional-`orm`
pattern:

- `openWalletEvent({ userId, kind, amount, productId?, ref? })` → the row, or `null` when a unique index
  already holds it (`insert … on conflict do nothing returning *` — never catch a unique violation inside a
  transaction; Postgres aborts the transaction).
- `settleWalletEvent(id, { status, balanceAfter?, lastError? })` — bumps `attempts`.
- `pendingWalletEvents(userId)` — oldest first.
- `recordReportedEvent({ userId, kind, amount, productId, rcEventId, rcTransactionId })` — webhook rows,
  inserted `applied`; `false` when `rc_event_id` was already recorded.

Tests `packages/db/test/wallet-event.test.ts` mirror `results-rating.test.ts` (self-provisioned database,
skipped without `TEST_DATABASE_URL ?? DATABASE_URL`): a second `welcome` for one user returns `null`; a
repeated `rc_event_id` records once; pending rows come back in order; settle updates status, attempts and
balance.

### Step 3 — `packages/economy` (new, server-only)

`@wordpoker/economy`: `"type": "module"`, `exports: { ".": "./src/index.ts" }`, `node --import tsx --test`
like `packages/db`, depends on `@wordpoker/db` and `@wordpoker/contracts`. Imported only by API routes and
`apps/server`, never by client code (the secret key lives here). Add it to AGENTS.md's workspace-architecture
list, and add `economy` to `scripts/check-boundaries.mjs`'s forbidden `@wordpoker/(mobile|server|db)` pattern
so `game-rules`/`contracts` can never reach it.

- `src/revenuecat.ts` — the v2 client, `Authorization: Bearer ${REVENUECAT_SECRET_API_KEY}`, base
  `https://api.revenuecat.com/v2/projects/${REVENUECAT_PROJECT_ID}`:
  - `getCoinBalance(userId)` → `GET /customers/{id}/virtual_currencies`, the `COIN` item's `balance`
    (0 when absent).
  - `adjustCoins(userId, amount, idempotencyKey)` → `POST /customers/{id}/virtual_currencies/transactions`
    with `{ "adjustments": { "COIN": amount } }` and `Idempotency-Key`. Returns the new balance; a 422
    `unprocessable_entity_error` is a typed `InsufficientCoinsError`; a 429 honours `Retry-After` once.
  - `listCoinGrants()` → the `COIN` currency's `product_grants` joined with the project's products'
    `store_identifier` → `{ storeProductId, coins }[]`.
  - Missing env → `EconomyNotConfiguredError`. Non-2xx → `RevenueCatError` with the status only.
- `src/wallet.ts` — the one path for every change our server makes:
  - `applyWalletChange(userId, kind, amount, extras)`: `openWalletEvent` (pending) → `adjustCoins` with the
    row id as `Idempotency-Key` → settle `applied` with `balance_after`, `failed` on a 422, or leave
    `pending` with `last_error` on a network/5xx/429 failure. Returns `{ applied, balance }`; a `null` open
    (already granted) returns `{ applied: false }`.
  - `grantWelcome(userId)` = `applyWalletChange(userId, "welcome", WELCOME_GRANT)`.
  - `retryPending(userId)`: re-sends each pending row with its own id as the key.
- `src/catalog.ts` — `coinCatalog()`: `listCoinGrants()` filtered to `COIN_PACK_IDS`, cached in-process for
  10 minutes.
- `src/webhook.ts` — `parseCurrencyEvent(body)`: accepts `{ api_version, event: { type, id, app_user_id,
  adjustments[], source, product_id, virtual_currency_transaction_id } }` (extra fields ignored), returns
  one record per `COIN` adjustment. Kind: `purchase` for a positive in-app purchase, `refund` for a negative
  one, `adjustment` for anything else.

Tests `packages/economy/test/*.test.ts` with a stubbed `fetch`: request shapes and headers; 422 →
`InsufficientCoinsError`; a 5xx leaves the row pending and `retryPending` settles it with the same key; the
welcome grant runs once; catalog joins and filters; webhook parsing of purchase, refund and garbage bodies.
At implementation, confirm whether a deposit to a customer RevenueCat has never seen succeeds; if it 404s,
create the customer first (`POST /customers`).

### Step 4 — Email verification and the welcome grant

Nobody can verify an email today: `apps/mobile/src/auth/server/auth.ts` configures password resets but no
`emailVerification`.

- `auth.ts`: add `emailVerification: { sendOnSignUp: true, sendVerificationEmail, afterEmailVerification }`
  (Better Auth 1.7.4's `init-options.d.mts`). `sendVerificationEmail` mails `verifyEmailEmail({ name,
  buttonUrl: url })`, a new template beside `passwordResetEmail` in `src/auth/server/email.ts` ("Confirm your email
  to claim your 5,000 welcome coins"), with the same dev-only console line the reset flow prints.
  `afterEmailVerification(user)` calls `grantWelcome(user.id)` and logs (never throws) on failure — the row
  stays `pending` for Step 5's retry.
- Sign-up passes a `callbackURL` that lands on Home — `EMAIL_VERIFIED_DEEP_LINK` (`wordpoker://`) beside
  `RESET_PASSWORD_DEEP_LINK` in `src/constants/links.ts`, chosen per platform the way
  `password-reset-screen.tsx` chooses `redirectTo`.
- Signing in stays possible before verifying; only the grant waits.
- Backfill `packages/economy/scripts/backfill-welcome.ts`: every row of Better Auth's `"user"` table →
  `grantWelcome` (the welcome index makes reruns no-ops). Run with
  `pnpm --filter @wordpoker/economy exec tsx --env-file=../../apps/mobile/.env scripts/backfill-welcome.ts`.

Tests: `auth.ts`'s verification callback is exercised through a mocked `@wordpoker/economy` (a thrown grant
does not fail verification); the template renders its link.

### Step 5 — API routes (`apps/mobile/src/app/api/`)

Conventions of `results-rating+api.ts`: `json`/`refuse` helpers, short sentences, exception text logged and
never sent. Session via `auth.api.getSession({ headers: request.headers })` (check against Better Auth 1.7.4's
types).

- `wallet+api.ts` — `GET`: 401 without a session; otherwise `retryPending(userId)` (errors swallowed and
  logged), then `{ coins: await getCoinBalance(userId) }`; RevenueCat unreachable or unconfigured → 502
  "The coin store could not be reached."
- `store-catalog+api.ts` — `GET`: `coinCatalog()` as a `CoinCatalog`; 502 as above. No session needed (not
  user data).
- `revenuecat-webhook+api.ts` — `POST`:
  - `REVENUECAT_WEBHOOK_AUTH` unset → 503.
  - The `Authorization` header (RevenueCat sends the dashboard's "Authorization header value" there) compared
    with `crypto.timingSafeEqual` over SHA-256 digests of both sides → 401 on mismatch or absence.
  - Body that is not a webhook → 400.
  - `VIRTUAL_CURRENCY_TRANSACTION` → `recordReportedEvent` per `COIN` adjustment → 200. A database failure
    → 500, so RevenueCat retries.
  - Any other event type → 200, no-op.

Route tests colocated like `src/lib/results-rating-route.test.ts`, mocking `@/auth/server/auth`
(`{ auth: { api: { getSession: jest.fn() } } }`), `@wordpoker/economy` and `@wordpoker/db`: wallet
401/200/502 and retry-before-read; catalog 200/502; webhook 503/401/400, purchase recorded, duplicate
event recorded once, unrelated type no-op, 500 on store failure.

### Step 6 — RevenueCat SDK and client plumbing (`apps/mobile`)

- `pnpm --filter @wordpoker/mobile add react-native-purchases` (10.x; Virtual Currency needs ≥ 9.1.0). No
  `react-native-purchases-ui`. Purchases need a development build; Expo Go gets the SDK's preview mode.
- `src/lib/revenuecat.ts` — the only module that imports the SDK:
  - `revenuecatAvailable()`: iOS/Android with the platform key set.
  - `configureRevenueCat()`: idempotent; `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` /
    `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`.
  - `fetchCoinOffering()`: the current Offering's packages and its runtime-validated metadata
    `{ packs: { [productId]: { label?, badge? } } }`.
  - `purchaseCoinPack(pkg)`: `"purchased" | "cancelled"`.
  - On web or without keys, each throws `StoreUnavailableError`.
- `src/lib/use-revenuecat.ts` — `useRevenueCatIdentity(userId)`, called once in `RootLayout` beside
  `authClient.useSession()`: configure once, `Purchases.logIn(userId)` when an id appears,
  `Purchases.logOut()` when it goes. Exposes `ready` so buy buttons stay disabled until `logIn` resolves.
  The E2E bypass build has no session, so it does nothing.
- `src/lib/wallet-client.ts` — like `results-rating.ts` (`apiBaseURL`, typed failures, the server's
  `{ error }` surfaced): `fetchWallet()` and `fetchCoinCatalog()`. Authenticated per Better Auth's Expo docs:
  on native, `authClient.getCookie()` as a `cookie` header with `credentials: "omit"`; on web,
  `credentials: "include"`. 401 → `WalletAuthError`.
- `jest-setup.js`: mock `react-native-purchases` (`configure`, `logIn`, `logOut`, `getOfferings`,
  `purchasePackage`). It matches the `react-native*` `transformIgnorePatterns` allowlist.

### Step 7 — Store screen behind the flag

- `src/components/screens/store/store-screen.tsx` + route `src/app/store.tsx`, styled like `mode-card.tsx`
  with theme tokens.
- **States**:
  - **Unavailable** (web, or no keys): the caption "Coin packs are available in the mobile app."
    (`store-unavailable`). The balance still shows.
  - **Signed out** (`WalletAuthError`): "Sign in to top up." (`store-signed-out`).
  - **Unverified**: "Verify your email to claim 5,000 coins" with a Resend button
    (`authClient.sendVerificationEmail`) (`store-verify`).
  - **Ready**: the balance (`wallet-coins`, "<N> COINS") and one row per pack (`store-pack-<productId>`).
- **Packs**: the Offering's packages joined with the catalog. A package with no catalog entry is hidden and
  logged. Each row shows its label/badge from metadata, "+12,000", `priceString`, and a buy button
  (`store-buy-<productId>`). "Best Value" goes on the highest coins/price.
- **Buy**: disable the row while buying; `"cancelled"` restores quietly; `"purchased"` refetches
  `fetchWallet()`, retrying briefly until the balance rises, then flashes "+N COINS ADDED". An error shows
  inline and keeps the balance.
- Home: add `"store"` to `ModeKey` and its `MODES` entry only when `EXPO_PUBLIC_COIN_STORE === "1"`.
- `store-screen.test.tsx` (mocks `@/lib/revenuecat` and `@/lib/wallet-client`): unavailable, signed-out and
  unverified states; packs render with catalog amounts; a pack missing from the catalog is hidden; buy →
  purchase then refetch; cancel → no refetch. Home test: no store card without the flag.

### Step 8 — Android config

- Local config plugin `apps/mobile/plugins/launch-mode.ts` (`withAndroidManifest` from
  `@expo/config-plugins`, shipped with `expo`) sets the main activity's `android:launchMode` to `singleTop`.
  The generated manifest carries `singleTask` today (`android/app/src/main/AndroidManifest.xml`), which
  cancels Google Play purchases that verify in another app. Register it in `apps/mobile/app.json`; verify after
  `npx expo prebuild -p android`.
- Revert the uncommitted `android.package: "com.piratefresh.wordpoker"` block in the root `app.json`;
  `com.wordpoker.wordpoker` stays the id on both platforms.

### Step 9 — Environment and dashboard (manual prerequisites)

Commented placeholders in `apps/mobile/.env` (server-side names are never `EXPO_PUBLIC_`):

```
# EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=   (public SDK key, appl_…)
# EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=  (public SDK key, goog_…)
# EXPO_PUBLIC_COIN_STORE=                 (1 shows Home's Coin Store entry; off until buy-ins spend the Wallet)
# REVENUECAT_PROJECT_ID=                  (v2 API project id)
# REVENUECAT_SECRET_API_KEY=              (v2 secret key — server only)
# REVENUECAT_WEBHOOK_AUTH=                (the webhook's Authorization header value)
```

RevenueCat dashboard:
1. One project, with an App Store app and a Google Play app, both `com.wordpoker.wordpoker`.
2. Confirm the plan includes Virtual Currency (the docs don't say). The webhook needs the paid plan.
3. Virtual Currency `COIN`.
4. Three consumable products `coins_small` / `coins_medium` / `coins_large`, with store names "Small/Medium/
   Large Coin Pack". Their product grants are 2,000 / 12,000 / 30,000 `COIN`.
5. A current Offering holding the three packages, with metadata `{ "packs": { "coins_large": { "badge":
   "Best Value" } } }` (labels optional).
6. Sandbox access: **Allowed App User IDs only**, listing the team's and the E2E user's Better Auth ids.
7. A v2 secret key with read & write on Customer Purchases Configuration and Customer Configuration, plus
   read on project configuration (products, virtual currencies).
8. When the host exists: a webhook to `https://<api-origin>/api/revenuecat-webhook` carrying
   `REVENUECAT_WEBHOOK_AUTH`.

Store products must also exist in App Store Connect / Play Console before production; RevenueCat's Test
Store covers development.

## Critical files & anchors

- `apps/mobile/src/auth/server/auth.ts` (Better Auth config, `sendResetPassword` as the mail pattern),
  `src/auth/server/email.ts` (`passwordResetEmail`), `src/constants/links.ts`,
  `src/components/screens/auth/password-reset-screen.tsx` (`redirectTo` per platform).
- `packages/db/src/entities/results-rating.ts`, `src/index.ts`, `test/results-rating.test.ts` — entity,
  optional-orm service and self-provisioning test patterns.
- `apps/mobile/src/app/api/results-rating+api.ts`, `src/components/screens/results/results-rating.ts`,
  `src/lib/results-rating-route.test.ts` — route, client and route-test conventions.
- `apps/mobile/src/components/screens/home/home-screen.tsx` — `ModeKey` and `MODES`.
- `node_modules/@better-auth/core/dist/types/init-options.d.mts` — `emailVerification` options.

## Verification

Prereqs: Postgres via the db suite's env, the seeded E2E user
(`node --env-file=apps/mobile/.env scripts/seed-test-user.mjs`), and a RevenueCat project per Step 9 for
steps 5–7.

1. `pnpm --filter @wordpoker/contracts test`.
2. `pnpm --filter @wordpoker/db db:migrate && pnpm --filter @wordpoker/db test` — welcome-once and
   event-dedupe indexes against a real database.
3. `pnpm --filter @wordpoker/economy test` — client shapes, retry with the same key, webhook parsing.
4. `pnpm --filter @wordpoker/mobile typecheck && pnpm --filter @wordpoker/mobile test`.
5. Routes on the dev server (`pnpm --filter @wordpoker/mobile web`):
   - Sign in as the E2E user (`POST /api/auth/sign-in/email`) and keep the cookie.
   - Run the backfill; `GET /api/wallet` → `{"coins":5000}`. Rerun it: still 5,000, one welcome row.
   - Without the cookie → 401.
   - `GET /api/store-catalog` → three packs with the dashboard's amounts.
   - `POST /api/revenuecat-webhook` with the right `Authorization` and a sample `VIRTUAL_CURRENCY_TRANSACTION`
     → 200 and one `purchase` row. Repeat it: still one row. With a wrong header → 401.
6. Sign up a fresh account on web → the verification mail (or dev console line) → open the link → Home, and
   `GET /api/wallet` shows 5,000.
7. Web UI with `EXPO_PUBLIC_COIN_STORE=1`: Home shows Coin Store; the store shows the balance and the
   mobile-only caption. Without the flag, no card; `.maestro/offline-hand.yaml` passes unchanged.
8. Native sandbox (development build, allowlisted account): packs show store prices; buy `coins_small` →
   balance +2,000 and a `purchase` row once the webhook is live. A non-allowlisted account's sandbox buy
   grants nothing.

## Assumptions & contingencies

- **Grant-on-verify failure**: if RevenueCat is down when the link is opened, the welcome row stays
  `pending` and the player's next `GET /api/wallet` applies it.
- **Idempotency-Key retention** is undocumented. If RevenueCat expires keys quickly, a retry must first
  compare the balance against the row before re-sending — check with RevenueCat support before buy-ins
  depend on it.
- **Purchase latency**: RevenueCat credits a purchase server-side. If the balance hasn't risen by the time
  the store stops retrying, it says "Coins are on their way" rather than an error.
- **`react-native-purchases@10` problems with Expo 57**: drop to the latest 9.x (≥ 9.1.0 for Virtual Currency).
- **Google Play still cancels after the plugin**: check the generated manifest carries `singleTop` first.
- **Quests**: `QUESTS_LOGIN_STREAK_PLAN.md` Step 3's own wallet tables are superseded. Its rewards become
  `applyWalletChange(userId, "quest" | "streak", …)` and it imports `WALLET_EVENT_KINDS`.
- **Later stories, not this plan**: Colyseus identity and buy-in/cash-out through `applyWalletChange`; a
  game-server drainer for pending rows; the production host and webhook URL; web purchases.
