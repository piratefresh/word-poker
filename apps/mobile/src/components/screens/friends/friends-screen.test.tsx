import { act, render, waitFor, type RenderResult } from "@testing-library/react-native";
import { useEffect as mockUseEffect } from "react";
import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { addFriend, getFriends, acceptFriend, removeFriend } from "@/lib/friends/friends-client";
import { router } from "expo-router";
import { FriendsScreen } from "./friends-screen";

let mockGuest = false;
let mockCode: string | undefined = "ABCD2345";
jest.mock("@/auth/client/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: "caller", isAnonymous: mockGuest } } }) } }));
jest.mock("expo-router", () => ({
  router: { dismissTo: jest.fn(), navigate: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ add: mockCode }),
  useFocusEffect: (callback: () => () => void) => { mockUseEffect(callback, [callback]); },
}));
jest.mock("@/lib/friends/friends-client", () => ({ getFriends: jest.fn(), addFriend: jest.fn(), acceptFriend: jest.fn(), removeFriend: jest.fn() }));
jest.mock("@/lib/navigation/invite-link", () => ({ friendLinkFor: (code: string) => `https://play.test/friend/${code}` }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  jest.resetAllMocks();
  mockGuest = false;
  mockCode = "ABCD2345";
  jest.mocked(getFriends).mockResolvedValue({ code: "WXYZ2345", friends: [{ userId: "friend", name: "Bea" }],
    incoming: [{ userId: "incoming", name: "Ada" }], outgoing: [{ userId: "sent", name: "Cal" }], referrals: 2 });
  jest.mocked(addFriend).mockResolvedValue("Friend request sent");
});

async function press(view: RenderResult, id: string) {
  await act(async () => {
    const node = view.getByTestId(id);
    (node.props.onButtonPress ?? node.props.onPress ?? node.props.onClick)?.();
  });
}

test("unavailable browser sharing leaves a selectable friend link and copy action", async () => {
  jest.spyOn(Share, "share").mockRejectedValue(new Error("Share is not supported in this browser"));
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-share")).toBeTruthy());
  await press(view, "friends-share");
  const link = view.getByTestId("friends-link");
  expect(link.props.selectable).toBe(true);
  expect(link.props.children).toBe("https://play.test/friend/WXYZ2345");
  await press(view, "friends-copy");
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(link.props.children);
  expect(JSON.stringify(view.getByTestId("friends-message").props)).toContain("Link copied.");
});

test("cancelling browser sharing is quiet", async () => {
  jest.spyOn(Share, "share").mockRejectedValue(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-share")).toBeTruthy());
  await press(view, "friends-share");
  expect(JSON.stringify(view.getByTestId("friends-message").props)).not.toContain("Couldn't share");
  expect(view.queryByTestId("friends-link")).toBeNull();
});

test.each(["refused", "rejected"])("clipboard %s keeps the friend link available for manual selection", async (failure) => {
  jest.spyOn(Share, "share").mockRejectedValue(new Error("Permission denied"));
  if (failure === "refused") jest.mocked(Clipboard.setStringAsync).mockResolvedValue(false);
  else jest.mocked(Clipboard.setStringAsync).mockRejectedValue(new Error("Permission denied"));
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-share")).toBeTruthy());
  await press(view, "friends-share");
  await press(view, "friends-copy");
  expect(JSON.stringify(view.getByTestId("friends-message").props)).toContain("Couldn't copy. Select the link instead.");
  expect(view.getByTestId("friends-link").props.selectable).toBe(true);
});

test("only one share opens at a time and successful sharing needs no fallback", async () => {
  let finish: ((result: Awaited<ReturnType<typeof Share.share>>) => void) | undefined;
  const share = jest.spyOn(Share, "share").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-share")).toBeTruthy());
  await press(view, "friends-share");
  await press(view, "friends-share");
  expect(share).toHaveBeenCalledTimes(1);
  expect(share).toHaveBeenCalledWith({ message: "https://play.test/friend/WXYZ2345" });
  await act(async () => { finish?.({ action: Share.sharedAction }); });
  expect(view.queryByTestId("friends-link")).toBeNull();
  await press(view, "friends-share");
  expect(share).toHaveBeenCalledTimes(2);
  await act(async () => { finish?.({ action: Share.sharedAction }); });
});

test("opening a profile link needs an explicit press to request", async () => {
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-accept-incoming")).toBeTruthy());
  expect(addFriend).not.toHaveBeenCalled();
  await press(view, "friend-add");
  expect(addFriend).toHaveBeenCalledWith("ABCD2345");
  expect(getFriends).toHaveBeenCalledTimes(2);
});

test.each([
  ["friend-accept-incoming", "incoming", "accept"], ["friend-decline-incoming", "incoming", "remove"],
  ["friend-remove-friend", "friend", "remove"], ["friend-cancel-sent", "sent", "remove"],
])("%s uses the friend client and refreshes", async (id, user, action) => {
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId(id)).toBeTruthy());
  await press(view, id);
  expect(action === "accept" ? acceptFriend : removeFriend).toHaveBeenCalledWith(user);
  expect(getFriends).toHaveBeenCalledTimes(2);
});

test("guests see the account prompt without loading private rows", async () => {
  mockGuest = true;
  const view = await render(<FriendsScreen />);
  expect(view.queryByTestId("friend-add")).toBeNull();
  expect(getFriends).not.toHaveBeenCalled();
});

test("invalid add codes cannot send a request", async () => {
  mockCode = "invalid";
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-remove-friend")).toBeTruthy());
  expect(view.queryByTestId("friend-add")).toBeNull();
});

test("says how many friends joined through the player's invite", async () => {
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-referrals")).toBeTruthy());
});

test("shows each friend's presence", async () => {
  jest.mocked(getFriends).mockResolvedValue({ code: "WXYZ2345", incoming: [], outgoing: [], referrals: 0,
    friends: [{ userId: "friend", name: "Bea", status: "at-table" }] });
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-name-friend")).toBeTruthy());
  expect(JSON.stringify(view.getByTestId("friend-name-friend").props)).toContain("Bea · At a table");
});

test("the tab is a tray that closes back to Home", async () => {
  jest.useFakeTimers();
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-tray")).toBeTruthy());
  await press(view, "friends-close");
  expect(view.queryByTestId("friends-tray")).toBeNull();
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(router.navigate).toHaveBeenCalledWith("/");
  jest.useRealTimers();
});
