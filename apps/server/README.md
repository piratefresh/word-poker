# Welcome to Colyseus!

This project was created with [⚔️ `create-colyseus-app`](https://github.com/colyseus/create-colyseus-app/).

[Documentation](https://docs.colyseus.io/)

## :crossed_swords: Usage

```
npm start
```

Then open http://localhost:2567 for the playground, or /monitor for the monitor.

## Structure

Online tables require a valid Better Auth session. Set `AUTH_API_URL` to the Expo API origin
(HTTPS in production; defaults to `http://localhost:8081` for development). The public lobby
remains anonymous. Restart the Expo API server after changing its Better Auth plugins.
An account holds at most one seat per table (a second join gets 409). The scripted smoke
opponent signs in as the seeded `e2e-2@wordpoker.dev` (`OPPONENT_EMAIL` overrides it) so the
player's flow can be `e2e@wordpoker.dev`. Load tests need `LOADTEST_SESSION_TOKENS`, one
comma-separated session per client.

The verifier needs an API that has Better Auth's `bearer()` plugin. A Metro started with
`API_PROXY` forwards `/api/auth/*` to the hosted backend, so until that backend ships `bearer()`,
table joins against it fail with 401. Run a local Expo API without `API_PROXY` and point
`AUTH_API_URL` at it. Roll out in that order too: the Expo API with `bearer()` first, then this
server with `AUTH_API_URL` set (without it, production joins fail with 503).

With local Expo and Colyseus running, check real sign-in, table admission, and revocation:
`pnpm --filter @wordpoker/server exec tsx scripts/smoke-auth.ts`.
Disable `API_PROXY` on the test Expo instance so `/api/auth/*` runs the local code.
`AUTH_API_URL` and `GAME_URL` can point this check at separate local test ports.

- `src/index.ts`: entry point — leave it alone if you plan to deploy to Colyseus Cloud
- `src/app.config.ts`: server configuration — rooms, HTTP routes, express middleware
- `src/rooms/GameRoom.ts`: your room handler
- `src/rooms/schema/GameRoomState.ts`: the state synchronized to every client in the room
- `test/GameRoom.test.ts`: boots the real server and connects a real client
- `loadtest/example.ts`: scriptable client for `npm run loadtest`
- `ecosystem.config.cjs`: pm2 configuration, used when deploying to Colyseus Cloud

## Scripts

- `npm start`: run the server in watch mode (`tsx watch src/index.ts`)
- `npm test`: run the mocha test suite
- `npm run build`: compile to `build/`
- `npm run loadtest`: connect N simulated clients with [`@colyseus/loadtest`](https://github.com/colyseus/colyseus-loadtest/)

## What's included

### Rooms

Two rooms are registered in `src/app.config.ts`, under the names `packages/contracts` publishes
(`GAME_ROOM_NAME`, `LOBBY_ROOM_NAME`):

- **`game`** — a table. `onCreate` validates its config with `validateRoomCreateOptions` (§2's
  fixed buy-in, §5's seat cap, a name) and throws the refusal sentence if it is not legal, which
  is what a client's failed `create` sees. The validated config is mirrored into
  `GameRoomState.table` so a seated client reads its own stakes, while the public projection keeps
  private racks and word drafts out of synchronized state. The room is defined with
  `defineRoom(GameRoom).enableRealtimeListing()` — without that call Colyseus never pushes its
  joins, leaves, locks or metadata changes to lobby subscribers.
- **`lobby`** — Colyseus's own `LobbyRoom`. A client joins it once and receives `rooms` (the
  current listing), `+` (an add or change) and `-` (a removal); sending it `filter` asks for the
  list again. Seat counts ride the listing (`clients` / `maxClients`), so nothing has to be
  published twice.

The desktop client of that wire lives in `apps/mobile`: `src/features/online/use-lobby.ts` folds the
messages into rows, and `src/features/online/room-session.ts` creates and joins tables by id.

### Authoritative hands

`GameRoom` is the adapter around the shared `@wordpoker/game-rules` reducer. Once the configured
seats are present, the server deals the hand, supplies `client.sessionId` as the player id, and
accepts only the shared `betting`, `draftWord`, and `confirmWord` messages. Illegal actions are
sent back as a targeted `rejected` event; the public schema exposes seats, commitments, pots,
revealed community tiles, word-window status, and the payout result.

The room sends each connection a separate `privateState` event containing that seat's rack and
word draft. The synchronized community is sliced to the engine's revealed count, so unrevealed
tiles never cross the public boundary. A disconnected actor keeps its seat and runs the same turn
clock as a connected one, so the hand does not pause for a missing client. An expired turn always
folds the actor (§15, ADR 0006) — whatever it owed, whether or not it could have checked — and a
connected actor receives a targeted `turn-timeout` rejection event. A seat that is really gone, by
a clean leave or an expired reconnect hold, is folded out of the running hand (§28/§29).

Every deadline is checked on the room's own timestep loop, so a test paces the room by choosing
the tick. The room options are `turnDuration` (60 s default), `tickMs` (50 ms default),
`reconnectSeconds` (180 s default), `payoutDelay` (250 ms default), and `seed` — the seed is
honored only when `WORDPOKER_DETERMINISTIC_SEED=1`, and the default is drawn server-side. When a
hand pays out and no second seat can pay another, the table returns to `waiting` between hands,
holding each seat and its ended stack until the wallet and re-buy flows land (Epic B).

- https://docs.colyseus.io/room/timing-events

### Reconnection

`GameRoom.onDrop()` holds a dropped client's seat for 180 seconds via
`allowReconnection()`, folds it when necessary, and sends a fresh private snapshot from
`onReconnect()`. The snapshot restores the seat's private rack and draft without restarting the
hand or its shared clock; an expired hold folds the seat out and leaves its committed chips in the
pot.

- https://docs.colyseus.io/room/reconnection
