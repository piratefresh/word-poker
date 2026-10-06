import { act, fireEvent, render } from "@testing-library/react-native";
import { Dimensions, Text } from "react-native";

import { FOUR_PLAYER_FLOP_FIXTURE } from "./game-fixtures";
import { setBackdropStyle } from "./backdrop/backdrop-style";
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
  // The HUD's loop gate reads this to learn whether its screen is on top, and a suite stands
  // in for a screen that is: with nothing to run, the gate keeps its focused default.
  useFocusEffect: () => undefined,
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
  // The FAB the screen used to float over the action row is gone with it, so the table carries
  // no chat control at all until there is chat behind one.
  expect(view.queryAllByLabelText(/chat/)).toHaveLength(0);
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

test("hands a pressed action on to its handler", async () => {
  const onFold = jest.fn();
  const onCheckOrCall = jest.fn();
  const view = await renderScreen({ onCheckOrCall, onFold });

  // The hero owes the fixture's bet, so the row's second control is the call.
  await fireEvent.press(view.getByText("FOLD"));
  await fireEvent.press(view.getByTestId("action-check-call"));

  expect(onFold).toHaveBeenCalledTimes(1);
  expect(onCheckOrCall).toHaveBeenCalledTimes(1);
});

test("calls the wager action the button is labelled with", async () => {
  const onBet = jest.fn();
  const onRaise = jest.fn();
  const view = await renderScreen({ onBet, onRaise });

  // Facing a bet, the slider raises: the amount is the round total it would raise to.
  await fireEvent.press(view.getByTestId("action-wager"));
  expect(onRaise).toHaveBeenCalledWith(40);
  expect(onBet).not.toHaveBeenCalled();

  // With no bet out, the same slider opens the round — a bet, not a raise of nothing.
  await view.rerender(
    <GameScreen
      game={{
        ...FOUR_PLAYER_FLOP_FIXTURE,
        betting: {
          ...FOUR_PLAYER_FLOP_FIXTURE.betting,
          minRaise: 20,
          raiseAmount: 20,
          canCheck: true,
          canRaise: false,
          canBet: true,
          callAmount: undefined,
          currentBet: 0,
          primary: "check",
          wager: "bet",
        },
      }}
      onBet={onBet}
      onRaise={onRaise}
    />,
  );

  await fireEvent.press(view.getByTestId("action-wager"));
  expect(onBet).toHaveBeenCalledWith(20);
  expect(onRaise).toHaveBeenCalledTimes(1);
});

test("asks before committing the whole stack, and only commits on the confirm", async () => {
  const onAllIn = jest.fn();
  const view = await renderScreen({ onAllIn });

  // The button is a bare action; the sheet it opens states the exact amount §22 commits.
  expect(view.getByText("ALL IN")).toBeOnTheScreen();
  await fireEvent.press(view.getByTestId("all-in-button"));
  expect(view.getByTestId("all-in-sheet")).toBeOnTheScreen();
  expect(view.getByText("Commits your entire Table Stack.")).toBeOnTheScreen();

  await fireEvent.press(view.getByTestId("all-in-cancel"));
  expect(view.queryByTestId("all-in-sheet")).toBeNull();
  expect(onAllIn).not.toHaveBeenCalled();

  await fireEvent.press(view.getByTestId("all-in-button"));
  await fireEvent.press(view.getByTestId("all-in-confirm"));

  expect(onAllIn).toHaveBeenCalledTimes(1);
  expect(view.queryByTestId("all-in-sheet")).toBeNull();
});

test("leaves a disabled control inert", async () => {
  const onFold = jest.fn();
  const onAllIn = jest.fn();
  const view = await renderScreen({
    game: {
      ...FOUR_PLAYER_FLOP_FIXTURE,
      betting: { ...FOUR_PLAYER_FLOP_FIXTURE.betting, canFold: false, canAllIn: false },
    },
    onAllIn,
    onFold,
  });

  await fireEvent.press(view.getByText("FOLD"));
  await fireEvent.press(view.getByTestId("all-in-button"));

  expect(onFold).not.toHaveBeenCalled();
  expect(onAllIn).not.toHaveBeenCalled();
  expect(view.queryByTestId("all-in-sheet")).toBeNull();
});

test("holds every action in the row while a lesson locks it, and keeps the mode's own control", async () => {
  const onFold = jest.fn();
  const onCheckOrCall = jest.fn();
  const onRaise = jest.fn();
  const onAllIn = jest.fn();
  const onLeading = jest.fn();
  const { Pressable, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  const view = await renderScreen({
    actionsLocked: true,
    rackActions: (
      <Pressable onPress={onLeading} testID="mode-control">
        <Text>MINE</Text>
      </Pressable>
    ),
    onAllIn,
    onCheckOrCall,
    onFold,
    onRaise,
  });

  for (const id of ["action-fold", "action-check-call", "action-wager", "all-in-button"]) {
    await fireEvent.press(view.getByTestId(id));
  }
  await fireEvent.press(view.getByTestId("mode-control"));

  expect(onFold).not.toHaveBeenCalled();
  expect(onCheckOrCall).not.toHaveBeenCalled();
  expect(onRaise).not.toHaveBeenCalled();
  expect(view.queryByTestId("all-in-sheet")).toBeNull();
  expect(onLeading).toHaveBeenCalledTimes(1);
});

test("draws each side pot under the main pot, and none when the hand has one pot", async () => {
  const view = await renderScreen();

  expect(view.getByTestId("pot")).toBeOnTheScreen();
  expect(view.queryByTestId("side-pot-0")).toBeNull();

  await view.rerender(
    <GameScreen
      game={{ ...FOUR_PLAYER_FLOP_FIXTURE, sidePots: [500, 250] }}
      onBack={jest.fn()}
    />,
  );

  expect(view.getByTestId("side-pot-0")).toHaveTextContent("SIDE POT $500");
  expect(view.getByTestId("side-pot-1")).toHaveTextContent("SIDE POT $250");
});

describe("landscape tabletop", () => {
  const original = Dimensions.get("window");
  afterEach(() => {
    Dimensions.set({ window: original, screen: original });
    setBackdropStyle("emerald");
  });

  // Phone landscape is the tight case: every control the tutorial points at has to still be drawn.
  test("keeps the table, rack and every betting control on a phone on its side", async () => {
    const window = { ...original, width: 800, height: 390 };
    Dimensions.set({ window, screen: window });
    setBackdropStyle("tabletop");
    const view = await renderScreen({ rackActions: <Text>RACK ACTIONS</Text> });

    expect(view.getByTestId("poker-table")).toBeOnTheScreen();
    expect(view.getByText("RACK ACTIONS")).toBeOnTheScreen();
    for (const id of ["action-fold", "action-check-call", "action-wager", "all-in-button"]) {
      expect(view.getByTestId(id)).toBeOnTheScreen();
    }
  });
});
