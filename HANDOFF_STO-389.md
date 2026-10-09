# Handoff — STO-389 online rooms: Colyseus admin, Android sync bug, native Maestro smoke

Date: 2026-10-09. Branch: `main` (nothing committed — move to `sto-389-online-rooms-find-and-create-a-table-epic`).
Epic: https://linear.app/magnus-adhd-brain/issue/STO-389

The working tree also holds the user's own uncommitted UI work (powers/, lobby create-table-layout,
word-builder, offline-game-screen, game-screen.tsx, `android:device` script in root package.json).
Don't sweep those into this work's commit without asking.

## What this session changed

1. **Server patch spam (likely the Android "falls behind / can't tap" bug)** —
   `apps/server/src/rooms/GameRoom.ts` `onTick()` wrote `state.now` every 50 ms tick, so every
   client got a patch 20×/s forever and re-decoded/re-rendered the felt. The client never reads
   `state.now`. Line removed; `project()` still updates it on real events. Server tests: 41 passing.
   **Not deployed to Colyseus Cloud yet**, and the app's `.env` points at Cloud
   (`EXPO_PUBLIC_GAME_URL=https://us-ewr-251846dc.wordpoker.app`), so the fix isn't live.

2. **Colyseus admin panel** — `apps/server/src/app.config.ts`: `@colyseus/admin` (+ `database`,
   `auth`) at `/admin/`, with `/monitor/` and `/playground/` behind `admin.guard()` (trailing slash
   matters). Admin accounts live in SQLite `colyseus.db` (gitignored), deliberately NOT the shared
   Postgres (GameDatabase auto-migrates tables on boot). Mounts only when `JWT_SECRET` is set —
   local secret is in `apps/server/.env.development` (untracked). Verified locally: `/admin/` 200,
   `_health` db ok, monitor/playground 401 unauthenticated. First visit bootstraps an admin.
   Cloud: set `JWT_SECRET` in the Cloud app env, then redeploy. Deploy method unknown (no script
   or docs in repo; `.colyseus-cloud.json` exists) — ask the user before deploying.

3. **Native online smoke** — `scripts/smoke-online-native.mjs` (cross-platform Node), scripts
   `pnpm smoke:online:android` / `pnpm smoke:online:ios`. Starts seeded Colyseus, Metro
   (`--clear`, `EXPO_PUBLIC_E2E_AUTH_BYPASS=1`, `EXPO_PUBLIC_GAME_URL=ws://localhost:2567`),
   `adb reverse` 2567/8081 on Android, the `smoke-opponent.ts` bot, cold-starts the dev client on
   `exp+word-poker://expo-development-client/?url=http://localhost:8081`, then runs
   `apps/mobile/.maestro/native/online-hand.yaml` with `ROOM_ID` + `ATTACH=1`.
   Optional 2nd arg: another flow path. Children log straight to files in the printed temp dir.
   Flow edits: `ATTACH` branch (don't relaunch), wait for "Online Mode" before the room link,
   `times: 12` caps on loops, action/tile taps use `waitToSettleTimeoutMs: 500` +
   `retryTapIfNoChange: false`.

## Status of the native smoke: NOT passing yet

Progress reached: dev client loads local bundle → room link → table → READY → preflop CALL lands
on the server (flop was dealt). Then the device seat gets auto-folded by the 42 s turn clock.

Root cause found in `~/.maestro/tests/<run>/maestro.log`: each Maestro tap on the felt takes
~40 s (16–18 s waiting for the hierarchy to settle + waiting for UI change), because the felt
never idles. Last change (untested — the run was interrupted): the runner sets
`WORDPOKER_SMOKE_ROOM={"turnDuration":300000,"payoutDelay":60000}` so slow taps can't time out.
**Next step: run `node scripts/smoke-online-native.mjs android` and see if it passes.** If the
loop still never matches "YOUR TURN", wait on `id: action-check-call` with `enabled: true` instead.

Gotchas hit:
- Run with `node scripts/...` directly; `pnpm smoke:online:android` under Git Bash crashed Node
  (0xC0000409) twice.
- The dev client reconnects to its *last* Metro — it was a Metro on another LAN machine
  (192.168.1.186) with a different game URL baked in. The runner's cold-start link fixes this.
- Something on the user's machine re-spawns `adb` constantly; it once piled ~100 hung adb
  clients and wedged the runner. Fix: kill all `adb`, `adb start-server`.
- Launching the emulator from an agent shell ties it to that shell — launch detached
  (`Invoke-CimMethod Win32_Process Create`), and never leave two qemu instances on one AVD.
- Expo prints "The /android project does not contain any URI schemes" — noise; the manifest has
  `wordpoker` and `exp+word-poker`.
- Web smoke (`pnpm smoke:online`) currently fails at sign-in; reseed the E2E user:
  `node --env-file=apps/mobile/.env scripts/seed-test-user.mjs`.

## Open lead for the real Android bug

`GameScreenBody` (`apps/mobile/src/components/screens/game/game-screen.tsx`) calls
`useHandTurn` → `useTurnClock`, which ticks every 250 ms (`TICK_MS`), so the whole felt body
re-renders 4×/s on top of every server patch. React Compiler is on, so children may be memoized —
unmeasured. If profiling on Android shows it matters: keep the turn anchor in the body via a
non-subscribing clock read and subscribe only the HUD and the betting `waitingOn` view
(`useTurnTimer(timing)` in a small leaf). Don't do it on a hunch; profile first.

## Not started from the epic

STO-445 (Create action missing on mobile — user has WIP files), a native create-table Maestro
flow (the user's bug was in *creating* a room), STO-471/399/400 integration, STO-412/413/414/415.
