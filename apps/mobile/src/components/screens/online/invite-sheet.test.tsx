import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { getFriends, inviteFriend } from "@/lib/friends-client";
import { InviteSheet } from "./invite-sheet";

let mockGuest = false;
jest.mock("@/auth/client/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "caller", isAnonymous: mockGuest } } }) },
}));
jest.mock("@/lib/friends-client", () => ({ getFriends: jest.fn(), inviteFriend: jest.fn(async () => {}) }));
jest.mock("react-native-qrcode-svg", () => ({ __esModule: true, default: () => null }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getFriends).mockResolvedValue({ code: "ABCD2345", friends: [], incoming: [], outgoing: [], referrals: 0 });
  jest.mocked(inviteFriend).mockResolvedValue(undefined);
});

test("an account's link carries its friend code and the sheet names the reward", async () => {
  mockGuest = false;
  const view = await render(<InviteSheet onClose={() => {}} roomId="abc" visible />);
  await waitFor(() => expect(view.getByTestId("invite-link").props.children).toContain("ref=ABCD2345"));
  expect(view.getByTestId("invite-reward")).toBeTruthy();
});

test("a guest's link stays plain and nothing is fetched", async () => {
  mockGuest = true;
  const view = await render(<InviteSheet onClose={() => {}} roomId="abc" visible />);
  expect(view.getByTestId("invite-link").props.children).not.toContain("ref=");
  expect(view.queryByTestId("invite-reward")).toBeNull();
  expect(getFriends).not.toHaveBeenCalled();
});

test("lists online friends and marks one invited", async () => {
  mockGuest = false;
  jest.mocked(getFriends).mockResolvedValue({
    code: "ABCD2345", incoming: [], outgoing: [], referrals: 0,
    friends: [{ userId: "bea", name: "Bea", status: "online" }, { userId: "cal", name: "Cal", status: "offline" }],
  });
  const view = await render(<InviteSheet onClose={() => {}} roomId="abc" visible />);
  await waitFor(() => expect(view.getByTestId("invite-friend-bea")).toBeTruthy());
  expect(view.queryByTestId("invite-friend-cal")).toBeNull();
  await fireEvent(view.getByTestId("invite-friend-bea"), "click");
  expect(inviteFriend).toHaveBeenCalledWith("bea", "abc");
  expect(view.getByText("Invited")).toBeTruthy();
});
