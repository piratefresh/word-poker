import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import {
  defineServer,
  defineRoom,
  monitor,
  playground,
  createRouter,
  LobbyRoom,
  matchMaker,
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
   * The mobile app's web export (`expo export --platform web`): its pages and its API routes
   * (auth, wallet, friends, history, store, RevenueCat webhook). Colyseus answers its own routes
   * (matchmaking, healthcheck, admin) before Express sees a request, so Expo's handler takes
   * everything else; `/` is registered by
   * name because Colyseus only looks for an explicit root route before claiming `/` itself.
   * The export is too heavy to build on the game host, so the deploy workflow builds it and ships
   * it on the `deploy` branch; without it (local dev, a plain `main` checkout) this is skipped.
   */
  express: (app) => {
    const dist = process.env.MOBILE_DIST_DIR ?? fileURLToPath(new URL("../../mobile/dist", import.meta.url));
    if (!existsSync(path.join(dist, "server"))) {
      console.warn(`web: no export at ${dist}; the app's pages and /api are not served`);
      return;
    }
    // The CommonJS build: expo-server's ESM build uses extensionless imports Node rejects.
    const { createRequestHandler } = createRequire(import.meta.url)("expo-server/adapter/express");
    const web = createRequestHandler({ build: path.join(dist, "server"), environment: process.env.NODE_ENV });
    app.use(express.static(path.join(dist, "client")));
    app.get("/", web);
    app.use(web);
  }
});

/**
 * Colyseus sets CORS on every HTTP response, the app's /api included, and by default reflects
 * any Origin with credentials allowed — which would let any site read a signed-in web player's
 * wallet. Only the web app's own origins (`WEB_ORIGINS`, comma-separated) are reflected; native
 * clients send no Origin. Development also allows the local and LAN hosts it is served on.
 */
const webOrigins = new Set(process.env.WEB_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean));
const devOrigin = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/;
matchMaker.controller.getCorsHeaders = (headers) => {
  const origin = headers.get("origin");
  const allowed = origin !== null &&
    (webOrigins.has(origin) || (process.env.NODE_ENV !== "production" && devOrigin.test(origin)));
  return { "Access-Control-Allow-Origin": allowed ? origin : "" };
};

export default server;

