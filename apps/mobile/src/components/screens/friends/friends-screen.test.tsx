import { act, render, waitFor, type RenderResult } from "@testing-library/react-native";
import { useEffect as mockUseEffect } from "react";
import { addFriend, getFriends, acceptFriend, removeFriend } from "@/lib/friends/friends-client";
import { FriendsScreen } from "./friends-screen";

let mockGuest = false;
let mockCode: string | undefined = "ABCD2345";
jest.mock("@/auth/client/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: "caller", isAnonymous: mockGuest } } }) } }));
jest.mock("expo-router", () => ({
  router: { dismissTo: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ add: mockCode }),
  useFocusEffect: (callback: () => () => void) => { mockUseEffect(callback, [callback]); },
}));
jest.mock("@/lib/friends/friends-client", () => ({ getFriends: jest.fn(), addFriend: jest.fn(), acceptFriend: jest.fn(), removeFriend: jest.fn() }));
jest.mock("@/lib/navigation/invite-link", () => ({ friendLinkFor: (code: string) => `https://play.test/friend/${code}` }));

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
