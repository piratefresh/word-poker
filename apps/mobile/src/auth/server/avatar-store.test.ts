/**
 * The R2 avatar store (STO-1050) against a stubbed `fetch`: where it puts a photo, the cache header
 * it serves with, and that clean-up lists the player's folder and keeps only the photo asked for.
 */

import { avatarStore } from "./avatar-store";

const ENV = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_AVATAR_BUCKET: "avatars-test",
  R2_PUBLIC_URL: "https://cdn.test/",
} as unknown as NodeJS.ProcessEnv;
const BUCKET = "https://acct.r2.cloudflarestorage.com/avatars-test";

let calls: Request[];
beforeEach(() => {
  calls = [];
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    calls.push(request);
    const body = request.method === "GET"
      ? "<ListBucketResult><Contents><Key>avatars/user_1/1.jpg</Key></Contents><Contents><Key>avatars/user_1/2.jpg</Key></Contents></ListBucketResult>"
      : "";
    return new Response(body, { status: 200 });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("is off without the bucket's settings", () => {
  expect(avatarStore({ ...ENV, R2_PUBLIC_URL: "" })).toBeNull();
});

test("puts a photo under a new key in the player's folder, cached for a year", async () => {
  jest.spyOn(Date, "now").mockReturnValue(42);

  const saved = await avatarStore(ENV)!.put("user_1", new Uint8Array([1, 2, 3]), "image/png");

  expect(saved).toEqual({ key: "avatars/user_1/42.png", url: "https://cdn.test/avatars/user_1/42.png" });
  expect(calls[0].method).toBe("PUT");
  expect(calls[0].url).toBe(`${BUCKET}/avatars/user_1/42.png`);
  expect(calls[0].headers.get("content-type")).toBe("image/png");
  expect(calls[0].headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect(calls[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
});

test("deletes every photo in the player's folder but the one to keep", async () => {
  await avatarStore(ENV)!.deleteAll("user_1", "avatars/user_1/2.jpg");

  expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
    `GET ${BUCKET}?list-type=2&prefix=avatars%2Fuser_1%2F`,
    `DELETE ${BUCKET}/avatars/user_1/1.jpg`,
  ]);
});

test("throws when R2 refuses", async () => {
  jest.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 403 }));

  await expect(avatarStore(ENV)!.put("user_1", new Uint8Array([1]), "image/jpeg")).rejects.toThrow("R2 PUT answered 403");
});
