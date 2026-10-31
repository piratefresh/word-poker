/**
 * revenuecat.ts — the thin client for RevenueCat's Developer API v2 (STO-346).
 *
 * RevenueCat ships no Node SDK, and the in-app SDK cannot add or remove currency, so the server
 * speaks the REST API itself. Only the calls the Wallet needs live here: read a balance, adjust
 * it, read which products grant how many coins, and delete a customer with their account.
 *
 * Errors carry an HTTP status and RevenueCat's error `type`, never a response body: a caller logs
 * them and stores a short code, so nothing RevenueCat says reaches a player or the database.
 */

import { COIN_CURRENCY } from "@wordpoker/contracts";

const API_ORIGIN = "https://api.revenuecat.com/v2";

/** The longest `Retry-After` a 429 is waited out for; anything longer is a failure now. */
const MAX_RETRY_AFTER_MS = 5_000;

/** `REVENUECAT_PROJECT_ID` or `REVENUECAT_SECRET_API_KEY` is unset. */
export class EconomyNotConfiguredError extends Error {
  constructor() {
    super("RevenueCat is not configured (REVENUECAT_PROJECT_ID / REVENUECAT_SECRET_API_KEY).");
    this.name = "EconomyNotConfiguredError";
  }
}

/** RevenueCat answered with a non-2xx status (or `status: 0` when it could not be reached). */
export class RevenueCatError extends Error {
  readonly status: number;
  /** RevenueCat's error `type` (`resource_missing`, `rate_limit_error`, …) when it sent one. */
  readonly type: string | undefined;

  constructor(status: number, type?: string) {
    super(status === 0 ? "RevenueCat could not be reached." : `RevenueCat answered ${status}${type ? ` (${type})` : ""}.`);
    this.name = "RevenueCatError";
    this.status = status;
    this.type = type;
  }
}

/** A spend RevenueCat refused because the balance would go below zero (HTTP 422). */
export class InsufficientCoinsError extends RevenueCatError {
  constructor(type?: string) {
    super(422, type);
    this.name = "InsufficientCoinsError";
  }
}

/** One pack RevenueCat grants coins for, keyed by its store product id. */
export interface CoinGrant {
  readonly storeProductId: string;
  readonly coins: number;
}

export interface RevenueCatClient {
  /** The customer's `COIN` balance; 0 when they hold none (or RevenueCat has never seen them). */
  getCoinBalance(userId: string): Promise<number>;
  /**
   * Adds `amount` (negative to spend) and resolves with the new balance. `idempotencyKey` makes a
   * retry of the same change apply at most once.
   */
  adjustCoins(userId: string, amount: number, idempotencyKey: string): Promise<number>;
  /** Every store product that grants `COIN`, with the amount it grants. */
  listCoinGrants(): Promise<CoinGrant[]>;
  /** Queues the customer's deletion; one RevenueCat has never seen is already gone. */
  deleteCustomer(userId: string): Promise<void>;
}

export interface RevenueCatClientOptions {
  readonly projectId: string;
  readonly secretKey: string;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface RequestInit {
  readonly method?: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

interface Page<T> {
  readonly items: readonly T[];
  readonly next_page?: string | null;
}

interface BalanceItem {
  readonly currency_code: string;
  readonly balance: number;
}

interface ProductGrant {
  readonly product_ids: readonly string[];
  readonly amount: number;
}

interface Product {
  readonly id: string;
  readonly store_identifier: string;
  readonly state?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coinBalance(page: unknown): number {
  if (!isRecord(page) || !Array.isArray(page.items)) throw new RevenueCatError(200, "unreadable_body");
  // RevenueCat leaves zero balances out of the list unless asked, so an absent COIN is 0.
  const item = (page.items as BalanceItem[]).find((entry) => entry?.currency_code === COIN_CURRENCY);

  return typeof item?.balance === "number" ? item.balance : 0;
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));

  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000;
}

async function errorType(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();

    return isRecord(body) && typeof body.type === "string" ? body.type : undefined;
  } catch {
    return undefined;
  }
}

