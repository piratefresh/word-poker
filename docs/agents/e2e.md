# End-to-end testing

Maestro flows (web and native), the online smokes, and the shared E2E user.

## History testing

History testing needs auth and history routes from this checkout, plus the room server's history
database and settlement journal. Apply the additive migration, then run the two servers in separate
terminals:

```bash
pnpm --filter @wordpoker/db db:migrate
pnpm dev:history
pnpm start:local
```

`dev:history` uses `apps/mobile/.env`'s database, verifies online seats at `http://localhost:8081`,
and retains uncommitted settlements in `.history-settlements/`. `start:local` disables `API_PROXY`
and pins the game connection to the local server even when the API reloads its environment. In
production, configure the room server's `WORDPOKER_HISTORY_DATABASE_URL` and mount a persistent
`WORDPOKER_HISTORY_JOURNAL_DIR`; see `apps/server/.env.example`.

Play a completed online or offline hand and open **Game History** on home. The list groups hands
by room/session and shows words, scores, pots and chip changes. Offline records stay pending until
the API verifies and accepts them. The public reader hides replay seeds, opponents' private drafts
and unrevealed racks. The local store uses SQLite on native and IndexedDB on web; SDK 57's SQLite
worker failed to bundle on this Windows setup, so the browser uses its native transactional store.

`.maestro/history.yaml` extends the web offline hand through history. The native equivalent is
`apps/mobile/.maestro/native/history.yaml` and requires a real signed-in development build;
the auth-bypass E2E build has no account to own history. Run it on Android with
`node scripts/smoke-online-native.mjs android .maestro/native/history.yaml`: it signs in, plays
the offline hand in airplane mode, sees it pending, kills the app, turns airplane mode off, cold
starts and waits for the hand to verify. Airplane mode does not cut `adb reverse`, so the runner
removes the game and API mappings while it is on. Native cached sessions remain readable on network failure; uploads always revalidate the
account and use its captured bearer credential, so a cookie switch cannot mix history partitions.

The runner starts Android with airplane mode off so a failed offline run cannot prevent the next
Metro load. For the Android history flow it gives the device API a separate port (Metro's port + 1,
or `SMOKE_DEVICE_API_PORT`), reversed to the same Metro host port. The bundle's auth and history
URLs use this API port. Airplane mode removes that mapping and the game mapping, preserving
Metro's asset connection and other tools' mappings. This prevents development-only Rive asset
errors from covering CALL without leaving the history upload URL reachable. Every 3 s the runner
checks the mappings and repairs missing ones when airplane mode is off; it does not rebind healthy
connections. The native hand follows the seeded streets explicitly, so a fold-out
fails at the next street instead of waiting forever for RIVER.
History's React Native lists keep Expo UI hosts attached until their native height is measured,
and the hosts fill the row width while matching only content height. Clipping these initially
zero-height hosts left a blank native list even when SQLite had the completed hand.
The table's clock and Rive art keep animating; native taps request a 500 ms settle budget and use
explicit state assertions. This is not a hard command deadline: Maestro can still block inside
an accessibility hierarchy read longer than that budget.

## End-to-end (web)

UI flows live in `.maestro/` and drive the Expo web build through Maestro's Chromium:

```bash
pnpm --filter @wordpoker/mobile web                 # in one terminal
maestro test --platform web .maestro/offline-hand.yaml
```

Headed is the default (`--headless` hides the browser; headless also takes `--screen-size`). Keep a Chrome
whose version matches the `chromedriver` on `PATH`. Each flow's header documents its own selectors and what
it needs.

