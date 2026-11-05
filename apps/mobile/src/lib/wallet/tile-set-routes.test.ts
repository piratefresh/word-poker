/**
 * `/api/tile-sets` (STO-1045): the session gate, the request shape, and how each economy outcome
 * becomes a status. `@wordpoker/economy` is the seam; its own suite judges buying and equipping.
 */

import { buyTileSet, equipTileSet, readTileSets } from "@wordpoker/economy";

import { GET, POST } from "@/app/api/tile-sets+api";
import { auth } from "@/auth/server/auth";

jest.mock("@/auth/server/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@wordpoker/economy", () => ({ buyTileSet: jest.fn(), equipTileSet: jest.fn(), readTileSets: jest.fn() }));

const getSession = jest.mocked(auth.api.getSession) as unknown as jest.Mock;
const buy = jest.mocked(buyTileSet);
const equip = jest.mocked(equipTileSet);
const read = jest.mocked(readTileSets);

const signedIn = () => getSession.mockResolvedValue({ user: { id: "u1", isAnonymous: false } });

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const get = () => new Request("http://localhost:8081/api/tile-sets", { headers: { cookie: "session=1" } });
const post = (body: unknown) =>
  new Request("http://localhost:8081/api/tile-sets", {
    method: "POST",
    headers: { cookie: "session=1", "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("GET /api/tile-sets", () => {
  test("refuses without a session, and a guest", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    getSession.mockResolvedValue({ user: { id: "g1", isAnonymous: true } });
    expect((await GET(get())).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  test("answers what the player owns and wears", async () => {
    signedIn();
    read.mockResolvedValue({ owned: ["ivory", "jade"], equipped: "jade" });

    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ owned: ["ivory", "jade"], equipped: "jade" });
    expect(read).toHaveBeenCalledWith("u1");
  });

  test("answers 502 when the read fails", async () => {
    signedIn();
    read.mockRejectedValue(new Error("db down"));
    const response = await GET(get());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("db down");
  });
});

describe("POST /api/tile-sets", () => {
  test("refuses without a session", async () => {
    getSession.mockResolvedValue(null);
    expect((await POST(post({ action: "buy", tileSet: "jade" }))).status).toBe(401);
    expect(buy).not.toHaveBeenCalled();
  });

  test("refuses a body it cannot read, or a price the client sends", async () => {
    signedIn();
    expect((await POST(post("not json"))).status).toBe(400);
    expect((await POST(post({ action: "buy", tileSet: "gold" }))).status).toBe(400);
    expect(buy).not.toHaveBeenCalled();
  });

  test("buys with the server's price and answers the new state with the balance", async () => {
    signedIn();
    buy.mockResolvedValue({ ok: true, state: { owned: ["ivory", "midnight"], equipped: "midnight", coins: 4775 } });

    const response = await POST(post({ action: "buy", tileSet: "midnight", price: 1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ owned: ["ivory", "midnight"], equipped: "midnight", coins: 4775 });
    expect(buy).toHaveBeenCalledWith("u1", "midnight");
  });

  test("equips", async () => {
    signedIn();
    equip.mockResolvedValue({ ok: true, state: { owned: ["ivory", "jade"], equipped: "ivory" } });
    expect((await POST(post({ action: "equip", tileSet: "ivory" }))).status).toBe(200);
    expect(equip).toHaveBeenCalledWith("u1", "ivory");
  });

  test.each([
    ["insufficient_coins", 402],
    ["not_owned", 409],
    ["pending", 202],
  ] as const)("answers a %s refusal with %i and its reason", async (reason, status) => {
    signedIn();
    buy.mockResolvedValue({ ok: false, reason });
    const response = await POST(post({ action: "buy", tileSet: "neon-alley" }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ reason });
  });

  test("answers 502 when the Wallet rejects the purchase outright", async () => {
    signedIn();
    buy.mockRejectedValue(new Error("rejected"));
    expect((await POST(post({ action: "buy", tileSet: "jade" }))).status).toBe(502);
  });
});
