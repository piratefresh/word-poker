# Friend tables: create a table, invite by QR/link, friend joins on the web as a guest

## Context

A signed-in player wants to play a friend who has not installed the app. The friend should scan a
QR code (or open a link) and play in the browser using the Expo web build, with no account.

Everything needed already exists except the invite and the guest path: tables are created through
the lobby (`CreateTableForm` → `createTable`), `/online/<roomId>` joins cold from a URL
(`destinationFromURL` in `src/lib/navigation/pending-destination.ts` parses both `/online/<id>` and the
shareable `/online?room=<id>`), and the Colyseus `GameRoom` seats anonymous connections — `onJoin`
keys a seat by `client.sessionId`; there is no `onAuth`/identity. The only auth barrier is the
client-side guard in `apps/mobile/src/app/_layout.tsx`. So this feature is: an invite surface
(QR + copyable web link) on the waiting table, a client-side guest that satisfies the guard, a
discoverable "Play a Friend" entry, and one dev-only fix so a LAN browser can reach the game
server. No server or contracts changes.

## Approach

Steps 1–4 are independent foundations; 5–8 build on 1–3; 9–10 wrap up. Each step leaves the suite
green.

### 1. Dependencies (apps/mobile)

```powershell
pnpm --filter @wordpoker/mobile add react-native-qrcode-svg
pnpm --filter @wordpoker/mobile exec expo install expo-clipboard
```

`react-native-qrcode-svg` rides the installed `react-native-svg@15.15.4` and renders on web and
native. `expo-clipboard` is installed through `expo install` so the version matches SDK 57. No
equivalent of either exists in the tree today.

### 2. New `apps/mobile/src/lib/guest.ts` — the guest flag

Mirror `room-session.ts`'s module store (module state + `useSyncExternalStore`, the established
pattern):

```ts
export function isGuest(): boolean;
export function useGuest(): boolean;        // useSyncExternalStore over the same store
export function startGuest(): void;         // false → true, publish
export function endGuest(): void;           // true → false, publish
```

Header comment states the invariant: the room seats connections, not identities, so a guest is
authed for play and unauthed for anything an account owns; the flag lives in memory only — a
reload shows the invite/sign-in again, which is one tap.

