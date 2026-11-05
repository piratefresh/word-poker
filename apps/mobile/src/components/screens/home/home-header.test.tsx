import { act, fireEvent, render } from "@testing-library/react-native";

import { authClient } from "@/auth/client/auth-client";

import { linkGameCenter } from "@/auth/client/game-center";

import { AccountSettings } from "./account-settings";
import { NotificationSettings } from "./notification-settings";
import { HomeHeader } from "./home-header";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
let mockUser: Record<string, unknown> = { name: "Ada", email: "ada@example.com" };
jest.mock("@/auth/client/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: mockUser } }),
    signOut: jest.fn(),
    updateUser: jest.fn(),
    listAccounts: jest.fn(async () => ({ data: [] })),
  },
}));
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock").default,
);
jest.mock("@/auth/client/game-center", () => ({ GAME_CENTER_AVAILABLE: true, linkGameCenter: jest.fn(), reauthenticateWithGameCenter: jest.fn() }));

// The coordinator leaves the online table first, which loads Colyseus; these tests only need the call.
jest.mock("@/auth/client/social-sign-in", () => ({ SOCIAL_PROVIDERS: [], linkSocial: jest.fn() }));

jest.mock("@/auth/client/session-coordinator", () => ({
  changeSession: (change: () => Promise<unknown>) => change(),
  setAutoRestore: jest.fn(async () => {}),
}));

const mockOrder: string[] = [];
jest.mock("@/lib/friends/use-push-registration", () => ({
  unregisterPush: jest.fn(async () => { mockOrder.push("unregister"); }),
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
}));

jest.mock("@/lib/quests/quests-provider", () => ({
  useQuests: () => ({ coins: 1250, state: { xp: 50 } }),
}));

// Drive the menu's native selection event without requiring a system popup in Jest.
jest.mock("@expo/ui/community/menu", () => ({
  MenuView: (props: Record<string, unknown>) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, props);
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { name: "Ada", email: "ada@example.com" };
});

test("shows coins and XP, opens Settings, and signs out through the avatar menu", async () => {
  jest.mocked(authClient.signOut).mockResolvedValue({ data: { success: true }, error: null } as never);
  const view = await render(<HomeHeader width={342} />);
  expect(view.getByLabelText("Wallet, 1,250 coins")).toBeTruthy();
  expect(view.getByTestId("home-level")).toBeTruthy();

  await fireEvent(view.getByTestId("home-account-menu"), "pressAction", { nativeEvent: { event: "settings" } });
  expect(view.getByTestId("account-settings")).toBeTruthy();

  await fireEvent(view.getByTestId("home-account-menu"), "pressAction", { nativeEvent: { event: "sign-out" } });
  expect(authClient.signOut).toHaveBeenCalledTimes(1);
});

test("takes the push token back before the session goes", async () => {
  mockOrder.length = 0;
  jest.mocked(authClient.signOut).mockImplementation((async () => {
    mockOrder.push("signOut");
    return { data: { success: true }, error: null };
  }) as never);
  const view = await render(<HomeHeader width={342} />);
  await fireEvent(view.getByTestId("home-account-menu"), "pressAction", { nativeEvent: { event: "sign-out" } });
  await act(async () => {});
  expect(mockOrder).toEqual(["unregister", "signOut"]);
});

test("a notification switch saves to the account on tap", async () => {
  jest.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null } as never);
  const onSaved = jest.fn();
  const view = await render(<NotificationSettings onSaved={onSaved} />);
  const online = view.getByTestId("notify-notifyFriendOnline");
  expect(online.props.accessibilityRole).toBe("switch");
  expect(online.props.accessibilityLabel).toBe("Friends coming online");
  await act(async () => { fireEvent.press(online); });
  expect(authClient.updateUser).toHaveBeenCalledWith({ notifyFriendOnline: true });
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(view.getByTestId("notify-notifyFriendOnline").props.accessibilityState).toMatchObject({ checked: true });
});

