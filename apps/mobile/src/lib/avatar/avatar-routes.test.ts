/**
 * The avatar route (STO-1050): who may upload, what it refuses before anything reaches R2, and the
 * order of a replace — save the new photo, point the account at it, then drop the old one.
 */

import { DELETE, POST } from "@/app/api/avatar+api";
import { auth } from "@/auth/server/auth";
import { avatarStore } from "@/auth/server/avatar-store";

const mockUpdateUser = jest.fn();
jest.mock("@/auth/server/auth", () => ({
  auth: { api: { getSession: jest.fn() }, $context: Promise.resolve({ internalAdapter: { updateUser: (...args: unknown[]) => mockUpdateUser(...args) } }) },
}));
jest.mock("@/auth/server/avatar-store", () => ({ avatarStore: jest.fn() }));

const getSession = jest.mocked(auth.api.getSession) as unknown as jest.Mock;
const store = { put: jest.fn(), deleteAll: jest.fn() };

const ACCOUNT = { user: { id: "user_1", isAnonymous: false }, session: {} };
const GUEST = { user: { id: "guest_1", isAnonymous: true }, session: {} };

/** SOI, then a baseline frame header for a `side`×`side` JPEG. */
function jpeg(side: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, side >> 8, side & 0xff, side >> 8, side & 0xff, 0x03]);
}

function upload(bytes?: Uint8Array): Request {
  return new Request("http://localhost:8081/api/avatar", {
    method: "POST",
    headers: { cookie: "session=1", "content-type": "image/jpeg" },
    ...(bytes ? { body: bytes as unknown as BodyInit } : {}),
  });
}

const remove = () => new Request("http://localhost:8081/api/avatar", { method: "DELETE", headers: { cookie: "session=1" } });

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(avatarStore).mockReturnValue(store);
  store.put.mockResolvedValue({ key: "avatars/user_1/2.jpg", url: "https://cdn.test/avatars/user_1/2.jpg" });
  store.deleteAll.mockResolvedValue(undefined);
  mockUpdateUser.mockResolvedValue({});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/avatar", () => {
  test("refuses signed-out requests and guests", async () => {
    getSession.mockResolvedValue(null);
    expect((await POST(upload(jpeg(256)))).status).toBe(401);

    getSession.mockResolvedValue(GUEST);
    expect((await POST(upload(jpeg(256)))).status).toBe(403);
    expect(store.put).not.toHaveBeenCalled();
  });

  test("refuses a missing file, a non-image and a non-square without touching R2", async () => {
    getSession.mockResolvedValue(ACCOUNT);

    expect((await POST(upload())).status).toBe(400);
    expect((await POST(upload(new TextEncoder().encode("not a photo")))).status).toBe(415);
    const wide = jpeg(256);
    wide[8] = 0x80; // width 0x0180 = 384
    expect((await POST(upload(wide))).status).toBe(415);
    expect(store.put).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test("refuses a file over the limit", async () => {
    getSession.mockResolvedValue(ACCOUNT);
    const big = new Uint8Array(600 * 1024);
    big.set(jpeg(256));

    expect((await POST(upload(big))).status).toBe(413);
    expect(store.put).not.toHaveBeenCalled();
  });

  test("saves the photo, points the account at it, then deletes the old one", async () => {
    getSession.mockResolvedValue(ACCOUNT);
    const order: string[] = [];
    store.put.mockImplementation(async () => {
      order.push("put");
      return { key: "avatars/user_1/2.jpg", url: "https://cdn.test/avatars/user_1/2.jpg" };
    });
    mockUpdateUser.mockImplementation(async () => { order.push("update"); });
    store.deleteAll.mockImplementation(async () => { order.push("delete"); });

    const response = await POST(upload(jpeg(256)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ image: "https://cdn.test/avatars/user_1/2.jpg" });
    expect(order).toEqual(["put", "update", "delete"]);
    expect(store.put).toHaveBeenCalledWith("user_1", expect.any(Uint8Array), "image/jpeg");
    expect(mockUpdateUser).toHaveBeenCalledWith("user_1", { image: "https://cdn.test/avatars/user_1/2.jpg" });
    expect(store.deleteAll).toHaveBeenCalledWith("user_1", "avatars/user_1/2.jpg");
  });

  test("keeps the old photo when the account can't be updated", async () => {
    getSession.mockResolvedValue(ACCOUNT);
    mockUpdateUser.mockRejectedValue(new Error("db down"));

    expect((await POST(upload(jpeg(256)))).status).toBe(502);
    expect(store.deleteAll).not.toHaveBeenCalled();
  });

  test("answers 503 when no bucket is configured", async () => {
    getSession.mockResolvedValue(ACCOUNT);
    jest.mocked(avatarStore).mockReturnValue(null);

    expect((await POST(upload(jpeg(256)))).status).toBe(503);
  });
});

describe("DELETE /api/avatar", () => {
  test("refuses guests", async () => {
    getSession.mockResolvedValue(GUEST);
    expect((await DELETE(remove())).status).toBe(403);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test("clears the account's image, then empties its folder in the bucket", async () => {
    getSession.mockResolvedValue(ACCOUNT);

    const response = await DELETE(remove());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ image: null });
    expect(mockUpdateUser).toHaveBeenCalledWith("user_1", { image: null });
    expect(store.deleteAll).toHaveBeenCalledWith("user_1");
  });

  test("still answers 200 when R2 fails; the next change clears the leftover", async () => {
    getSession.mockResolvedValue(ACCOUNT);
    store.deleteAll.mockRejectedValue(new Error("r2 down"));

    expect((await DELETE(remove())).status).toBe(200);
  });
});