export function createRevenueCatClient(options: RevenueCatClientOptions): RevenueCatClient {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const base = `${API_ORIGIN}/projects/${encodeURIComponent(options.projectId)}`;

  async function send(path: string, init: RequestInit, retried = false): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.secretKey}`,
      Accept: "application/json",
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

    let response: Response;
    try {
      response = await fetchImpl(path.startsWith("/v2/") ? `${API_ORIGIN}${path.slice(3)}` : `${base}${path}`, {
        method: init.method ?? "GET",
        headers,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
    } catch {
      throw new RevenueCatError(0);
    }

    if (response.status === 429 && !retried) {
      const wait = retryAfterMs(response);
      if (wait <= MAX_RETRY_AFTER_MS) {
        await sleep(wait);

        return send(path, init, true);
      }
    }

    if (!response.ok) {
      const type = await errorType(response);
      if (response.status === 422 && (type === undefined || type === "unprocessable_entity_error")) {
        throw new InsufficientCoinsError(type);
      }
      throw new RevenueCatError(response.status, type);
    }

    return response.json();
  }

  async function listAll<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | null | undefined = path;
    while (next) {
      const page = (await send(next, {})) as Page<T>;
      if (!isRecord(page) || !Array.isArray(page.items)) throw new RevenueCatError(200, "unreadable_body");
      items.push(...page.items);
      next = page.next_page;
    }

    return items;
  }

  const customerPath = (userId: string) => `/customers/${encodeURIComponent(userId)}`;

  return {
    async getCoinBalance(userId) {
      try {
        return coinBalance(await send(`${customerPath(userId)}/virtual_currencies`, {}));
      } catch (error) {
        // A customer RevenueCat has never seen holds nothing.
        if (error instanceof RevenueCatError && error.status === 404) return 0;
        throw error;
      }
    },

    async adjustCoins(userId, amount, idempotencyKey) {
      const transaction = () =>
        send(`${customerPath(userId)}/virtual_currencies/transactions`, {
          method: "POST",
          body: { adjustments: { [COIN_CURRENCY]: amount } },
          idempotencyKey,
        });

      try {
        return coinBalance(await transaction());
      } catch (error) {
        if (!(error instanceof RevenueCatError) || error.status !== 404) throw error;
      }

      // RevenueCat does not document whether a deposit reaches a customer it has never seen. If it
      // answers 404, create the customer (a 409 means a racing request already did) and send the
      // same transaction, under the same key, once more.
      try {
        await send("/customers", { method: "POST", body: { id: userId } });
      } catch (error) {
        if (!(error instanceof RevenueCatError) || error.status !== 409) throw error;
      }

      return coinBalance(await transaction());
    },

    async listCoinGrants() {
      const currency = await send(`/virtual_currencies/${COIN_CURRENCY}`, {});
      const grants = (isRecord(currency) && Array.isArray(currency.product_grants)
        ? currency.product_grants
        : []) as ProductGrant[];
      if (grants.length === 0) return [];

      const products = await listAll<Product>("/products?limit=100");
      const storeIdById = new Map(
        products
          .filter((product) => product.state === undefined || product.state === "active")
          .map((product) => [product.id, product.store_identifier]),
      );

      // One store product can be listed once per app (App Store, Play, Test Store): keep the first.
      const byStoreId = new Map<string, number>();
      for (const grant of grants) {
        if (typeof grant.amount !== "number" || grant.amount <= 0) continue;
        for (const productId of grant.product_ids ?? []) {
          const storeProductId = storeIdById.get(productId);
          if (storeProductId && !byStoreId.has(storeProductId)) byStoreId.set(storeProductId, grant.amount);
        }
      }

      return [...byStoreId].map(([storeProductId, coins]) => ({ storeProductId, coins }));
    },

    async deleteCustomer(userId) {
      try {
        await send(customerPath(userId), { method: "DELETE" });
      } catch (error) {
        if (!(error instanceof RevenueCatError) || error.status !== 404) throw error;
      }
    },
  };
}

let fromEnv: RevenueCatClient | undefined;

/** The process's client, built from `REVENUECAT_PROJECT_ID` and `REVENUECAT_SECRET_API_KEY`. */
export function revenueCat(): RevenueCatClient {
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  const secretKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!projectId || !secretKey) throw new EconomyNotConfiguredError();

  fromEnv ??= createRevenueCatClient({ projectId, secretKey });

  return fromEnv;
}
