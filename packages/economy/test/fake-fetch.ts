/**
 * fake-fetch.ts — a scripted `fetch` that records every request it is handed.
 */

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | "network";

export interface FakeFetch {
  readonly fetch: typeof fetch;
  readonly requests: RecordedRequest[];
}

/** Answers each request with the next scripted reply; running out is a test failure. */
export function fakeFetch(replies: Reply[]): FakeFetch {
  const requests: RecordedRequest[] = [];
  const queue = [...replies];

  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });

    const reply = queue.shift();
    if (!reply) throw new Error(`fakeFetch: no reply scripted for ${String(input)}`);
    if (reply === "network") throw new TypeError("fetch failed");

    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  };

  return { fetch: impl as typeof fetch, requests };
}

export const balances = (coins: number | null) => ({
  status: 200,
  body: {
    object: "list",
    items: coins === null ? [] : [{ object: "virtual_currency_balance", currency_code: "COIN", balance: coins }],
    next_page: null,
    url: "/v2/projects/proj1/customers/u/virtual_currencies",
  },
});

export const rcError = (status: number, type: string) => ({
  status,
  body: { object: "error", type, message: "…", retryable: status >= 500 },
});
