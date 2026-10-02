# RevenueCat coin store + persistent wallet

## Context

The game has no real-money monetization and no persistent balance. The ask: wire RevenueCat into `apps/mobile` so coin purchases credit a server-side coin balance (Postgres via `@wordpoker/db`), as the foundation the quests/login-streak feature (`QUESTS_LOGIN_STREAK_PLAN.md`, **not yet implemented** — no quests/wallet code exists) builds on. On the "Pro plan + PlanetScale" question: yes to Pro, but a RevenueCat webhook needs a public **HTTPS endpoint** for the app's API routes — PlanetScale only hosts the database, and the app's API (Better Auth + routes) runs on the dev server today with no deployed host in the repo. So this plan ships **both** paths with one crediting pipeline:

- **REST reconcile (pull)** — after a purchase (and on wallet open), the server calls RevenueCat `GET /v1/subscribers/{userId}` with the secret API key and credits every uncredited transaction. Works on any plan, credits instantly, recovers missed purchases. Active from day one.
- **Webhook (push)** — a route that verifies RevenueCat's auth header and then runs the *same* reconcile for that user. It never credits from webhook payload fields directly, so reconcile-pull and webhook-push can never double-credit one purchase (they would if each parsed its own ids — REST `non_subscriptions[].id` and webhook `transaction_id` are not guaranteed to be the same string). Live the moment a public host + Pro plan webhook config exist; testable today by curl.

3 consumable packs, custom store screen in the app's design system. Purchases run on iOS/Android native builds; the web build renders the store as a disabled listing (RevenueCat web purchases require RevenueCat Billing/Stripe — out of scope). Wallet schema is exactly what `QUESTS_LOGIN_STREAK_PLAN.md` Step 3 specifies for `player_wallet`/`wallet_entry` (plus purchase dedupe columns), so that plan's wallet parts become already-done.

## Approach

Order builds a dependency tree; each step leaves the workspace typechecking with its own tests passing.

### Step 0 — Linear ticket

File the story in Linear project **Word Poker Native** (team Story Time) via the Linear MCP tools, epic **Native workspace foundation** (STO-260): one story, checklist items for wallet ledger, RevenueCat SDK, store UI, webhook route.

### Step 1 — Coin vocabulary in `packages/contracts`

New `packages/contracts/src/coins.ts` (no equivalent exists):

```ts
export const WALLET_SOURCES = ["quest", "streak", "grant", "purchase"] as const;
export type WalletSource = (typeof WALLET_SOURCES)[number];

export interface CoinPack { readonly productId: string; readonly coins: number; readonly label: string; }
export const COIN_PACKS: readonly CoinPack[] = [
  { productId: "coins_small",  coins: 500,  label: "Pocket" },
  { productId: "coins_medium", coins: 3000, label: "Pouch"  },
  { productId: "coins_large",  coins: 7500, label: "Chest"  },
];
export const COIN_PACK_IDS = ["coins_small", "coins_medium", "coins_large"] as const;
/** Coins granted for a store product id, or null when the id is not a coin pack. */
export function coinsForProduct(productId: string): number | null;
```

`WALLET_SOURCES` is the literal list `QUESTS_LOGIN_STREAK_PLAN.md` reserves (`quest`/`streak`/`grant`/`purchase`) — when that plan lands it imports this const instead of declaring `QUEST_WALLET_SOURCES` a second time. Export everything from `packages/contracts/src/index.ts` (same style as the `rooms` block). Product ids must match the RevenueCat dashboard / App Store Connect / Play Console SKUs exactly (see Dashboard setup below).

Tests `packages/contracts/test/coins.test.ts` (mirror existing validator tests): unique product ids, `coins > 0`, `coinsForProduct` hit/miss, `WALLET_SOURCES` exact literals.

### Step 2 — Wallet ledger in `packages/db`

**Entities** — new `packages/db/src/entities/wallet.ts` (copy the `defineEntity` style of `entities/results-rating.ts`, including the header comment conventions):

