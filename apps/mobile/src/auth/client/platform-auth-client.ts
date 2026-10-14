/**
 * The client half of `auth/server/platform-auth.ts` (STO-593): typed calls to its endpoints, and a
 * session refresh after the two that can issue one. The session cookie itself is stored by
 * `expoClient` like any other sign-in; nothing here keeps a token.
 */

import type {
  GameCenterAuthRequest,
  PlatformAuthBeginRequest,
  PlatformAuthBeginResponse,
  PlatformAuthResult,
  PlayGamesAuthRequest,
} from "@wordpoker/contracts";
import type { BetterAuthClientPlugin } from "better-auth/client";

const SESSION_PATHS = new Set(["/platform-auth/game-center", "/platform-auth/play-games"]);

export const platformAuthClient = () =>
  ({
    id: "platform-auth",
    atomListeners: [{ matcher: (path) => SESSION_PATHS.has(path), signal: "$sessionSignal" }],
    getActions: ($fetch) => ({
      platformAuth: {
        begin: (body: PlatformAuthBeginRequest) =>
          $fetch<PlatformAuthBeginResponse>("/platform-auth/begin", { method: "POST", body }),
        gameCenter: (body: GameCenterAuthRequest, headers?: Record<string, string>) =>
          $fetch<PlatformAuthResult>("/platform-auth/game-center", { method: "POST", body, headers }),
        playGames: (body: PlayGamesAuthRequest) =>
          $fetch<PlatformAuthResult>("/platform-auth/play-games", { method: "POST", body }),
      },
    }),
  }) satisfies BetterAuthClientPlugin;
