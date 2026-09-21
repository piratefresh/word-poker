import {
  defineServer,
  defineRoom,
  monitor,
  playground,
  createRouter,
  createEndpoint,
  LobbyRoom,
} from "colyseus";
import { GAME_ROOM_NAME, LOBBY_ROOM_NAME } from "@wordpoker/contracts";

/**
 * Import your Room files
 */
import { GameRoom } from "./rooms/GameRoom.js";

/**
 * The listable table. `enableRealtimeListing()` is what makes Colyseus push this room's joins,
 * leaves, locks and metadata changes to lobby subscribers — without it a listing only ever
 * changes when a client asks for it again, and the lobby's seat counts would sit still.
 */
const game = defineRoom(GameRoom).enableRealtimeListing();

const server = defineServer({

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
  }),

  /**
   * Bind your custom express routes here:
   * Read more: https://expressjs.com/en/starter/basic-routing.html
   */
  express: (app) => {

    app.get("/hi", (req, res) => {
      res.send("It's time to kick ass and chew bubblegum!");
    });

    /**
     * Use @colyseus/monitor
     * If you expose it in production, make sure to protect it with a password:
     * https://docs.colyseus.io/tools/monitoring#password-protection
     */
    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
    }

    /**
     * Use @colyseus/playground
     * (It is not recommended to expose this route in a production environment)
     * Available at http://localhost:2567/playground
     */
    if (process.env.NODE_ENV !== "production") {
      app.use("/playground", playground());
    }
  }
});

export default server;