```ts
export const PlayerWallet = defineEntity({
  name: "PlayerWallet", tableName: "player_wallet",
  properties: () => ({
    userId: p.text().primary(),                       // Better Auth user id
    coins: p.integer().default(0),
    updatedAt: p.datetime().onCreate(() => new Date()).onUpdate(() => new Date()),
  }),
});

export const WalletEntry = defineEntity({
  name: "WalletEntry", tableName: "wallet_entry",
  properties: () => ({
    id: p.uuid().primary().defaultRaw("gen_random_uuid()").onCreate(() => randomUUID()),
    createdAt: p.datetime().onCreate(() => new Date()),
    userId: p.text(),
    amount: p.integer(),          // signed; purchases positive, future spends negative
    source: p.text(),             // one of contracts' WALLET_SOURCES; routes validate, column is the backstop
    questId: p.text().nullable(),
    productId: p.text().nullable(),   // RevenueCat product id when source === "purchase"
    purchaseId: p.text().nullable(),  // RevenueCat non-subscription purchase id — the dedupe key
  }),
});
```

Register both in `packages/db/src/entities/index.ts` **and** in `packages/db/mikro-orm.config.ts`'s `entities: [...]` array (the config imports entity classes directly — an entity missing there does not exist to the migrator).

**Migration** — hand-written `packages/db/src/migrations/Migration<timestamp>_wallet.ts` (pattern of `Migration20260921030429_results_rating.ts`), registered in `src/migrations/index.ts`:

```sql
create table "player_wallet" (
  "user_id" text primary key,
  "coins" integer not null default 0,
  "updated_at" timestamptz not null default now()
);
create table "wallet_entry" (
  "id" uuid primary key default gen_random_uuid(),
  "created_at" timestamptz not null default now(),
  "user_id" text not null,
  "amount" integer not null,
  "source" text not null,
  "quest_id" text null,
  "product_id" text null,
  "purchase_id" text null
);
create unique index "wallet_entry_user_purchase_unique"
  on "wallet_entry" ("user_id", "purchase_id") where "purchase_id" is not null;
create index "wallet_entry_user_created_idx" on "wallet_entry" ("user_id", "created_at");
down(): drop table "wallet_entry"; drop table "player_wallet";
```

The partial unique index is the idempotency guard: crediting the same RevenueCat purchase twice cannot insert twice, whatever path reported it.

**Service** — new `packages/db/src/wallet-service.ts`, exported from `src/index.ts` (follows the `saveResultsRating` optional-orm pattern so tests can point at their own database). The db package stays dependency-free: coin amounts are resolved by the caller (the route, from `@wordpoker/contracts`), the service only stores and dedupes.

```ts
export interface WalletCredit {
  readonly source: string; readonly amount: number;
  readonly questId?: string; readonly productId?: string; readonly purchaseId?: string;
}
export interface PurchaseToCredit { readonly id: string; readonly productId: string; readonly coins: number; }

/** Current balance; 0 for a user with no row. Creates nothing. */
export async function getWalletBalance(userId: string, options?: { orm?: MikroORM }): Promise<number>;

/**
 * One transaction: insert the wallet_entry first — a unique violation on
 * (user_id, purchase_id) means already credited → return { credited: false } with the
 * current balance and change nothing. Otherwise upsert the wallet row
 * (`insert ... on conflict ("user_id") do update set coins = player_wallet.coins + N,
 * updated_at = now()`) and return the new balance.
 */
export async function creditWallet(
  userId: string, credit: WalletCredit, options?: { orm?: MikroORM },
): Promise<{ coins: number; credited: boolean }>;

/** Credits every not-yet-credited purchase in ONE transaction; skips unknown product ids (coins <= 0). */
export async function reconcilePurchases(
  userId: string, purchases: readonly PurchaseToCredit[], options?: { orm?: MikroORM },
): Promise<{ coins: number; creditedCoins: number; credited: readonly { purchaseId: string; productId: string; coins: number }[] }>;
```

Raw upsert SQL runs through the forked entity manager's connection (`em.getConnection().execute(sql\`...\`)`); the entry insert and wallet upsert share one `em.transaction()`. Concurrency: two simultaneous reconciles race only on the entry insert — the loser hits the unique index and reads `credited: false`.

Tests `packages/db/test/wallet.test.ts` mirror `results-rating.test.ts` (self-provisioning `wordpoker_test_<random>` database from `TEST_DATABASE_URL ?? DATABASE_URL`, skipped with a message when unset, torn down in `after`). Cases: balance 0 for unknown user; credit creates wallet row + audit entry; crediting the same `purchaseId` twice → second returns `credited: false`, balance unchanged; reconcile with mixed known/unknown product ids credits only knowns once; balance always equals the sum of entries; `questId`/`productId` land in the audit row.

