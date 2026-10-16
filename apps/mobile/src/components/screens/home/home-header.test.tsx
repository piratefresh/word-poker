import { act, fireEvent, render } from "@testing-library/react-native";

import { authClient } from "@/auth/client/auth-client";

import { AccountSettings } from "./account-settings";
import { NotificationSettings } from "./notification-settings";
import { HomeHeader } from "./home-header";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/auth/client/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { name: "Ada", email: "ada@example.com" } } }),
    signOut: jest.fn(),
    updateUser: jest.fn(),
  },
}));

// The coordinator leaves the online table first, which loads Colyseus; these tests only need the call.
jest.mock("@/auth/client/session-coordinator", () => ({
  changeSession: (change: () => Promise<unknown>) => change(),
  setAutoRestore: jest.fn(async () => {}),
}));

const mockOrder: string[] = [];
jest.mock("@/lib/use-push-registration", () => ({
  unregisterPush: jest.fn(async () => { mockOrder.push("unregister"); }),
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
}));

jest.mock("@/lib/quests-provider", () => ({
  useQuests: () => ({ coins: 1250, state: { xp: 50 } }),
}));

// Expo's observable text state and sheet presentation require a native runtime.
jest.mock("@expo/ui", () => {
  const React = require("react");
  const { View, TextInput } = require("react-native");
  return {
    ...jest.requireActual("@expo/ui"),
    useNativeState: (initial: string) => React.useRef({ value: initial }).current,
    BottomSheet: ({ children, testID }: { children: unknown; testID: string }) => React.createElement(View, { testID }, children),
    TextInput: ({ value, ...props }: { value: { value: string } }) => React.createElement(TextInput, {
      ...props, value: value.value, onChangeText: (text: string) => { value.value = text; },
    }),
  };
});

// Drive the menu's native selection event without requiring a system popup in Jest.
jest.mock("@expo/ui/community/menu", () => ({
  MenuView: (props: Record<string, unknown>) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, props);
  },
}));

beforeEach(() => jest.clearAllMocks());

test("shows credits and XP, opens Settings, and signs out through the avatar menu", async () => {
  jest.mocked(authClient.signOut).mockResolvedValue({ data: { success: true }, error: null } as never);
  const view = await render(<HomeHeader width={342} />);
  expect(view.getByLabelText("1250 credits")).toBeTruthy();
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

test("a notification switch saves to the account", async () => {
  jest.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null } as never);
  const view = await render(<NotificationSettings />);
  const online = view.getByTestId("notify-notifyFriendOnline");
  await act(async () => { await online.props.onIsOnChange({ nativeEvent: { isOn: true } }); });
  expect(authClient.updateUser).toHaveBeenCalledWith({ notifyFriendOnline: true });
});

test("rejects an empty display name, saves a trimmed name, and keeps failed saves open", async () => {
  const dismiss = jest.fn();
  const view = await render(<AccountSettings onDismiss={dismiss} />);
  const save = () => act(async () => {
    const button = view.getByTestId("account-save");
    await button.props.onButtonPress();
  });

  await fireEvent.changeText(view.getByTestId("account-display-name"), "   ");
  await save();
  expect(authClient.updateUser).not.toHaveBeenCalled();
  expect(dismiss).not.toHaveBeenCalled();

  await fireEvent.changeText(view.getByTestId("account-display-name"), "  Ada Lovelace  ");
  jest.mocked(authClient.updateUser).mockResolvedValueOnce({ error: { message: "Unavailable" } } as never);
  await save();
  expect(dismiss).not.toHaveBeenCalled();

  jest.mocked(authClient.updateUser).mockResolvedValueOnce({ data: { status: true }, error: null } as never);
  await save();
  expect(authClient.updateUser).toHaveBeenLastCalledWith({ name: "Ada Lovelace" });
  expect(dismiss).toHaveBeenCalledTimes(1);
});
