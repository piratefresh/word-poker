/**
 * wallet-client.ts — the app's reads of the Wallet and the coin catalog (STO-346).
 *
 * Both are Expo API routes on `apiBaseURL`. The balance needs the session: on native, Better Auth's
 * Expo client keeps the cookie in SecureStore and hands it over as a `cookie` header (with
 * `credentials: "omit"`, so a platform cookie jar cannot add a second one); on the web the browser
 * sends its own cookie with `credentials: "include"`.
 */

import {
  isAdRewardsResponse,
  isCoinCatalog,
  isQuestClaimResponse,
  isQuestStateResponse,
  isTileSetsResponse,
  isWalletResponse,
  type CoinCatalog,
  type QuestClaimResponse,
  type QuestHandClaim,
  type QuestStateResponse,
  type TileSetRefusal,
  type TileSetRequest,
  type TileSetsResponse,
  type WalletResponse,
} from "@wordpoker/contracts";
import { Platform } from "react-native";

import { apiBaseURL } from "@/lib/network/api-base-url";
import { authClient } from "@/auth/client/auth-client";

/** The route answered 401: no session, or an expired one. */
export class WalletAuthError extends Error {
  constructor() {
    super("Sign in to top up.");
    this.name = "WalletAuthError";
  }
}

/** The route answered 403: signed in, but the player has not verified their email yet. */
export class WalletUnverifiedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletUnverifiedError";
  }
}

/** The route answered 400: a claim it could not read, which no retry will fix. */
export class QuestClaimRejectedError extends Error {
  constructor() {
    super("That claim could not be read.");
    this.name = "QuestClaimRejectedError";
  }
}

export async function sessionInit(): Promise<RequestInit> {
  if (Platform.OS === "web") return { credentials: "include" };
  const cookie = await authClient.getCookie();

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
  const response = await fetch(`${apiBaseURL}/api/wallet`, await sessionInit());
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

/** How many rewarded ads the player can still be paid for today (STO-1062). */
export async function fetchAdRewardsLeft(): Promise<number> {
  const response = await fetch(`${apiBaseURL}/api/ad-rewards`, await sessionInit());
  if (response.status === 401) throw new WalletAuthError();
  if (!response.ok) throw await questFailure(response);

  const body: unknown = await response.json();
  if (!isAdRewardsResponse(body)) throw new Error("The ad count could not be read.");

  return body.left;
}

/** The server's own sentence for a 403 (quests needs a verified email), else a generic one. */
async function questFailure(response: Response): Promise<Error> {
  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    return new WalletUnverifiedError(
      typeof body?.error === "string" && body.error.length > 0 ? body.error : "Verify your email to earn coins.",
    );
  }

  return failure(response);
}

/** The signed-in player's streak and quest progress. Rejects with `WalletAuthError`/`WalletUnverifiedError`. */
export async function fetchQuestState(): Promise<QuestStateResponse> {
  const response = await fetch(`${apiBaseURL}/api/quests`, await sessionInit());
  if (response.status === 401) throw new WalletAuthError();
  if (!response.ok) throw await questFailure(response);

  const body: unknown = await response.json();
  if (!isQuestStateResponse(body)) throw new Error("Quests sent a state it could not read.");

  return body;
}

/** Reports one settled hand's quest facts, once per `handToken` — a retry is safe. */
export async function sendQuestHandClaim(claim: QuestHandClaim): Promise<QuestClaimResponse> {
  const init = await sessionInit();
  const response = await fetch(`${apiBaseURL}/api/quests`, {
    ...init,
    method: "POST",
    headers: { ...init.headers, "content-type": "application/json" },
    body: JSON.stringify(claim),
  });
  if (response.status === 401) throw new WalletAuthError();
  if (response.status === 400) throw new QuestClaimRejectedError();
  if (!response.ok) throw await questFailure(response);

  const body: unknown = await response.json();
  if (!isQuestClaimResponse(body)) throw new Error("The claim's result could not be read.");

  return body;
}

/** The signed-in player's tile sets (STO-1045). Rejects with `WalletAuthError` on a 401. */
export async function fetchTileSets(): Promise<TileSetsResponse> {
  const response = await fetch(`${apiBaseURL}/api/tile-sets`, await sessionInit());
  if (response.status === 401) throw new WalletAuthError();
  if (!response.ok) throw await failure(response);

  const body: unknown = await response.json();
  if (!isTileSetsResponse(body)) throw new Error("The store sent tile sets it could not read.");

  return body;
}

/** How a buy or equip came out: the new state, or the server's reason for changing nothing. */
export type TileSetResult =
  | { readonly ok: true; readonly state: TileSetsResponse }
  | { readonly ok: false; readonly reason: TileSetRefusal; readonly message: string };

const REFUSAL_STATUS: Readonly<Record<number, TileSetRefusal>> = { 202: "pending", 402: "insufficient_coins", 409: "not_owned" };

/**
 * Buys or equips a set. A refusal the player can act on resolves; anything else (a 401, a 400, a
 * failed Wallet) rejects.
 */
export async function sendTileSetRequest(request: TileSetRequest): Promise<TileSetResult> {
  const init = await sessionInit();
  const response = await fetch(`${apiBaseURL}/api/tile-sets`, {
    ...init,
    method: "POST",
    headers: { ...init.headers, "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (response.status === 401) throw new WalletAuthError();

  const refusal = REFUSAL_STATUS[response.status];
  if (refusal) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof body?.error === "string" ? body.error : "The store changed nothing.";

    return { ok: false, reason: refusal, message };
  }
  if (!response.ok) throw await failure(response);

  const body: unknown = await response.json();
  if (!isTileSetsResponse(body)) throw new Error("The store sent tile sets it could not read.");

  return { ok: true, state: body };
}
