import {
  defineServer,
  defineRoom,
  monitor,
  playground,
  createRouter,
  createEndpoint,
  LobbyRoom,
} from "colyseus";
import { admin } from "@colyseus/admin";
import type { MonitorOptions } from "@colyseus/monitor";
import { GameDatabase } from "@colyseus/database";
import { GAME_ROOM_NAME, LOBBY_ROOM_NAME } from "@wordpoker/contracts";

/**
 * The admin panel's own accounts live in a local SQLite file (`colyseus.db`), not the app's
 * Postgres: `GameDatabase` auto-migrates its tables on boot, and the shared database belongs to
 * Better Auth and the Wallet. `admin()` refuses to boot without `JWT_SECRET`, so the panel only
 * mounts where it is set: `.env.development` locally, the app's environment on Colyseus Cloud.
 */
const adminEnabled = Boolean(process.env.JWT_SECRET);
const database = adminEnabled ? new GameDatabase() : undefined;

/** The monitor's room grid, plus which PM2 process holds each room — Cloud runs several. */
const MONITOR_COLUMNS: MonitorOptions["columns"] = [
  "roomId",
  "name",
  "clients",
  "maxClients",
  "locked",
  "elapsedTime",
  "processId",
];

/**
 * Import your Room files
 */
import { GameRoom } from "./rooms/GameRoom.js";
import { HistoryService } from "./history/history-service.js";

/**
 * The listable table. `enableRealtimeListing()` is what makes Colyseus push this room's joins,
 * leaves, locks and metadata changes to lobby subscribers — without it a listing only ever
 * changes when a client asks for it again, and the lobby's seat counts would sit still.
 */
const game = defineRoom(GameRoom).enableRealtimeListing();

const server = defineServer({
  database,
  beforeListen: async () => {
    const history = await HistoryService.fromEnv();
    if (history === null) return;
    let running = false;
    const recover = async () => {
      if (running) return;
      running = true;
      try {
        await history.recoverPending();
      } catch (error) {
        console.error("history: settlement recovery failed; retained entries will retry", error);
      } finally {
        running = false;
      }
    };
    await recover();
    const timer = setInterval(() => { void recover(); }, 10_000);
    timer.unref();
    server.onBeforeShutdown(() => { clearInterval(timer); });
  },

  /**
   * Define your room handlers:
   *
   * `lobby` is Colyseus's own LobbyRoom: it subscribes a client to the matchmaking listings and
   * pushes every room's add, change and removal as they happen, which is how the lobby screen
   * keeps live seat counts without polling.
   */
  rooms: {
    [GAME_ROOM_NAME]: game,
    [LOBBY_ROOM_NAME]: defineRoom(LobbyRoom),
  },

  /**
   * Experimental: Define API routes. Built-in integration with the "playground" and SDK.
   *
   * Usage from SDK:
   *   client.http.get("/api/hello").then((response) => {})
   *
   */
  routes: createRouter({
    api_hello: createEndpoint("/api/hello", { method: "GET" }, async (ctx) => {
      return { message: "Hello World" };
    }),
    /**
     * Ops tools: the admin panel at /admin/ (dashboard, live rooms), with the monitor at /monitor
     * and the playground at /playground behind its login. The first visit to /admin/ asks for an
     * email and password to create the first admin.
     */
    ...(adminEnabled
      ? {
          ...admin({}),
          ...monitor({ columns: MONITOR_COLUMNS, use: [admin.guard()] }),
          ...playground({ prefix: "/playground", use: [admin.guard()] }),
        }
      : {}),
  }),

  /**
   * Bind your custom express routes here:
   * Read more: https://expressjs.com/en/starter/basic-routing.html
   */
  express: (app) => {

    app.get("/hi", (req, res) => {
      res.send("It's time to kick ass and chew bubblegum!");
    });
  }
});

export default server;

