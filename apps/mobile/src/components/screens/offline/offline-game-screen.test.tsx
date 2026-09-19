import { fireEvent, render, type RenderResult } from "@testing-library/react-native";

import { OfflineGameScreen } from "./offline-game-screen";

// `useSafeAreaInsets` throws without a provider, and the shipped provider needs native
// views. The library's own mock stands in, with zero insets.
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock")
    .default,
);

// expo-router reaches a navigation package Jest cannot parse. The screen only touches
// `router` from the HUD's leave handler.
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

async function renderTable() {
  const view = await render(<OfflineGameScreen />);
  await fireEvent(view.getByTestId("poker-table"), "layout", FELT_BOX);
  return view;
}

/**
 * `@expo/ui` buttons render as native adapter views: no text node, no button role, just
 * the props the native control receives, so the round's control is located by its label.
 */
function roundButton(view: RenderResult, label: string): NonNullable<RenderResult["root"]> {
  const [node] = view.root!.queryAll((candidate) => candidate.props?.label === label);
  if (!node) throw new Error(`No round button labelled ${label}`);
  return node;
}

/**
 * The board's progress is reported by the felt's own strip above the community slots.
 * The HUD carried a second counter there until it was removed, so this is the only
 * report on screen and a regression in either direction shows up here.
 */
function expectBoard(view: RenderResult, dealt: number) {
  expect(view.getByText(`COMMUNITY · ${dealt}/5`)).toBeOnTheScreen();
}

describe("<OfflineGameScreen />", () => {
  test("deals a hand and puts the hero on the clock", async () => {
    const view = await renderTable();

    expectBoard(view, 0);
    expect(view.getByText("PHASE 2 · PRE-FLOP")).toBeOnTheScreen();
    expect(view.getByText("YOUR TURN")).toBeOnTheScreen();
    // The badge only lands on the felt if the mapped state flags the hero's seat.
    expect(view.getByText(/· YOU/)).toBeOnTheScreen();
  });

  test("fills the board a street per tap, the bots acting without one", async () => {
    const view = await renderTable();

    const streets: [dealt: number, phase: string][] = [
      [3, "PHASE 3 · THE FLOP"],
      [4, "PHASE 4 · THE TURN"],
      [5, "PHASE 5 · THE RIVER"],
    ];

    for (const [dealt, phase] of streets) {
      await fireEvent.press(roundButton(view, "Advance"));

      // The hero taps their own turn; the bots' turns and the street roll that follows
      // are in the same transition, so one tap is one street.
      expectBoard(view, dealt);
      expect(view.getByText(phase)).toBeOnTheScreen();
    }
  });

  test("shows the winner at payout, then deals the next hand", async () => {
    const view = await renderTable();

    for (let street = 0; street < 4; street += 1) {
      await fireEvent.press(roundButton(view, "Advance"));
    }

    expect(view.getByText("PHASE 6 · PAYOUT")).toBeOnTheScreen();
    expect(view.getAllByText("WINNER")).toHaveLength(1);

    await fireEvent.press(roundButton(view, "Deal"));

    expect(view.getByText("PHASE 2 · PRE-FLOP")).toBeOnTheScreen();
    expectBoard(view, 0);
  });

  test("leaves the round where it was when a disabled betting control is pressed", async () => {
    const view = await renderTable();

    await fireEvent.press(view.getByText("FOLD"));

    expect(view.getByText("PHASE 2 · PRE-FLOP")).toBeOnTheScreen();
    expectBoard(view, 0);
  });
});
