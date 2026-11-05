/**
 * tile-sets+api.ts — the tile sets a signed-in player owns and wears, and buying them (STO-1045).
 *
 * Conventions of `wallet+api.ts`: the session comes from Better Auth and a guest has no Wallet. The
 * price is the server's (`TILE_SET_PRICES`), never the client's: a request names only the set. A
 * purchase takes its coins through `@wordpoker/economy`, which logs it in `wallet_event` and lets
 * RevenueCat refuse an overdraw, so nothing is taken when the player is short.
 */

import { isTileSetRequest, type TileSetRefusal, type TileSetsResponse } from "@wordpoker/contracts";
import { buyTileSet, equipTileSet, readTileSets } from "@wordpoker/economy";

import { auth } from "@/auth/server/auth";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const REFUSALS: Record<TileSetRefusal, { status: number; error: string }> = {
  insufficient_coins: { status: 402, error: "You don't have enough coins for that set." },
  not_owned: { status: 409, error: "Buy that set before you equip it." },
  pending: { status: 202, error: "Your purchase is going through. Check back in a moment." },
};

async function signedInUser(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });

  return session && !session.user.isAnonymous ? session.user.id : null;
}

/** `200 { owned, equipped }`, `401` without a session or for a guest, `502` when it cannot be read. */
export async function GET(request: Request): Promise<Response> {
  const userId = await signedInUser(request);
  if (!userId) return json({ error: "Sign in to see your tile sets." }, 401);

  try {
    const body: TileSetsResponse = await readTileSets(userId);

    return json(body, 200);
  } catch (error) {
    console.error(`[tile-sets] ${userId}: could not read tile sets:`, error);

    return json({ error: "Your tile sets could not be read." }, 502);
  }
}

/**
 * `{ action: "buy" | "equip", tileSet }`. `200` the new state (a buy that took coins adds `coins`),
 * `202` a purchase still settling, `400` an unreadable body, `401` as `GET`, `402` short of coins,
 * `409` an equip of a set not owned, `502` when the Wallet or the database failed.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = await signedInUser(request);
  if (!userId) return json({ error: "Sign in to buy tile sets." }, 401);

  const body: unknown = await request.json().catch(() => null);
  if (!isTileSetRequest(body)) return json({ error: "That request could not be read." }, 400);

  try {
    const outcome =
      body.action === "buy" ? await buyTileSet(userId, body.tileSet) : await equipTileSet(userId, body.tileSet);
    if (outcome.ok) return json(outcome.state, 200);

    const refusal = REFUSALS[outcome.reason];

    return json({ error: refusal.error, reason: outcome.reason }, refusal.status);
  } catch (error) {
    console.error(`[tile-sets] ${userId}: could not ${body.action} ${body.tileSet}:`, error);

    return json({ error: "The store could not be reached." }, 502);
  }
}