New test `apps/mobile/src/lib/guest.test.ts` (`@testing-library/react-native`'s `renderHook`):
`isGuest()` false initially; `startGuest()` flips it and a rendered `useGuest()` re-renders true;
`endGuest()` flips back; idempotent repeats do not re-publish (listener called once per real
change).

### 3. New `apps/mobile/src/lib/navigation/invite-link.ts` — the shareable web URL

```ts
export function inviteLinkFor(roomId: string): string;
```

Builds `${origin}/online?room=${encodeURIComponent(roomId)}` where origin resolves in this order
(mirrors `api-base-url.ts`'s stance, plus the web page's own origin):

1. `process.env.EXPO_PUBLIC_WEB_URL` (production web deploy), trailing slashes stripped;
2. `Platform.OS === "web"` with `window.location.origin` (dev server or any served origin);
3. `__DEV__ && Constants.expoConfig?.hostUri` → `http://${hostUri}` (native dev: the LAN address
   a friend's phone can open);
4. fallback `http://localhost:8081`.

New test `apps/mobile/src/lib/navigation/invite-link.test.ts`: `jest.mock("expo-constants", ...)` and
`jest.mock("react-native", () => ({ Platform: { OS: "web" | "ios" } }))` per case, stub
`global.window` when needed, and reset `process.env.EXPO_PUBLIC_WEB_URL` between cases. Assert:
env var wins and loses its trailing slash; web uses `window.location.origin`; native dev uses
`hostUri`; native no-hostUri falls back to localhost; and a roomId with reserved characters is
`encodeURIComponent`-encoded into the `room` param.

### 4. `apps/mobile/src/features/online/game-client.ts` — LAN web clients reach the game server

Today a web client without `EXPO_PUBLIC_GAME_URL` falls back to `ws://localhost:2567`, which is
the friend's own machine when they open the invite over the LAN. In `devGameURL()`, before the
`hostUri` branch, add:

```ts
if (__DEV__ && Platform.OS === "web" && typeof window !== "undefined" && window.location.hostname) {
  return `ws://${window.location.hostname}:${GAME_SERVER_PORT}`;
}
```

(import `Platform` from `react-native`). Localhost users get the identical URL as before; only
non-localhost web pages change, where the old value was already wrong. Production still requires
`EXPO_PUBLIC_GAME_URL`.

### 5. `apps/mobile/src/app/_layout.tsx` — the guard admits a guest

- Import `useGuest`, `isGuest` from `@/lib/guest`; `const guest = useGuest();`
- Line 38 becomes `const authed = E2E_AUTH_BYPASS || guest || !!session;`
- Splash wait (line 58) becomes `if ((isPending && !authed) || !fontsLoaded) return null;`
- Rename `DeepLinks`'s prop `session: boolean` to `authed: boolean` and pass `authed` (line 61).
  Inside `DeepLinks` (lines 97–147) every `session` read becomes `authed`, with deps updated:
  - url listener: `if (authed) router.replace(destination); else rememberDestination(destination);`
  - the give-up-the-seat effect: `if (authed) return; void leaveTable();` — a guest keeps their
    seat; a guest that ends (or a sign-out) flips `authed` false and fires the existing leave;
  - the landing effect: `if (!authed || initialConsumed.current) return;` with
    `deps [authed, initialDestination]` — so tapping "Play as guest" lands the remembered invite
    destination.

### 6. Guest entry and the host's entry point

- `apps/mobile/src/components/screens/auth/auth-screen.tsx` — sign-in mode only, under the
  existing `FooterLine` (line 133), add a second footer line reusing `FooterLine`:
  `<FooterLine cta="Play as guest" onPress={startGuest} text="No account?" />`. Sign-up mode is
  unchanged. Maestro targets it by `text: "Play as guest"` (elements without a test id answer to
  their label). After `startGuest()`, `authed` flips, the guard swaps in `(tabs)`, and the pending
  invite destination lands via `DeepLinks`.
- `apps/mobile/src/components/screens/home/home-screen.tsx`:
  - `ModeKey` (line 33) gains `"friend"`; insert into `MODES` after the `online` entry:
    `{ key: "friend", href: { pathname: "/online", params: { create: "1" } }, glyph: "👥",
    label: "Play a Friend", description: "Deal a table, invite by QR or link" }` — the
    `href`-with-params shape the offline Wild variant already uses.
  - Footer (lines 171–184): `session?.user.email ?? (isGuest() ? "Guest" : "Unknown player")`,
    and the Sign out button becomes `onPress={() => { void authClient.signOut(); endGuest(); }}`
    (for a guest `signOut` is a no-op; `endGuest` is what signs them out).

### 7. `apps/mobile/src/components/screens/lobby/lobby-screen.tsx` — auto-open the create sheet

- Add `useLocalSearchParams` to the expo-router import (line 24); read
  `const { create } = useLocalSearchParams<{ create?: string }>();`.
- Add an effect (the param is an external arrival, effect is correct here):
  `if (create !== "1") return; setCreating(true); router.setParams({ create: undefined });` —
  opens the existing `CreateTableForm` once per arrival and clears the param so a web refresh does
  not reopen it.
- Line 145 `me={...}` gains a guest tail: `|| (isGuest() ? "Guest" : undefined)` (ParlorNav
  already renders `me?: string | null`).
- Import `useEffect` from react and `isGuest` from `@/lib/guest`.

### 8. The invite surface on the waiting table

- New `apps/mobile/src/components/screens/online/invite-sheet.tsx`:
  `export function InviteSheet({ visible, roomId, onClose }: { visible: boolean; roomId: string; onClose: () => void })`.
  Mirror `CreateTableForm`'s `BottomSheet` usage (`containerColor={palette.felt800}`,
  `snapPoints={["full"]}`, `onDismiss={onClose}`) with a `ScrollView` + `Column` body:
  - Title "Invite a friend", kicker "NO APP NEEDED", copy line "They open the link in a browser
    and take a seat — no account, no download."
  - A white rounded card (`testID="invite-qr"`) containing
    `<QRCode value={inviteLinkFor(roomId)} size={192} />` (default black-on-white).
  - The link as `selectable` single-line `Text`, `testID="invite-link"`.
  - `GameButton` "COPY LINK" (`testID="invite-copy"`, gold) →
    `await Clipboard.setStringAsync(link)`, then the label reads "COPIED"; a Pressable "Done"
    (`testID="invite-close"`) calls `onClose`, mirroring the create form's Cancel row.
  - Apply `webTestID` to the Text/Pressable test ids as `web-id.ts` documents.
- `apps/mobile/src/components/screens/online/online-felt.tsx`:
  - `OnlineFelt` gains `roomId?: string` (passed by `seated-screen.tsx` line 154:
    `<OnlineFelt dictionary={dictionary} onLeave={leave} room={room} roomId={roomId} />`).
  - `const [inviting, setInviting] = useState(false);` and in the waiting branch pass
    `onInvite={roomId === undefined ? undefined : () => setInviting(true)}` to `ReadyControls`;
    render `{roomId === undefined ? null : <InviteSheet visible={inviting} roomId={roomId} onClose={() => setInviting(false)} />}`
    beside `body`.
  - `ReadyControls` (lines 202–233) gains `onInvite?: () => void`; when present, render a second
    `GameButton` label "INVITE A FRIEND" `variant="dark"` `testID="action-invite"` in
    `styles.readyRow` next to the ready toggle. Waiting-only is correct: the server refuses a
    mid-hand join, and the waiting status line ("Waiting for another player to sit down") is
    exactly where the invite belongs.

### 9. E2E: guest joins from the link

- New `.maestro/online-guest-join.yaml`, header documenting its selectors, modeled on
  `.maestro/online-hand.yaml`:
  `url: http://localhost:8081/online`, `name: Guest joins a friend's table from an invite link`,
  `tags: [web, online]`; body:
  `- openLink: http://localhost:8081/online?room=${ROOM_ID}` (the query form is the shareable
  link itself) → `extendedWaitUntil: visible: "TAKE YOUR SEAT", timeout: 15000, optional: true` →
  conditional `runFlow` `when: visible: "TAKE YOUR SEAT"` with commands
  `tapOn: text: "Play as guest"` → `extendedWaitUntil: id: "poker-table", timeout: 30000` →
  `assertVisible: text: "YOU"` → `tapOn: id: "action-ready"` →
  `extendedWaitUntil: visible: "PHASE 2 · PRE-FLOP", timeout: 30000`. The flow ends at the deal;
  the runner tears the room down.
- `scripts/smoke-online.ps1`: add `[switch]$Guest` to the param block; in the branch chain
  (lines 21–30) add `elseif ($Guest)` selecting `$env:SEED = '409'`, clearing
  `WORDPOKER_SMOKE_ROOM`, `$flow = '.maestro/online-guest-join.yaml'`. Nothing else in the runner
  changes — it already starts deterministic server + web + the seeded opponent and passes
  `ROOM_ID`.
- Root `package.json` script:
  `"smoke:online:guest": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-online.ps1 -Guest"`.
- `AGENTS.md` under "End-to-end (web)": one short paragraph — `pnpm smoke:online:guest` drives
  `.maestro/online-guest-join.yaml`: the browser joins the opponent's Smoke Table from the
  shareable `?room=` link as a guest (no sign-in, exercises "Play as guest").

Temptation line, not scope: making friend tables unlisted (`Room.setPrivate`) or adding a
join-code entry field — neither is needed for scan/link join and both touch the server; the table
stays listed like every table.

### 10. Unit-test and lint pass

Run mobile jest and lint; fix anything the new modules trip (e.g. `lobby-screen.test.tsx` renders
without the `create` param, so the new effect early-returns and `setParams` is never called
there; `seated-screen.test.tsx` stubs `useDictionary` to null so `OnlineFelt` never mounts).

## Critical files & anchors

- `apps/mobile/src/app/_layout.tsx` — guard (line 38), splash wait (58), `DeepLinks` (97–147):
  the `authed` rename and guest wiring; the load-bearing change of the feature.
- `apps/mobile/src/lib/navigation/pending-destination.ts` — read-only reference: proves
  `/online?room=<id>` from any origin parses to `/online/[roomId]`.
- `apps/mobile/src/components/screens/online/online-felt.tsx` — waiting branch (103–116),
  `ReadyControls` (202–233): where `onInvite` lands.
- `apps/mobile/src/components/screens/lobby/create-table-form.tsx` — the `BottomSheet` + refusal
  pattern `InviteSheet` mirrors.
- `scripts/smoke-online.ps1` — param block (line 6) and flow selection (21–30) for `-Guest`.

## Verification

Prerequisites: Windows for the runner; matching Chrome/chromedriver; Postgres with the seeded E2E
user for the *manual* host side (`node --env-file=apps/mobile/.env scripts/seed-test-user.mjs`);
the guest E2E itself needs no auth server.

1. `pnpm --filter @wordpoker/mobile test` — new `guest.test.ts`, `invite-link.test.ts`, and the
   untouched existing suites, all green.
2. `pnpm --filter @wordpoker/mobile typecheck` and `pnpm --filter @wordpoker/mobile lint`.
3. Manual two-browser proof (the real end-to-end), from the repo root:
   - Terminal 1: `pnpm dev:server`; Terminal 2: `pnpm --filter @wordpoker/mobile web`.
   - Browser A (normal profile): sign in as the E2E user → Home shows "Play a Friend" → tap →
     lobby with the create sheet already open → create "Friends" → waiting felt shows INVITE A
     FRIEND → open → QR renders, link matches `http://<host>:8081/online?room=<roomId>` → COPY
     LINK puts exactly that URL on the clipboard.
   - Browser B (incognito): paste the link → the guard shows sign-in with "Play as guest" → tap →
     the felt mounts at the same table (`poker-table`, "YOU", both nameplates) → both seats ready
     → "PHASE 2 · PRE-FLOP" deals; the guest plays the hand with the word builder.
   - Scan check: the QR decodes to the same URL (phone camera or `zbarimg` on the screenshot).
4. `pnpm smoke:online:guest` — exit 0; the flow report shows the guest path taken on the fresh
   profile.
5. `pnpm smoke:online` — still green (the `game-client.ts` change must not move the localhost
   web target).
6. Regression spot-check: signed-out deep link `wordpoker://online?room=x` on a native dev build
   still bounces to sign-in (guard intact when no guest), and signing out of a real session
   mid-table still leaves the seat (DeepLinks give-up effect).

## Assumptions & contingencies

- **Guest is client-side only.** The room seats anonymous connections (`GameRoom.onJoin`), so no
  account is created and no server change is made. If identity lands (Epic B), guest joins are
  the flow to revisit — the flag is one module.
- **Friend tables stay listed in the parlor** (every table is today); the invite is a direct
  seat, not an access restriction.
- **No display name for the guest** — seats are anonymous on the felt today; nothing to collect.
- **`react-native-qrcode-svg` on web**: expected to work through `react-native-svg`'s web
  support. If it renders blank on web, split the QR into `invite-qr.web.tsx` (render a PNG data
  URL from the `qrcode` npm package into an `Image`) and `invite-qr.tsx` (the SVG component),
  keeping the `value`/`size` props — native keeps the SVG path either way.
- **`expo-clipboard` web** uses `navigator.clipboard`; on non-secure origins (LAN http) it can
  reject — the COPY button then shows the failure as the button's own refusal sentence ("Couldn't
  copy — select the link instead") rather than claiming success; the selectable link text is the
  always-present fallback.
- **No persistence for the guest flag** is deliberate: a reload re-shows one tap rather than
  inventing a half-session storage story.
