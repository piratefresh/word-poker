import { act, fireEvent, render } from "@testing-library/react-native";

import { FOUR_PLAYER_FLOP_FIXTURE } from "./game-fixtures";
import { GameScreen, type GameScreenProps } from "./game-screen";

// `useSafeAreaInsets` throws without a provider, and the shipped provider needs native
// views. The library's own mock stands in, with zero insets.
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock")
    .default,
);

// expo-router reaches a navigation package Jest cannot parse. The screen reads `router`
// only when it is given no `onBack`, which every test here supplies.
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() },
}));

// The suite's reanimated mock has no `useReducedMotion` — the library ships it as a TODO —
// and the word tile reads it, so the one hook is layered on for this screen.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

/**
 * The table measures itself, so a seat only exists once the felt has a size — Jest never
 * lays anything out, so the test supplies the measurement the platform would have sent.
 */
const FELT_BOX = { nativeEvent: { layout: { width: 360, height: 320 } } };

async function renderScreen(props: Partial<GameScreenProps> = {}) {
  const view = await render(<GameScreen game={FOUR_PLAYER_FLOP_FIXTURE} {...props} />);
  await fireEvent(view.getByTestId("poker-table"), "layout", FELT_BOX);
  return view;
}

afterEach(() => {
  jest.useRealTimers();
});

test("shows one header, the HUD's own, and none of the header it replaced", async () => {
  const view = await renderScreen();

  expect(view.getByText("PHASE 3 · THE FLOP")).toBeOnTheScreen();

  // The replaced header had its own leave, help, and chat buttons. A second of any of
  // them is a screen with two headers.
  expect(view.getAllByRole("button", { name: "Leave the table" })).toHaveLength(1);
  expect(view.getAllByRole("button", { name: "How to play" })).toHaveLength(1);
  expect(view.queryByRole("button", { name: "Go back" })).toBeNull();
  expect(view.queryByRole("button", { name: "Open chat" })).toBeNull();
  // The chat button it also carried is gone; the FAB at the bottom is the only one left.
  expect(view.getAllByLabelText(/chat/)).toHaveLength(1);
});

test("reports the balance as unavailable, never as a figure the player does not have", async () => {
  const view = await renderScreen();

  expect(view.getByLabelText("Balance unavailable")).toHaveTextContent("—");
});

test("counts the turn down instead of re-anchoring its deadline on every render", async () => {
  jest.useFakeTimers();
  const view = await renderScreen();

  expect(view.getAllByText("00:44").length).toBeGreaterThan(0);

  // The shared clock republishes four times a second; a second of it has to reach the
  // digits. A deadline derived afresh on each render would sit at 00:44 for ever.
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });

  expect(view.getAllByText("00:43").length).toBeGreaterThan(0);
  expect(view.queryAllByText("00:44")).toHaveLength(0);
});

test("opens a new turn from a new budget instead of keeping the old deadline", async () => {
  jest.useFakeTimers();
  const view = await renderScreen();

  // The server says this turn has twelve seconds, which is a different turn from the one
  // the screen first opened: holding the first deadline would leave the clock reading the
  // wrong budget for the rest of the hand.
  await view.rerender(
    <GameScreen game={{ ...FOUR_PLAYER_FLOP_FIXTURE, secondsRemaining: 12 }} />,
  );

  expect(view.getAllByText("00:12").length).toBeGreaterThan(0);
  expect(view.queryAllByText("00:44")).toHaveLength(0);
});

test("keeps a seat's tap under the HUD", async () => {
  const onSeatPress = jest.fn();
  const view = await renderScreen({ onSeatPress });

  // Pressed on the name inside the seat, so the tap has to travel out through the seat
  // and the felt layers to reach the handler.
  await fireEvent.press(view.getByText(/MAGNUS/));

  expect(onSeatPress).toHaveBeenCalledWith(
    expect.objectContaining({ id: "magnus", isHero: true }),
  );
});

const CHROME_BUTTONS: [
  string,
  keyof Pick<GameScreenProps, "onBack" | "onHelp" | "onSettings">,
][] = [
  ["Leave the table", "onBack"],
  ["How to play", "onHelp"],
  ["Settings", "onSettings"],
];

test.each(CHROME_BUTTONS)("%s invokes the screen's handler", async (label, prop) => {
  const handlers = { onBack: jest.fn(), onHelp: jest.fn(), onSettings: jest.fn() };
  const view = await renderScreen(handlers);

  await fireEvent.press(view.getByRole("button", { name: label }));

  expect(handlers[prop]).toHaveBeenCalledTimes(1);
});

test("reports a taken action in the HUD's toast stack", async () => {
  const onFold = jest.fn();
  const view = await renderScreen({ onFold });

  await fireEvent.press(view.getByText("FOLD"));

  expect(onFold).toHaveBeenCalledTimes(1);
  expect(view.getByText("You folded")).toBeOnTheScreen();
});

test("never claims an action it did not hand on", async () => {
  const view = await renderScreen();

  await fireEvent.press(view.getByText("FOLD"));

  expect(view.queryByText("You folded")).toBeNull();
});
