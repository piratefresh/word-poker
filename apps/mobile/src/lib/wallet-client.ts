/**
 * wallet-client.ts — the app's reads of the Wallet and the coin catalog (STO-346).
 *
 * Both are Expo API routes on `apiBaseURL`. The balance needs the session: on native, Better Auth's
 * Expo client keeps the cookie in SecureStore and hands it over as a `cookie` header (with
 * `credentials: "omit"`, so a platform cookie jar cannot add a second one); on the web the browser
 * sends its own cookie with `credentials: "include"`.
 */

import { isCoinCatalog, isWalletResponse, type CoinCatalog, type WalletResponse } from "@wordpoker/contracts";
import { Platform } from "react-native";

import { apiBaseURL } from "@/lib/api-base-url";
import { authClient } from "@/auth/client/auth-client";

/** The route answered 401: no session, or an expired one. */
export class WalletAuthError extends Error {
  constructor() {
    super("Sign in to top up.");
    this.name = "WalletAuthError";
  }
}

function sessionInit(): RequestInit {
  if (Platform.OS === "web") return { credentials: "include" };
  const cookie = authClient.getCookie();

  return { credentials: "omit", headers: cookie ? { cookie } : {} };
}

/** The server's own sentence when it sent one, else the status. */
async function failure(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error.length > 0) return new Error(body.error);
  } catch {
    // Not JSON: the status below says what there is to say.
  }

  return new Error(`The coin store could not be reached (HTTP ${response.status}).`);
}

/** The signed-in player's coins, and whether their welcome is claimed. Rejects with `WalletAuthError` on a 401. */
export async function fetchWallet(): Promise<WalletResponse> {
  const response = await fetch(`${apiBaseURL}/api/wallet`, sessionInit());
  if (response.status === 401) throw new WalletAuthError();
  if (!response.ok) throw await failure(response);

  const body: unknown = await response.json();
  if (!isWalletResponse(body)) throw new Error("The coin store sent a balance it could not read.");

  return body;
}

/** The packs the store sells, each with the coins RevenueCat grants for it. */
export async function fetchCoinCatalog(): Promise<CoinCatalog> {
  const response = await fetch(`${apiBaseURL}/api/store-catalog`);
  if (!response.ok) throw await failure(response);

  const body: unknown = await response.json();
  if (!isCoinCatalog(body)) throw new Error("The coin store sent a catalog it could not read.");

  return body;
}
