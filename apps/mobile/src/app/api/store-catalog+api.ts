/**
 * store-catalog+api.ts — the packs the coin store sells, with the coins each grants (STO-346).
 *
 * The amounts are RevenueCat dashboard data (each product's grant), so the app never ships one. No
 * session is needed: the catalog is the same for everyone.
 */

import { coinCatalog } from "@wordpoker/economy";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** `200` with the `CoinCatalog`, or `502` when RevenueCat cannot be read. */
export async function GET(): Promise<Response> {
  try {
    return json(await coinCatalog(), 200);
  } catch (error) {
    console.error("[store-catalog] could not read the catalog:", error);

    return json({ error: "The coin store could not be reached." }, 502);
  }
}
