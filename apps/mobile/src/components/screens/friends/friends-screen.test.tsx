import { act, fireEvent, render, waitFor, type RenderResult } from "@testing-library/react-native";
import type { FriendsPage } from "@wordpoker/contracts";
import { useEffect as mockUseEffect } from "react";
import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { addFriend, getFriends, acceptFriend, inviteFriend, nudgeFriend, removeFriend } from "@/lib/friends/friends-client";
import { router } from "expo-router";
import { FriendsScreen } from "./friends-screen";

let mockGuest = false;
let mockParams: { add?: string; tab?: string } = {};
let mockRoom: string | null = null;
const mockNavigation = { setParams: jest.fn() };
jest.mock("@/auth/client/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: "caller", isAnonymous: mockGuest } } }) } }));
jest.mock("expo-router", () => ({
  router: { dismissTo: jest.fn(), navigate: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => () => void) => { mockUseEffect(callback, [callback]); },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@/features/online/room-session", () => ({ useActiveRoomId: () => mockRoom }));
jest.mock("@/lib/friends/friends-client", () => ({
  getFriends: jest.fn(), addFriend: jest.fn(), acceptFriend: jest.fn(), removeFriend: jest.fn(), inviteFriend: jest.fn(), nudgeFriend: jest.fn(),
}));
jest.mock("@/lib/navigation/invite-link", () => ({ friendLinkFor: (code: string) => `https://play.test/friend/${code}` }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
const mockQr = jest.fn((_props: { value: string }) => null);
jest.mock("react-native-qrcode-svg", () => ({ __esModule: true, default: (props: { value: string }) => mockQr(props) }));

const PAGE: FriendsPage = { code: "WXYZ2345", friends: [{ userId: "friend", name: "Bea" }],
  incoming: [{ userId: "incoming", name: "Ada" }], outgoing: [{ userId: "sent", name: "Cal" }], referrals: 2 };

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  jest.resetAllMocks();
  mockGuest = false;
  mockParams = { add: "ABCD2345" };
  mockRoom = null;
  jest.mocked(getFriends).mockResolvedValue(PAGE);
  jest.mocked(addFriend).mockResolvedValue("Friend request sent");
});

async function press(view: RenderResult, id: string) {
  await act(async () => { fireEvent.press(view.getByTestId(id)); });
}

const text = (view: RenderResult, id: string) => JSON.stringify(view.getByTestId(id).props);

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
  expect(text(view, "friends-message")).toContain("Link copied.");
});

test("cancelling browser sharing is quiet", async () => {
  jest.spyOn(Share, "share").mockRejectedValue(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-share")).toBeTruthy());
  await press(view, "friends-share");
  expect(view.queryByTestId("friends-message")).toBeNull();
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
  expect(text(view, "friends-message")).toContain("Couldn't copy. Select the link instead.");
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
  await waitFor(() => expect(view.getByTestId("friend-add")).toBeTruthy());
  expect(addFriend).not.toHaveBeenCalled();
  await press(view, "friend-add");
  expect(addFriend).toHaveBeenCalledWith("ABCD2345");
  expect(getFriends).toHaveBeenCalledTimes(2);
  expect(view.queryByTestId("friend-add")).toBeNull();
});

test("+ Add sends a typed code and refuses one that isn't a friend code", async () => {
  mockParams = {};
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-add")).toBeTruthy());
  await press(view, "friends-add");
  await act(async () => { fireEvent.changeText(view.getByTestId("friends-add-code"), "abci2345"); });
  expect(view.getByTestId("friend-add").props.accessibilityState).toMatchObject({ disabled: true });
  await act(async () => { fireEvent.changeText(view.getByTestId("friends-add-code"), "efgh2345"); });
  await press(view, "friend-add");
  expect(addFriend).toHaveBeenCalledWith("EFGH2345");
});

test.each([
  ["friend-accept-incoming", "incoming", "accept"], ["friend-decline-incoming", "incoming", "remove"], ["friend-cancel-sent", "sent", "remove"],
])("%s on Requests uses the friend client and refreshes", async (id, user, action) => {
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-tab-requests")).toBeTruthy());
  await press(view, "friends-tab-requests");
  await press(view, id);
  expect(action === "accept" ? acceptFriend : removeFriend).toHaveBeenCalledWith(user);
  expect(getFriends).toHaveBeenCalledTimes(2);
});

test("a long press on a friend offers Remove", async () => {
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-row-friend")).toBeTruthy());
  expect(view.queryByTestId("friend-remove-friend")).toBeNull();
  await act(async () => { fireEvent(view.getByTestId("friend-row-friend"), "longPress"); });
  await press(view, "friend-remove-friend");
  expect(removeFriend).toHaveBeenCalledWith("friend");
});

test("guests see the account prompt without loading private rows", async () => {
  mockGuest = true;
  const view = await render(<FriendsScreen />);
  expect(view.getByTestId("friends-sign-up")).toBeTruthy();
  expect(view.queryByTestId("friend-add")).toBeNull();
  expect(getFriends).not.toHaveBeenCalled();
});

test("invalid add codes cannot send a request", async () => {
  mockParams = { add: "invalid" };
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-row-friend")).toBeTruthy());
  expect(view.queryByTestId("friend-add")).toBeNull();
});

test("the invite card shows a QR of the friend link", async () => {
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-qr")).toBeTruthy());
  expect(mockQr).toHaveBeenLastCalledWith(expect.objectContaining({ value: "https://play.test/friend/WXYZ2345" }));
});

test("says how many friends joined through the player's invite", async () => {
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-referrals")).toBeTruthy());
});

test("opens on Online when someone is, at a table first, and All adds the offline", async () => {
  jest.mocked(getFriends).mockResolvedValue({ ...PAGE, friends: [
    { userId: "off", name: "Noor", status: "offline" }, { userId: "lobby", name: "Priya", status: "online" }, { userId: "table", name: "Ellis", status: "at-table" },
  ] });
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-row-lobby")).toBeTruthy());
  expect(view.getByText("2 of 3 friends online")).toBeTruthy();
  expect(view.getByTestId("friends-tab-online").props.accessibilityState).toMatchObject({ selected: true });
  expect(view.queryByTestId("friend-row-off")).toBeNull();
  const names = () => view.getAllByTestId(/^friend-name-/).map((node) => node.props.children);
  expect(names()).toEqual(["Ellis", "Priya"]);
  expect(text(view, "friend-status-table")).toContain("At a table");
  expect(text(view, "friend-status-lobby")).toContain("In the lobby");
  await press(view, "friends-tab-all");
  expect(names()).toEqual(["Ellis", "Priya", "Noor"]);
  expect(text(view, "friend-status-off")).toContain("Offline");
  expect(view.queryByTestId("friend-invite-off")).toBeNull();
  expect(view.queryByTestId("friend-invite-table")).toBeNull();
});

test("each tab has its empty line", async () => {
  jest.mocked(getFriends).mockResolvedValue({ code: "WXYZ2345", friends: [], incoming: [], outgoing: [], referrals: 0 });
  mockParams = {};
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByText("No friends yet. Bring someone in.")).toBeTruthy());
  await press(view, "friends-tab-online");
  expect(view.getByText("Nobody online right now.")).toBeTruthy();
  await press(view, "friends-tab-requests");
  expect(view.getByText("No requests.")).toBeTruthy();
  expect(view.queryByTestId("friends-invite")).toBeNull();
});

test("a friend-request push opens on Requests", async () => {
  mockParams = { tab: "requests" };
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-accept-incoming")).toBeTruthy());
  expect(view.getByTestId("friends-tab-requests").props.accessibilityState).toMatchObject({ selected: true });
});

test("Invite seats a lobby friend at the player's table, or shares the link without one", async () => {
  jest.mocked(getFriends).mockResolvedValue({ ...PAGE, friends: [{ userId: "lobby", name: "Priya", status: "online" }] });
  const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-invite-lobby")).toBeTruthy());
  await press(view, "friend-invite-lobby");
  expect(share).toHaveBeenCalledWith({ message: "https://play.test/friend/WXYZ2345" });
  expect(inviteFriend).not.toHaveBeenCalled();

  mockRoom = "room1";
  await view.rerender(<FriendsScreen />);
  await press(view, "friend-invite-lobby");
  expect(inviteFriend).toHaveBeenCalledWith("lobby", "room1");
  expect(view.getByText("Invited ✓")).toBeTruthy();
});

test("Join takes a seat at an at-table friend's table, but not the player's own", async () => {
  jest.mocked(getFriends).mockResolvedValue({ ...PAGE, friends: [
    { userId: "table", name: "Ellis", status: "at-table", roomId: "room9" }, { userId: "mine", name: "Mo", status: "at-table", roomId: "room1" },
    { userId: "old", name: "Ola", status: "at-table" },
  ] });
  mockRoom = "room1";
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-join-table")).toBeTruthy());
  expect(view.queryByTestId("friend-join-mine")).toBeNull();
  expect(view.queryByTestId("friend-join-old")).toBeNull();
  await press(view, "friend-join-table");
  expect(router.push).toHaveBeenCalledWith({ pathname: "/online/[roomId]", params: { roomId: "room9" } });
});

test("Nudge pings an offline friend once and says how it went", async () => {
  jest.mocked(getFriends).mockResolvedValue({ ...PAGE, friends: [{ userId: "off", name: "Noor", status: "offline" }] });
  jest.mocked(nudgeFriend).mockResolvedValueOnce("Nudge sent").mockRejectedValueOnce(new Error("You nudged them recently. Try again later."));
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-nudge-off")).toBeTruthy());
  await press(view, "friend-nudge-off");
  expect(nudgeFriend).toHaveBeenCalledWith("off");
  expect(view.getByText("Nudged ✓")).toBeTruthy();
  expect(text(view, "friends-message")).toContain("Nudge sent");
  expect(view.getByTestId("friend-nudge-off").props.accessibilityState).toMatchObject({ disabled: true });
});

test("a refused nudge can be tried again", async () => {
  jest.mocked(getFriends).mockResolvedValue({ ...PAGE, friends: [{ userId: "off", name: "Noor", status: "offline" }] });
  jest.mocked(nudgeFriend).mockRejectedValue(new Error("You nudged them recently. Try again later."));
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-nudge-off")).toBeTruthy());
  await press(view, "friend-nudge-off");
  expect(text(view, "friends-message")).toContain("You nudged them recently.");
  expect(view.getByText("Nudge")).toBeTruthy();
});

test("an offline friend shows when they were last seen, and a photo replaces the initial", async () => {
  jest.mocked(getFriends).mockResolvedValue({ ...PAGE, friends: [
    { userId: "off", name: "Noor", status: "offline", lastSeen: new Date(Date.now() - 3 * 3_600_000).toISOString(), image: "https://avatars.test/n.jpg" },
    { userId: "gone", name: "Gus", status: "offline" },
  ] });
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friend-status-off")).toBeTruthy());
  expect(text(view, "friend-status-off")).toContain("Seen 3h ago");
  expect(text(view, "friend-status-gone")).toContain("Offline");
  expect(JSON.stringify(view.getByTestId("friend-photo-off").props.source)).toContain("https://avatars.test/n.jpg");
  expect(view.queryByTestId("friend-photo-gone")).toBeNull();
});

test("back drops the board, then returns Home", async () => {
  jest.useFakeTimers();
  const view = await render(<FriendsScreen />);
  await waitFor(() => expect(view.getByTestId("friends-close")).toBeTruthy());
  await press(view, "friends-close");
  expect(router.navigate).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(400); });
  expect(router.navigate).toHaveBeenCalledWith("/");
  jest.useRealTimers();
});
