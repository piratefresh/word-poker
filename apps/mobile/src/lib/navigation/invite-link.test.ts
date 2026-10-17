import { inviteLinkFor } from "./invite-link";
import { destinationFromURL, referralFromURL } from "./pending-destination";

afterEach(() => {
  delete process.env.EXPO_PUBLIC_WEB_URL;
});

describe("an invite link", () => {
  test("is the configured web app's lobby, naming the table", () => {
    process.env.EXPO_PUBLIC_WEB_URL = "https://play.wordpoker.dev//";
    expect(inviteLinkFor("abc123")).toBe("https://play.wordpoker.dev/online?room=abc123");
  });

  test("lands the friend at the same table it names", () => {
    // The link is only useful if the arrival path reads it back as this table, reserved characters and all.
    for (const roomId of ["7f3aQ1", "a b&c"]) {
      expect(destinationFromURL(inviteLinkFor(roomId))).toEqual({
        pathname: "/online/[roomId]",
        params: { roomId },
      });
    }
  });
});

describe("an invite link's referral", () => {
  test("carries the sharer's friend code, and reads back as the same table and referrer", () => {
    const link = inviteLinkFor("abc123", "ABCD2345");
    expect(link).toMatch(/\?room=abc123&ref=ABCD2345$/);
    expect(referralFromURL(link)).toBe("ABCD2345");
    expect(destinationFromURL(link)).toEqual({ pathname: "/online/[roomId]", params: { roomId: "abc123" } });
    expect(inviteLinkFor("abc123")).not.toContain("ref=");
  });
});