### Step 3 — RevenueCat REST client (server-side, mobile app)

New `apps/mobile/src/lib/revenuecat-server.ts` (no equivalent exists; server-only — imported exclusively by API routes, so the secret never enters a client bundle):

```ts
export interface RevenueCatPurchase { readonly id: string; readonly productId: string; }
/** Throws Error("RevenueCat is not configured") without REVENUECAT_SECRET_API_KEY. */
export async function fetchSubscriberPurchases(userId: string): Promise<readonly RevenueCatPurchase[]>;
```

`GET https://api.revenuecat.com/v1/subscribers/{encodeURIComponent(userId)}` with `Authorization: Bearer ${process.env.REVENUECAT_SECRET_API_KEY}` (v1 secret key; the endpoint returns 200/201 and creates the subscriber if missing — treat any 2xx as success). Reads `subscriber.non_subscriptions` (a `Record<productId, { id, ... }[]>`) and flattens to `{ id, productId }`. Non-2xx or unparseable body → typed error the routes turn into 502.

### Step 4 — API routes (mobile)

All three follow `src/app/api/results-rating+api.ts` conventions: `json(body, status)` / `refuse(message)` helpers, never leak exception text, no store details in errors.

- **`src/app/api/wallet+api.ts` — GET**: authenticate with the server Better Auth instance from `src/lib/auth.ts`: `const session = await auth.api.getSession({ headers: request.headers })` (verify the exact 1.7 call against `node_modules/better-auth` types and the Better Auth session docs at implementation; the docs show `auth.api.<action>({ headers })` as the server pattern). No session → `401 {"error":"Sign in to see your coin balance."}`. Otherwise `{ coins: await getWalletBalance(session.user.id) }`.
- **`src/lib/wallet-reconcile.ts`** — shared pipeline used by both the client-facing route and the webhook, so there is exactly one crediting path: `reconcileUserWallet(userId)` = `fetchSubscriberPurchases(userId)` → drop ids where `coinsForProduct(productId) == null` → `reconcilePurchases(userId, ...)` → `{ coins, creditedCoins }`.
- **`src/app/api/wallet-reconcile+api.ts` — POST**: session as above (401 without); runs `reconcileUserWallet`; a RevenueCat fetch/config error → `502 {"error":"The coin store could not be reached."}`; success → `{ coins, creditedCoins }`.
- **`src/app/api/revenuecat-webhook+api.ts` — POST**: reads the `x-auth` request header and compares it to `REVENUECAT_SECRET`-style env `REVENUECAT_WEBHOOK_AUTH` with `crypto.timingSafeEqual` (pad/hash both sides to equal length first; plain equality on a secret header is timing-observable). Missing env → `503`; mismatch/absent header → `401`. Body must shape-check as `{ api_version: string, event: { type: string, app_user_id: string } }` (unknown extra fields ignored — RevenueCat adds fields without versioning); bad shape → `400`. If `event.type` is one of `INITIAL_PURCHASE`, `NON_RENEWING_PURCHASE`, `TEST` (consumables surface as `NON_RENEWING_PURCHASE` on iOS and `INITIAL_PURCHASE` on Google Play; `TEST` covers the dashboard's test button) → `await reconcileUserWallet(event.app_user_id)` and return `200 {"ok":true, creditedCoins}`; a pipeline failure → `500` so RevenueCat retries (5 retries, 5–80 min backoff). Every other event type → `200 {"ok":true}` no-op.

Route tests, colocated like `src/lib/results-rating-route.test.ts` (which stubs `@wordpoker/db` wholesale): mock `@/lib/auth` (`{ auth: { api: { getSession: jest.fn() } } }` — importing the real module would demand live `DATABASE_*` env), mock `@wordpoker/db` and `@/lib/revenuecat-server`. Cases: wallet GET 401/200; reconcile POST 401 / 200 with credited sums / 502 on RC failure; webhook 401 wrong auth / 503 unconfigured / 200 no-op for `EXPIRATION` / 200 + pipeline called for `NON_RENEWING_PURCHASE` / 500 when the pipeline throws / 400 on garbage body.

### Step 5 — RevenueCat SDK + client plumbing (mobile)

- **Install**: `pnpm --filter @wordpoker/mobile add react-native-purchases` (latest 10.x, currently 10.9.0; min RN 0.73, works with RN 0.86/Expo 57 — pure autolink, no config plugin, and it imports safely on web where calls are stubs). Do NOT add `react-native-purchases-ui` (paywall templates) — custom screen. Note: IAP requires a development/custom dev client; Expo Go gets the SDK's JS-level Preview API Mode automatically.
- **`src/lib/revenuecat.ts`** — the one module that imports the SDK:
  ```ts
  export function revenuecatAvailable(): boolean;  // Platform.OS ios|android AND the platform key is set
  export function configureRevenueCat(): void;     // idempotent module-level guard; ios → EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY, android → EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY
  export interface CoinPackOffer { readonly productId: string; readonly label: string; readonly coins: number; readonly price: string; }
  export async function fetchCoinPacks(): Promise<readonly CoinPackOffer[]>;  // Purchases.getProducts([...COIN_PACK_IDS], Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION); price from product.priceString
  export async function purchaseCoinPack(productId: string): Promise<"purchased" | "cancelled">;  // purchaseStoreProduct; catch → e.userCancelled ? "cancelled" : throw
  ```
  Web or missing keys → wrappers throw a typed `StoreUnavailableError`; the screen gates on `revenuecatAvailable()` and never calls further.
- **`src/lib/use-revenuecat.ts`** — `useRevenueCatIdentity(userId: string | undefined)`: effect calls `configureRevenueCat()` once and `Purchases.logIn(userId)` whenever a non-empty id appears (safe to repeat; RevenueCat returns `created:false` for the same id). This pins RevenueCat's `app_user_id` to the Better Auth user id, which is what webhook `app_user_id` and the REST lookup key both rely on. Called once from `RootLayout` in `apps/mobile/src/app/_layout.tsx` next to the existing `authClient.useSession()` (`useRevenueCatIdentity(session?.user?.id)`); E2E bypass builds have no session, so it no-ops.
- **`src/lib/wallet-client.ts`** — mirrors `results-rating.ts` conventions (`apiBaseURL`, typed failures, server's `{ error }` surfaced):
  ```ts
  export async function fetchWallet(): Promise<number>;                                            // GET /api/wallet
  export async function reconcileWallet(): Promise<{ coins: number; creditedCoins: number }>;      // POST /api/wallet/reconcile
  ```
  Authenticated fetch per Better Auth's Expo docs: on native, `const cookie = await authClient.getCookie()` and send `headers: { cookie }` with `credentials: "omit"` (the manual header and `"include"` interfere); on web, plain fetch with `credentials: "include"` (same origin as auth). 401 → typed `WalletAuthError`.
- **Jest**: add to `apps/mobile/jest-setup.js`: `jest.mock("react-native-purchases", () => ({ default: { configure: jest.fn(), logIn: jest.fn(async () => ({ created: false })), getProducts: jest.fn(async () => []), purchaseStoreProduct: jest.fn(async () => ({ customerInfo: {} })) }, PRODUCT_CATEGORY: { NON_SUBSCRIPTION: "NON_SUBSCRIPTION" } }))`. The package matches the existing `transformIgnorePatterns` allowlist (`react-native*`), so ESM is transformed.

### Step 6 — Store UI

- **Screen** `apps/mobile/src/components/screens/store/store-screen.tsx` + route `apps/mobile/src/app/store.tsx` (kebab routes: `offline`, `sign-in`). Style follows `mode-card.tsx` / theme tokens (`colors.gold` accents, `fonts.mono` labels) — no `@expo/ui` restrictions beyond what home already uses. States:
  - **Unavailable** (web build, or native without keys): the three `COIN_PACKS` listed without prices, buy buttons absent, caption "Coin packs are available in the mobile app." (`testID="store-unavailable"`). This is also the E2E-build state — nothing may crash.
  - **Signed out** (`WalletAuthError` from `fetchWallet`): "Sign in to top up." (`testID="store-signed-out"`).
  - **Ready**: balance row (`testID="wallet-coins"`, "<N> COINS"), one row per offer (`testID="store-pack-<productId>"`) with label, coins ("+3,000"), localized `price`, buy button (`testID="store-buy-<productId>"`).
  - Buy flow: disable the row while `purchaseCoinPack(productId)` runs → `"cancelled"` restores quietly; `"purchased"` → `reconcileWallet()` → update balance and flash "+<coins> COINS ADDED"; thrown error → inline error row, keep the balance. `fetchCoinPacks()` failure → error state with retry.
  - Loads `fetchWallet()` + `fetchCoinPacks()` on mount; re-runs `reconcileWallet()` on mount too (catches purchases the server never heard about).
- **Home entry** in `apps/mobile/src/components/screens/home/home-screen.tsx`: extend `ModeKey` with `"store"` and insert after the offline entry: `{ key: "store", href: "/store", glyph: "🪙", label: "Coin Store", description: "Top up your coin balance" }`.
- **Test** `store-screen.test.tsx` (mock `@/lib/revenuecat` and `@/lib/wallet-client`): renders the three packs; unavailable caption when `revenuecatAvailable()` is false; buy → purchase then reconcile called, balance updates; cancelled → no reconcile; signed-out state on `WalletAuthError`.

### Step 7 — Native config: Android launchMode

RevenueCat requires the purchasing Activity's `launchMode` to be `standard`/`singleTop` (Google Play may verify payment in another app; `singleTask` cancels the purchase), and Expo's Android template sets `singleTask`. Add local config plugin `apps/mobile/plugins/launch-mode.ts` using `withAndroidManifest` from `@expo/config-plugins` (a devDependency-free import — it ships with `expo`) to set the main activity's `android:launchMode` to `singleTop`, and register `"./plugins/launch-mode"` in `apps/mobile/app.json`'s `plugins` array. `singleTop` keeps deep-link behavior (the template default was chosen for notifications, and `singleTop` is what Expo's own fyis recommend for re-launch cases). Verify after `npx expo prebuild -p android` that the generated manifest carries it; if a future template already emits `singleTop`, delete the plugin then.

### Step 8 — Environment + RevenueCat dashboard (manual prerequisites)

Env names added to `apps/mobile/.env` as commented placeholders (values arrive when the dashboard exists; server-side names are never `EXPO_PUBLIC_`):

```
# EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=    (public SDK key, appl_…)
# EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=    (public SDK key, goog_…)
# REVENUECAT_SECRET_API_KEY=               (v1 secret key — API routes only, never bundled)
# REVENUECAT_WEBHOOK_AUTH=                 (shared secret RevenueCat sends as the webhook authorization header)
```

Dashboard checklist (revenuecat.com, free tier is enough for reconcile; Pro unlocks the webhook): create project → add App Store app (`com.wordpoker.wordpoker`) and Google Play app → create 3 consumable products with ids exactly `coins_small` / `coins_medium` / `coins_large` (store-side prices ~$0.99 / $4.99 / $9.99; the app reads prices from the store) → copy the public per-platform SDK keys and one v1 secret API key. On Pro: add a Webhooks integration, set its authorization header value to `REVENUECAT_WEBHOOK_AUTH`, point it at `https://<deployed-api-origin>/api/revenuecat-webhook` when that origin exists. Store products must also exist in App Store Connect / Play Console before production; RevenueCat's Test Store covers development without them.

## Critical files & anchors

- `packages/db/src/entities/results-rating.ts` + `packages/db/test/results-rating.test.ts` — the entity + self-provisioning test patterns Step 2 copies.
- `packages/db/mikro-orm.config.ts` — `entities: [...]` array where the two new entities must be registered (easy to miss).
- `apps/mobile/src/app/api/results-rating+api.ts` + `apps/mobile/src/lib/results-rating.ts` + `src/lib/results-rating-route.test.ts` — route, client and route-test conventions Steps 3–5 copy.
- `apps/mobile/src/lib/auth.ts` / `auth-client.ts` — the server `auth` instance for `getSession`, and `authClient.getCookie()` for the authenticated wallet fetch (Better Auth Expo docs pattern).
- `apps/mobile/src/components/screens/home/home-screen.tsx` — `ModeKey` union + `MODES` array where the store entry lands.

## Verification

Prereqs: local Postgres or the PlanetScale `DATABASE_URL` (as the db suite already uses), seeded E2E user (`node --env-file=apps/mobile/.env scripts/seed-test-user.mjs`).

1. `pnpm --filter @wordpoker/contracts test` — coin catalog invariants.
2. `pnpm --filter @wordpoker/db db:migrate && pnpm --filter @wordpoker/db test` — wallet ledger against a real (self-provisioned) database, incl. purchase-id idempotence.
3. `pnpm --filter @wordpoker/mobile typecheck && pnpm --filter @wordpoker/mobile test` — route contracts (401/400/500/502 paths), store screen states, buy flow.
4. Local end-to-end of the routes: `pnpm --filter @wordpoker/mobile web`, then from a shell — sign in as the E2E user (`POST /api/auth/sign-in/email` on `http://localhost:8081` with the seeded JSON credentials, capture the session cookie) → `GET /api/wallet` with that cookie → `{"coins":0}`; without the cookie → 401. With `REVENUECAT_SECRET_API_KEY` set (any valid key), `POST /api/wallet/reconcile` → `{"coins":0,"creditedCoins":0}` (RevenueCat creates the subscriber empty on first lookup). `POST /api/revenuecat-webhook` with header `x-auth: <REVENUECAT_WEBHOOK_AUTH>` and body `{"api_version":"1.0","event":{"type":"TEST","app_user_id":"<e2e-user-id>"}}` → `200 {"ok":true,...}`; with a wrong `x-auth` → 401.
5. Web UI: in a browser on the dev server — home shows the "Coin Store" card; the store screen lists the three packs in the unavailable state with the mobile-only caption. Re-run `.maestro/offline-hand.yaml` unchanged to prove the new home card broke no selectors.
6. Native sandbox purchase (the real-money proof; needs the Step 8 dashboard setup): `eas build --platform android --profile development` (or ios-simulator profile), install on device/emulator, sign in, open Coin Store → packs show store prices → buy `coins_small` in sandbox → balance jumps by 500; buy again → +500 again (two `wallet_entry` rows, two distinct purchase ids); kill the app right after a purchase and reopen the store → mount-time reconcile credits it.

## Assumptions & contingencies

- **Catalog**: amounts {500, 3000, 7500} for {$0.99, $4.99, $9.99}; "coins" is the display name (matches the quests plan). Prices live in the stores; amounts live in `contracts` — retuning is data-only.
- **Sandbox counts**: reconcile credits `is_sandbox` purchases too, so dev builds work against the dev backend; tightening (env-gated) is a later hardening step, not this plan.
- **Deployment**: production native builds already require `EXPO_PUBLIC_AUTH_URL` to point at a deployed API host (Better Auth's requirement); the wallet routes and webhook ride the same host — no new deployment work here, but the webhook stays URL-less until that host exists.
- **If `auth.api.getSession({ headers })` differs in Better Auth 1.7**: follow `node_modules/better-auth`'s own types over the docs snippet.
- **If `authClient.getCookie()` is absent/different in `@better-auth/expo` 1.7**: check the installed package's exports; the documented fallback is reading the SecureStore cookie directly with the client's `storagePrefix`.
- **If `react-native-purchases@10` misbehaves with Expo 57** (build or runtime): drop to the latest 9.x — the APIs used (`configure`, `logIn`, `getProducts`, `purchaseStoreProduct`) are identical.
- **If Google Play sandbox still cancels purchases after the launchMode plugin**: confirm the generated `AndroidManifest.xml` actually carries `singleTop` before anything else — the plugin is the only moving part.
- **If REST `non_subscriptions[].id` and webhook `transaction_id` turn out to differ** for the same purchase: irrelevant by construction — only the REST id is ever stored; the webhook just triggers a pull.
- **If `getProducts` returns nothing on a fresh dev build**: the products must exist in the RevenueCat dashboard with matching ids and the app must be attached to a store app (or Test Store) — dashboard problem, not code; the screen's error state covers it.
- **Quests plan overlap**: `QUESTS_LOGIN_STREAK_PLAN.md` Step 3's `PlayerWallet`/`WalletEntry`/`creditWallet` are superseded by this plan's ledger (same tables, plus `product_id`/`purchase_id`); its quest/streak tables and `QUEST_WALLET_SOURCES` should import `WALLET_SOURCES` from contracts when that plan runs.
