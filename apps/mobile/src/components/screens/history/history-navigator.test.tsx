import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { router } from "expo-router";
import { Text } from "react-native";
import { HistoryNavigator, ledgerRouter } from "./history-navigator";

let mockReduced = false;
jest.mock("@/components/hud/use-reduce-motion", () => ({ useReduceMotion: () => mockReduced }));
jest.mock("./history-screen", () => {
  const { View, Text, Pressable } = jest.requireActual("react-native");
  return {
    HistoryScreen: ({ level, sessionId, handId, revealed, back, openSession, openHand }: {
      level: number; sessionId?: string; handId?: string; revealed: boolean;
      back: () => void; openSession: (id: string) => void; openHand: (id: string) => void;
    }) => <View>
      <Text>{`Page ${level} ${sessionId ?? ""} ${handId ?? ""} ${revealed ? "revealed" : "waiting"}`}</Text>
      <Pressable testID="session" onPress={() => openSession("session-a")}><Text>Session</Text></Pressable>
      <Pressable testID="hand" onPress={() => openHand("hand-a")}><Text>Hand</Text></Pressable>
      <Pressable testID="back" onPress={back}><Text>Back</Text></Pressable>
    </View>,
  };
});

const config = {
  routeNames: ["index", "[sessionId]", "[sessionId]/[handId]"],
  routeParamList: {}, routeGetIdList: {},
};

beforeEach(() => { mockReduced = false; jest.useFakeTimers(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test("cold detail links restore both parent pages, then pop one level at a time", () => {
  const stack = ledgerRouter({ initialRouteName: "index" });
  const state = stack.getRehydratedState({ routes: [{ name: "[sessionId]/[handId]", params: { sessionId: "s", handId: "h" } }] }, config);
  expect(state.routes.map((route) => route.name)).toEqual(config.routeNames);
  expect(state.index).toBe(2);
  const hands = stack.getStateForAction(state, { type: "GO_BACK" }, config);
  if (!hands || hands.stale !== false) throw new Error("Expected a hydrated Hands route");
  expect(hands.routes[hands.index]).toMatchObject({ name: "[sessionId]", params: { sessionId: "s" } });
  const sessions = stack.getStateForAction(hands, { type: "GO_BACK" }, config);
  if (!sessions || sessions.stale !== false) throw new Error("Expected a hydrated Sessions route");
  expect(sessions.routes[sessions.index].name).toBe("index");
});

test("a notification opening detail in a running app also supplies its Hands parent", () => {
  const stack = ledgerRouter({ initialRouteName: "index" });
  const initial = stack.getInitialState(config);
  const detail = stack.getStateForAction(initial, { type: "REPLACE", payload: { name: "[sessionId]/[handId]", params: { sessionId: "new-session", handId: "h" } } }, config);
  if (!detail || detail.stale !== false) throw new Error("Expected hydrated detail");
  expect(detail.routes.map((route) => route.name)).toEqual(config.routeNames);
  expect(detail.routes[1].params).toEqual({ sessionId: "new-session" });
  const another = stack.getStateForAction(detail, { type: "REPLACE", payload: { name: "[sessionId]/[handId]", params: { sessionId: "another-session", handId: "h2" } } }, config);
  if (!another || another.stale !== false) throw new Error("Expected hydrated detail");
  expect(another.routes.map((route) => route.name)).toEqual(config.routeNames);
  expect(another.routes[1].params).toEqual({ sessionId: "another-session" });
});

function routes(initialUrl: string) {
  return renderRouter({
    index: () => <Text>Home</Text>,
    "history/_layout": HistoryNavigator,
    "history/index": () => null,
    "history/[sessionId]": () => null,
    "history/[sessionId]/[handId]": () => null,
  }, { initialUrl });
}

test("URL owns the level, duplicate taps push once, and DealIn waits for the reveal", async () => {
  // SDK 57 augments the render promise; keep it while awaiting RNTL 14.
  const view = routes("/history");
  await view;
  await fireEvent.press(screen.getByTestId("session"));
  await fireEvent.press(screen.getByTestId("session"));
  expect(view.getPathname()).toBe("/history/session-a");
  expect(screen.getByText("Page 1 session-a  waiting")).toBeTruthy();
  await act(() => jest.advanceTimersByTime(450));
  expect(screen.getByText("Page 1 session-a  revealed")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("hand"));
  expect(view.getPathname()).toBe("/history/session-a");
  await act(() => jest.advanceTimersByTime(300));
  await fireEvent.press(screen.getByTestId("hand"));
  expect(view.getPathname()).toBe("/history/session-a/hand-a");
  await act(() => jest.advanceTimersByTime(750));
  await fireEvent.press(screen.getByTestId("back"));
  expect(view.getPathname()).toBe("/history/session-a");
  await act(() => jest.advanceTimersByTime(750));
  await fireEvent.press(screen.getByTestId("back"));
  expect(view.getPathname()).toBe("/history");
});

test("cold detail opens at rest and reduced-motion back reaches hands, sessions, then Home", async () => {
  mockReduced = true;
  const view = routes("/history/s/h");
  await view;
  expect(screen.getByText("Page 2 s h revealed")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("back"));
  await act(() => jest.advanceTimersByTime(0));
  expect(view.getPathname()).toBe("/history/s");
  await fireEvent.press(screen.getByTestId("back"));
  await act(() => jest.advanceTimersByTime(0));
  expect(view.getPathname()).toBe("/history");
  await fireEvent.press(screen.getByTestId("back"));
  expect(view.getPathname()).toBe("/");
  await act(() => router.push("/history"));
  expect(screen.getByText("Page 0   revealed")).toBeTruthy();
});
