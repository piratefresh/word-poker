import { fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";

import TabLayout from "../../../app/(tabs)/_layout";

jest.mock("@/components/hud/use-reduce-motion", () => ({ useReduceMotion: () => false }));

const mockNavigate = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Tabs: Object.assign(
    ({ layout }: { layout: (props: unknown) => unknown }) => layout({
      state: {
        index: 0,
        routes: [
          { key: "home", name: "index" },
          { key: "friends", name: "friends" },
          { key: "history", name: "history" },
          { key: "explore", name: "explore" },
        ],
      },
      descriptors: {
        home: { options: {}, render: () => null, navigation: { emit: mockEmit } },
        friends: { options: { tabBarBadge: 3 }, render: () => null, navigation: { emit: mockEmit } },
        history: { options: {}, render: () => null, navigation: { emit: mockEmit } },
      },
      navigation: { navigate: mockNavigate, emit: mockEmit },
    }),
    { Screen: () => null },
  ),
}));
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock").default,
);

const savedFlag = process.env.EXPO_PUBLIC_COIN_STORE;
beforeEach(() => {
  jest.clearAllMocks();
  mockEmit.mockReturnValue({ defaultPrevented: false });
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.EXPO_PUBLIC_COIN_STORE;
  else process.env.EXPO_PUBLIC_COIN_STORE = savedFlag;
});

test("rack preserves tab selection, badge, and cancelable navigation", async () => {
  const view = await render(<TabLayout />);
  expect(view.getByRole("tab", { name: "Home" }).props.accessibilityState.selected).toBe(true);
  expect(view.getByText("3")).toBeTruthy();
  expect(view.queryByText("Explore")).toBeNull();

  await fireEvent.press(view.getByTestId("tab-friends"));
  expect(mockNavigate).toHaveBeenCalledWith("friends", undefined);
  mockNavigate.mockClear();
  mockEmit.mockReturnValue({ defaultPrevented: true });
  await fireEvent.press(view.getByTestId("tab-history"));
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("Store is visible but only opens while the existing feature flag is enabled", async () => {
  delete process.env.EXPO_PUBLIC_COIN_STORE;
  const disabled = await render(<TabLayout />);
  expect(disabled.getByTestId("tab-store").props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(disabled.getByTestId("tab-store"));
  expect(router.push).not.toHaveBeenCalled();
  await disabled.unmount();

  process.env.EXPO_PUBLIC_COIN_STORE = "1";
  const enabled = await render(<TabLayout />);
  await fireEvent.press(enabled.getByTestId("tab-store"));
  expect(router.push).toHaveBeenCalledWith("/store");
});
