import { destinationFromURL, pendingReferral, referralFromURL, rememberDestination, rememberReferral, takeDestination } from "./pending-destination";

describe("a link's destination", () => {
  test("holds web and native friend links as an explicit add card", () => {
    for (const url of ["https://play.wordpoker.dev/friend/ABCD2345", "wordpoker://friend/ABCD2345", "wordpoker:///friend/ABCD2345"]) {
      expect(destinationFromURL(url)).toEqual({ pathname: "/friends", params: { add: "ABCD2345" } });
    }
    expect(destinationFromURL("wordpoker://friend/ABCI2345")).toBeNull();
    expect(destinationFromURL("https://play.wordpoker.dev/friend/ABCD2345/extra")).toBeNull();
  });
  test("is the table a lobby link names", () => {
    expect(destinationFromURL("wordpoker://online?room=abc123")).toEqual({
      pathname: "/online/[roomId]",
      params: { roomId: "abc123" },
    });
  });

  test("is the lobby when the link names no table", () => {
    // §3's lobby is a screen of its own: a link without a table still means somewhere to land.
    expect(destinationFromURL("wordpoker://online")).toEqual({ pathname: "/online" });
    expect(destinationFromURL("wordpoker://online?room=")).toEqual({ pathname: "/online" });
  });

  test("reads the web build's own URLs the same way", () => {
    expect(destinationFromURL("https://play.wordpoker.dev/online?room=abc123")).toEqual({
      pathname: "/online/[roomId]",
      params: { roomId: "abc123" },
    });
    expect(destinationFromURL("http://localhost:8081/online")).toEqual({ pathname: "/online" });
  });

  test("reads a table out of the path, which is the form the app writes itself", () => {
    // `/online/<roomId>` is where `router.push` to the seated screen leaves the address bar, so
    // this is the URL a reload, a bookmark and a shared link arrive as.
    expect(destinationFromURL("http://localhost:8081/online/7f3aQ1")).toEqual({
      pathname: "/online/[roomId]",
      params: { roomId: "7f3aQ1" },
    });
    expect(destinationFromURL("https://play.wordpoker.dev/online/7f3aQ1")).toEqual({
      pathname: "/online/[roomId]",
      params: { roomId: "7f3aQ1" },
    });
    expect(destinationFromURL("wordpoker://online/7f3aQ1")).toEqual({
      pathname: "/online/[roomId]",
      params: { roomId: "7f3aQ1" },
    });
    // Either form may name no table at all, and then the link is still the lobby.
    expect(destinationFromURL("http://localhost:8081/online/")).toEqual({ pathname: "/online" });
    expect(destinationFromURL("wordpoker://online/")).toEqual({ pathname: "/online" });
  });

  test("takes the table out of a longer query, however it was escaped", () => {
    expect(destinationFromURL("wordpoker://online?ref=slack&room=abc%20123")).toEqual({
      pathname: "/online/[roomId]",
      params: { roomId: "abc 123" },
    });
  });

  test("is nothing at all for a link this app does not serve", () => {
    expect(destinationFromURL("wordpoker://offline?seed=20260919")).toBeNull();
    expect(destinationFromURL("wordpoker://online/../sign-in")).toBeNull();
    expect(destinationFromURL("https://play.wordpoker.dev/")).toBeNull();
    expect(destinationFromURL("not a url")).toBeNull();
    expect(destinationFromURL(null)).toBeNull();
    expect(destinationFromURL(undefined)).toBeNull();
    expect(destinationFromURL("")).toBeNull();
  });
});

describe("a destination held for a later session", () => {
  test("is handed back once, and no more", () => {
    rememberDestination({ pathname: "/online/[roomId]", params: { roomId: "abc123" } });

    expect(takeDestination()).toEqual({
      pathname: "/online/[roomId]",
      params: { roomId: "abc123" },
    });
    // A link lands once: the second read has nothing to land on.
    expect(takeDestination()).toBeNull();
  });

  test("is the last one remembered", () => {
    rememberDestination({ pathname: "/online" });
    rememberDestination({ pathname: "/online/[roomId]", params: { roomId: "later" } });

    expect(takeDestination()).toEqual({
      pathname: "/online/[roomId]",
      params: { roomId: "later" },
    });
  });
});

describe("a link's referral", () => {
  test("is the friend code its ref names, and survives a later link without one", () => {
    expect(referralFromURL("https://play.wordpoker.dev/online?room=abc&ref=ABCD2345")).toBe("ABCD2345");
    expect(referralFromURL("wordpoker://online?ref=ABCI2345")).toBeNull();
    expect(referralFromURL("wordpoker://online?room=abc")).toBeNull();
    rememberReferral("wordpoker://online?room=abc&ref=ABCD2345");
    rememberReferral("wordpoker://online?room=def");
    expect(pendingReferral()).toBe("ABCD2345");
  });
});

test("a table-invite notification's link lands at the table", () => {
  expect(destinationFromURL("wordpoker://online/room_1")).toEqual({ pathname: "/online/[roomId]", params: { roomId: "room_1" } });
});
