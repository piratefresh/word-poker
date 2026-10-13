import "./finalization-registry-polyfill"; // must run before @colyseus/sdk evaluates
import { Client } from "@colyseus/sdk";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { authClient } from "@/auth/client/auth-client";

/** The Colyseus server runs on this port beside the Expo dev server. */
const GAME_SERVER_PORT = 2567;

/**
 * The game server is a separate process (Colyseus, on port 2567) from the dev server
 * that bundles the app. In development we reach it at the same host the device already
 * uses for the dev server — `hostUri` is that host as the device sees it, which keeps
 * physical devices working — just swapped to the game port. Production builds point
 * `EXPO_PUBLIC_GAME_URL` at the deployed server. Mirrors src/auth/client/auth-client.ts.
 */
function devGameURL(): string {
  // A browser reaches the game server wherever the page came from — a friend's phone on the LAN
  // opening an invite link (STO-581) included.
  const host =
    Platform.OS === "web" && typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `ws://${host}:${GAME_SERVER_PORT}` : `ws://localhost:${GAME_SERVER_PORT}`;
}

// `local` (set by `pnpm start:local`) overrides a cloud URL in .env without editing it.
const configuredURL = process.env.EXPO_PUBLIC_LOCAL_API === "1" ? "local" : process.env.EXPO_PUBLIC_GAME_URL;
const gameServerURL = configuredURL && configuredURL !== "local" ? configuredURL : devGameURL();

export const gameClient = new Client(gameServerURL);

/** Table credentials stay off the public lobby connection and are never persisted here. */
export const tableClient = new Client(gameServerURL);

export async function authenticateTableClient(): Promise<void> {
  tableClient.auth.token = "";
  const { data, error } = await authClient.getSession({ query: { disableCookieCache: true } });
  if (error || !data?.session.token) {
    throw Object.assign(new Error("Sign in to join an online table."), { code: 401 });
  }
  tableClient.auth.token = data.session.token;
}