A flow names a control by `id:`, and on the web that id is the element's *test id* wherever the component
has one — `webTestID` (`apps/mobile/src/lib/web-id.ts`) keeps the DOM element's own `id` in step with
`testID`, because Maestro reads the DOM id before the aria-label and the label would otherwise hide the
test id from the web (its injected `maestro-web.js` falls back to `data-testid` last). Labels are for the
elements that carry no test id at all. A control prints its label and its amount as separate text nodes,
so `text:` never sees "CALL $60" in one piece: reach the amount through the control —
`containsDescendants: [{ text: "\\$60" }]` — and match text whole (Maestro's text matcher is anchored),
remembering the felt prints "BLINDS $10 / $20" under the pot.

Run the online multiplayer smoke (STO-409) from one Windows terminal at the repository root:

```powershell
pnpm smoke:online
```

The runner starts Colyseus with deterministic seeds enabled, starts Expo web on port 8081, waits for
both servers, creates a fresh seed-409 opponent, and passes its room ID to the headed Maestro flow.
It stops its server and opponent process trees on completion, failure, or Ctrl-C. Logs stay in the
temporary directory printed at startup. Existing processes listening on ports 2567 and 8081 are terminated before starting.
The smoke server runs without file watching, and background stdin is redirected to an empty file.
Maestro must be on PATH or installed at ~/.maestro/bin/maestro.bat; keep Chrome and chromedriver
on matching versions. The existing mobile/server env files and seeded E2E user are still required
(see below). This runner is local and Windows-only.

The opponent creates Smoke Table, calls when it owes, and keeps results open until the player leaves. The flow
signs in when needed, builds ILK, checks the results overlay, and leaves the table.

`pnpm smoke:online:guest` (STO-581) is the same runner with `.maestro/online-guest-join.yaml`: the
browser opens the invite link (`/online?room=<id>`), taps "Play as guest" on the sign-in screen
(Better Auth's anonymous plugin, so the auth database needs the `isAnonymous` migration), checks
the invite sheet names the same table, readies up and waits for the deal. A profile that is already
signed in skips the guest tap.

The Wild variant (STO-500) is the same runner with power-ups on:

```powershell
pnpm smoke:online:wild            # headed; add -Headless for --headless --screen-size 1280x1000
```

It sets `WORDPOKER_SMOKE_ROOM` to a Wild room at seed 518 and runs `.maestro/online-wild-hand.yaml`.
The browser picks Wild Tile, uses it on its first turn, sees the "power used" card, and builds FE
with the new tile. The opponent keeps its first offer and never uses it. It logs the public use it
hears, and it logs `LEAK:` if a swapped tile reaches it before the reveal. The runner fails on
either. After changing the deal, the catalog or the letter stream, re-probe with
`pnpm --filter @wordpoker/server exec tsx scripts/probe-wild-smoke.ts <firstSeed> <lastSeed>`.

The four-browser smoke (STO-483) has every seat played by a real browser, each driven by its own
Maestro process:

```powershell
pnpm smoke:online:four            # headed; add -Headless for --headless --screen-size 1280x1000
```

It plays one seeded session. Hand 1 has a raise, a fold, a re-raise, calls, a flop bet and three
words at showdown. In hand 2 a short stack shoves into a side pot, loses and busts. In hand 3 the
busted seat sits out and leaves, which sends the table back to waiting. The three seats left ready
up again, and hand 4 deals 3-handed. P1 creates "Four Table" through the real lobby form, so the
seed cannot come from the create. Instead the runner sets `WORDPOKER_SMOKE_ROOM` (JSON room knobs:
seed, turn clock, and `powerUps` — §40's Classic/Wild, validated like a create's own), which the server merges under a create's own options, and only
behind `WORDPOKER_DETERMINISTIC_SEED=1`. A lobby watcher that takes no seat
(`apps/server/scripts/smoke-lobby-watch.ts`) tells the runner when each browser has sat down, and
the runner starts the next one only then, so join order is seat order. The script lives in
`apps/server/scripts/four-seat-scenario.ts`. A mocha case replays it over four sockets, and the
flows in `.maestro/four-seat/` tap it out. After changing the script or the deal, re-probe with
`pnpm --filter @wordpoker/server exec tsx scripts/probe-four-seat.ts <firstSeed> <lastSeed>`,
then update the seed (scenario, runner) and the taps (seat flows, seat-1.yaml's header).

### E2E test user

Flows behind the auth guard sign in as the shared E2E user `e2e@wordpoker.dev`, seeded straight into
Postgres (Better Auth's own hash) by an idempotent script — rerun it whenever the password stops working;
it resets the password and keeps the user's id:

```bash
node --env-file=apps/mobile/.env scripts/seed-test-user.mjs
```

The same script also seeds `e2e-2@wordpoker.dev`, `e2e-3@…` and `e2e-4@…` (same password). An online
table seats an account only once, so multi-seat smokes give each seat its own account. The scripted
opponent and the cross-platform browser seat use `e2e-2`, and four-seat seats P2–P4 use `e2e-2`
to `e2e-4`. Choose the account with `-e TEST_USER_EMAIL=…` on any flow that runs `sign-in.yaml`.

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

## End-to-end (native)

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
# On a Mac with an iOS Simulator, use --platform ios for both build:run and maestro test.
```

Android wants a booted emulator or an adb-visible device; `--platform ios` needs a Mac with a
Simulator. The flow takes the action row by testID (`action-check-call`, `action-wager`) — the felt's
nameplates print CHECK and CALL as seat status too, so a text selector there is ambiguous — and
everything else by the string a component prints, matched whole and case-sensitively, unlike the web.

EAS Workflows runs the iOS offline hand from `apps/mobile/.eas/workflows/e2e-ios.yml`. It builds
with `e2e-test`, then runs `.maestro/native/offline-hand.yaml` on an iOS simulator. Trigger it
manually from `apps/mobile` with `eas workflow:run .eas/workflows/e2e-ios.yml`, or add the `e2e`
label to a pull request. EAS Workflows and its Maestro job require an Expo plan that includes
those services.

### Online device smoke

apps/mobile/.maestro/native/online-hand.yaml runs the same seed 409 hand with a signed-in development build and a ROOM_ID deep link. Online joins require a real Better Auth session; the offline E2E auth bypass cannot authenticate a table. The device needs reachable Expo auth and Colyseus servers, a seeded E2E user, WORDPOKER_DETERMINISTIC_SEED=1, and a separate smoke-opponent.ts process. The flow signs in when needed. Run it from apps/mobile with the room id printed by the opponent:

    pnpm android:device
    maestro test --platform android .maestro/native/online-hand.yaml -e ROOM_ID=the-id-printed-by-smoke-opponent

Set EXPO_PUBLIC_GAME_URL at build time to an address the device can reach; localhost on the device is not the development machine. Keep this device flow manual and out of CI until its server and opponent are provisioned.

The local runner automates that wiring on one machine (Windows or macOS):

    node scripts/smoke-online-native.mjs android

It starts the seeded Colyseus, Metro (`--clear`, real sign-in, local auth and game URLs), the scripted
opponent, cold-starts the dev client on its Metro, and runs the flow with `ATTACH=1`. Every ADB
call is bounded and asynchronous — a hung `adb` has wedged whole runs — and `SMOKE_TIMEOUT_MS`
(default 900000) starts before setup. Cancellation and timeout stop Maestro and the service
process trees. `MAESTRO_BIN` pins one Maestro install: an install directory that has
overlayed releases keeps stale JARs around and crashes the driver with `NoSuchMethodError`, so
keep one clean extract per version and point `MAESTRO_BIN` at it. If taps take tens of seconds,
compare a small Settings flow with the felt and time `adb shell uiautomator dump` in both.
A cold boot restored a stalled Settings flow to ten consecutive passes of about 10–12 s on
2026-10-09; this demonstrates an environment contribution, not a fix for app input latency.
To cold-restart the emulator, use
(`adb emu kill`, then relaunch it detached — never two qemu instances on one AVD).

On this Windows workstation, `adb -s emulator-5554 emu avd name` identifies `Pixel_7_Edited`.
Its registration is `~/.android/avd/Pixel_7_Edited.ini`; read its `path=` instead of assuming
the earlier copy to another drive is still active. On 2026-10-13 the verified AVD was copied to
`M:\Android\avd\Pixel_7_Edited.avd` and the registration updated. User data, encryption keys,
the SD card, configuration, and snapshot passed checksum verification; the relocated copy
booted with the installed app intact. Registration and configuration backups are beside the AVD
as `Pixel_7_Edited.registration.before-relocation.ini` and `Pixel_7_Edited.config.before-software.ini`.
After `adb emu kill`, wait for both
`emulator.exe` and `qemu-system-x86_64.exe` to exit, then launch without loading or saving snapshots:

```powershell
Start-Process -FilePath "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -ArgumentList @('-avd', 'Pixel_7_Edited', '-no-snapshot', '-gpu', 'host', '-netdelay', 'none', '-netspeed', 'full') -WindowStyle Hidden
```

The AVD's storage drive and graphics backend are independent; the M: copy uses hardware
graphics and a cold boot. Windows recorded a QEMU crash in NVIDIA's `nvoglv64.dll` during
the history flow's app restart on 2026-10-13 while C: was nearly full. Moving the AVD does
not establish that the driver issue is fixed; verify the restart in the full history flow.
Automatic `-gpu software` selected Lavapipe and also crashed QEMU, with an unknown faulting
module. An explicit `-gpu swiftshader -feature -Vulkan` booted, but its flow was stopped
because opening the table took minutes. Neither software attempt is a verified recovery.
The hardware-rendered M: AVD then passed the full native history flow on 2026-10-13
(`wordpoker-native-smoke-5tBD0N`): river bet/raise/call, ZIG for 14 points, payout, offline
Pending sync, app kill, reconnect, verified upload, saved hand, and action log. After runner
cleanup, `adb devices` took 35 ms and two `dumpsys meminfo` calls took 669/639 ms; no app or
Maestro process remained. The emulator stayed running with airplane mode disabled, and no
QEMU crash event was recorded during that run.

The runner stops the Android app and Maestro instrumentation before stopping Metro. Leaving the
dev client open after Metro exits produced repeated reverse-port connection failures in
`%TEMP%\adb.log` and stalled even `adb devices`. On 2026-10-13 a temporary listener on host
8081 restored the same ADB server's response in 232 ms, without another emulator boot.
If this happens outside the runner, restore Metro long enough to force-stop the app, then stop
Metro. If ADB still cannot respond, stop the host `adb.exe` process before starting a fresh server.
Stop `dev.mobile.maestro` and `dev.mobile.maestro.test` with `adb shell am force-stop` while
no other Maestro run is active. Check a short Settings flow before rerunning the hand.
Temporary `takeScreenshot` paths must be relative to Maestro's output directory; absolute
scratchpad paths fail under Maestro 2.10. Draft before the final river call so slow tile taps
do not consume the shared 60-second word window, then dismiss XP/celebration before results.
The history warm-up must pop the offline screen with Back before loading history, then pop
history back to home. Deep-linking away keeps the warm-up table mounted; its timeout payout
modal can cover a later hand and make that hand appear to have folded out.

On 2026-10-13 the PATH install contained both `maestro-cli-2.6.1.jar` and
`maestro-cli-2.10.0.jar`; even a Settings flow failed with `NoSuchMethodError` in driver setup.
A separate, clean 2.10.0 extract passed the Settings probe in about 12 s. Check for a second
Maestro MCP process before running the CLI; its owning app may restart it after it is killed.
Also check host disk space when the emulator disappears: this AVD refused to cold-boot with
less than 1 GB free on C:. Copying the AVD to a drive with space restored booting.

The Android runner now initializes the driver while the app is stopped, then opens the dev-client
link inside a generated wrapper flow. It starts its ADB mapping observer only after the home screen
has loaded. A history run on API 36 still blocked in Maestro's `viewHierarchy` RPC and
auto-folded before the first call; clean Maestro 2.7 did not remove the delays. Restart ADB between attempts if even `adb devices` stops responding; never run
`uiautomator dump` concurrently with Maestro's instrumentation.

### Web versus native smoke (STO-578)

Two real Maestro UI players share a seeded Colyseus room:

```bash
pnpm smoke:cross:android             # Windows or macOS; booted/USB Android device
pnpm smoke:cross:ios                 # macOS; booted iOS Simulator
pnpm smoke:cross:android --headless  # hide the web browser only
pnpm smoke:cross:probe               # recheck the deal, taps, scores and payout without devices
```

Install a development build first (`pnpm android:device`, or `expo run:ios` from apps/mobile).
Use one connected native target. Maestro (or `MAESTRO_BIN`), Java, and the web driver's matching
Chrome/chromedriver must be installed. Stop services on ports 2567 and 8081 before running.
Alternatively, set `SMOKE_GAME_PORT` and `SMOKE_METRO_PORT` to free ports; the runner wires both
players to those ports and leaves existing development servers running.
The native runner starts Colyseus and one Metro serving both platforms, uses Android port reversal
or the iOS Simulator's shared localhost, and attaches the dev client to that Metro. This Metro sets
real sign-in for both players, so the seeded E2E auth user and Expo API configuration are required.

The web flow (`.maestro/cross-platform-hand.yaml`) creates Cross Platform Table through the lobby
form with the default 500 buy-in and Classic mode. The existing lobby watcher takes no seat and
reports the room ID; only then does the native flow (`apps/mobile/.maestro/native/cross-platform-hand.yaml`)
join it. Both ready up, check/call through all four streets, draft their words before closing river
betting, and confirm them. Seed 505 gives web JET (15 points) and native ETA (8 points); web wins
the $20 pot (stacks 510 / 490). Both UIs assert two words played, the pot and winning score;
the native UI also checks that its own card loses. The engine probe pins the exact
tile IDs, turn order and payout; changes to the deal or scoring must update the flows with it.

The runner succeeds only after both Maestro processes pass. A failure, Ctrl-C, or `SMOKE_TIMEOUT_MS`
(default 15 minutes, including setup) stops the owned service and player process trees. Per-player
logs, Maestro artifacts and result screenshots stay in the temporary directory printed at startup.
This is a local smoke; it does not provision native builds or remote devices in CI.