test("saves the display name on blur or Return, never while it is invalid", async () => {
  const dismiss = jest.fn();
  const view = await render(<AccountSettings onDismiss={dismiss} />);
  const field = () => view.getByTestId("account-display-name");

  await fireEvent.changeText(field(), "   ");
  expect(view.getByText("Enter a display name.")).toBeTruthy();
  await act(async () => { fireEvent(field(), "blur"); });
  expect(authClient.updateUser).not.toHaveBeenCalled();

  await fireEvent.changeText(field(), "Ada the Seventeenth");
  expect(view.getByText("Use 16 characters or fewer.")).toBeTruthy();
  await act(async () => { fireEvent(field(), "submitEditing"); });
  expect(authClient.updateUser).not.toHaveBeenCalled();

  await fireEvent.changeText(field(), "  Ada Lovelace  ");
  jest.mocked(authClient.updateUser).mockResolvedValueOnce({ error: { message: "Unavailable" } } as never);
  await act(async () => { fireEvent(field(), "submitEditing"); });
  expect(view.getByText("Couldn’t save your name. Try again.")).toBeTruthy();

  jest.mocked(authClient.updateUser).mockResolvedValueOnce({ data: { status: true }, error: null } as never);
  await act(async () => { fireEvent(field(), "blur"); });
  expect(authClient.updateUser).toHaveBeenLastCalledWith({ name: "Ada Lovelace" });
  expect(view.getByText("✓ SAVED")).toBeTruthy();
  expect(view.getByTestId("account-tag")).toHaveTextContent("SAVED");

  // Unchanged since the last save: blurring again sends nothing.
  await act(async () => { fireEvent(field(), "blur"); });
  expect(authClient.updateUser).toHaveBeenCalledTimes(2);
  expect(dismiss).not.toHaveBeenCalled();
});

test("DONE closes the sheet and saves a name that was never blurred", async () => {
  jest.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null } as never);
  const dismiss = jest.fn();
  const view = await render(<AccountSettings onDismiss={dismiss} />);
  await fireEvent.changeText(view.getByTestId("account-display-name"), "Grace");
  await act(async () => { fireEvent.press(view.getByTestId("account-done")); });
  expect(authClient.updateUser).toHaveBeenCalledWith({ name: "Grace" });
  expect(dismiss).toHaveBeenCalledTimes(1);
});

test("links Game Center and shows it as linked", async () => {
  mockUser = { id: "u1", name: "Ada", email: "ada@example.com" };
  jest.mocked(authClient.listAccounts)
    .mockResolvedValueOnce({ data: [{ providerId: "credential" }] } as never)
    .mockResolvedValueOnce({ data: [{ providerId: "credential" }, { providerId: "game-center" }] } as never);
  jest.mocked(linkGameCenter).mockResolvedValue({ ok: true });
  const view = await render(<AccountSettings onDismiss={jest.fn()} />);
  await act(async () => {});

  expect(view.getByText("Signed in with email")).toBeTruthy();
  expect(view.getByText("SIGNED IN")).toBeTruthy();
  expect(view.getByText("Link to keep your progress on any iPhone.")).toBeTruthy();

  await act(async () => { fireEvent.press(view.getByTestId("account-link-game-center")); });
  expect(linkGameCenter).toHaveBeenCalledTimes(1);
  expect(view.getByTestId("account-tag")).toHaveTextContent("GAME CENTER LINKED");
  expect(view.getByText("LINKED")).toBeTruthy();
  expect(view.getByText("Linked. Your progress follows you to any iPhone.")).toBeTruthy();
});

test("Delete account opens the typed confirmation, and KEEP IT closes it", async () => {
  mockUser = { id: "u1", name: "Ada", email: "ada@example.com" };
  jest.mocked(authClient.listAccounts).mockResolvedValue({ data: [{ providerId: "credential" }] } as never);
  const view = await render(<AccountSettings onDismiss={jest.fn()} />);
  await act(async () => {});

  await fireEvent.press(view.getByTestId("account-delete"));
  expect(view.getByText("Delete your account?")).toBeTruthy();
  await fireEvent.press(view.getByTestId("delete-account-back"));
  expect(view.queryByText("Delete your account?")).toBeNull();
  expect(view.getByTestId("account-delete")).toBeTruthy();
});
