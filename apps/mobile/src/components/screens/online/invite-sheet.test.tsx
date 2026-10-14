import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { getFriends } from "@/lib/friends-client";
import { InviteSheet } from "./invite-sheet";

let mockGuest = false;
jest.mock("@/auth/client/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "caller", isAnonymous: mockGuest } } }) },
}));
jest.mock("@/lib/friends-client", () => ({ getFriends: jest.fn() }));
jest.mock("react-native-qrcode-svg", () => ({ __esModule: true, default: () => null }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getFriends).mockResolvedValue({ code: "ABCD2345", friends: [], incoming: [], outgoing: [], referrals: 0 });
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
