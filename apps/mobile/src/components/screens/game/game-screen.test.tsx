import { act, fireEvent, render } from "@testing-library/react-native";
import { Dimensions, Text } from "react-native";

import { FREE_PLAY, type BalanceView } from "@/components/hud";

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

/**
 * The mode states its economy, so every call names a balance — the tests that don't care get
 * a placeholder that cannot be mistaken for a figure.
 */
const LOADING_BALANCE: BalanceView = { state: "loading" };

async function renderScreen(props: Partial<GameScreenProps> = {}) {
  const view = await render(
    <GameScreen balance={LOADING_BALANCE} game={FOUR_PLAYER_FLOP_FIXTURE} {...props} />,
  );
  await fireEvent(view.getByTestId("poker-table"), "layout", FELT_BOX);
  return view;
}

afterEach(() => {
  jest.useRealTimers();
});

test("shows one header, the HUD's own, and none of the header it replaced", async () => {
  const view = await renderScreen();

  expect(view.getByText("FLOP")).toBeOnTheScreen();

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

test("keeps the PRACTICE pill hanging on a short portrait phone after the controls are measured", async () => {
  const original = Dimensions.get("window");
  const window = { ...original, width: 375, height: 667 };
  Dimensions.set({ window, screen: window });
  try {
    const view = await renderScreen({ balance: FREE_PLAY });
    await fireEvent(view.getByTestId("game-controls"), "layout", {
      nativeEvent: { layout: { width: 375, height: 280 } },
    });
    expect(view.getByTestId("hud-mode-tag")).toHaveTextContent("PRACTICE");
    expect(view.getAllByLabelText("Practice game")).toHaveLength(1);
  } finally {
    await act(() => Dimensions.set({ window: original, screen: original }));
  }
});

/** label is what a screen reader reads, text is what is on screen — the chip's readout passes through the felt untouched. */
const BALANCE_STATES: [string, BalanceView, string, string][] = [
  ["ready figure", { state: "ready", amount: 1240 }, "Balance $1,240", "$1.2K"],
  ["loading balance", { state: "loading" }, "Balance loading", "···"],
  ["unavailable balance", { state: "unavailable" }, "Balance unavailable", "—"],
  ["free play", FREE_PLAY, "Practice game", "PRACTICE"],
];

test.each(BALANCE_STATES)(
  "reads the %s its mode stated, never a figure it did not",
  async (_name, balance, label, text) => {
    const view = await renderScreen({ balance });

    expect(view.getByLabelText(label)).toHaveTextContent(text);
  },
);

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
    <GameScreen balance={LOADING_BALANCE} game={{ ...FOUR_PLAYER_FLOP_FIXTURE, secondsRemaining: 12 }} />,
  );

  expect(view.getAllByText("00:12").length).toBeGreaterThan(0);
  expect(view.queryAllByText("00:44")).toHaveLength(0);
});

test("keeps a seat's tap under the HUD", async () => {
  const onSeatPress = jest.fn();
  const view = await renderScreen({ onSeatPress });

  // Pressed on the name inside the seat, so the tap has to travel out through the seat
  // and the felt layers to reach the handler.
  await fireEvent.press(view.getByText("YOU"));

  expect(onSeatPress).toHaveBeenCalledWith(
    expect.objectContaining({ id: "magnus", isHero: true }),
  );
});

const CHROME_BUTTONS: [
  string,
  keyof Pick<GameScreenProps, "onBack" | "onHelp">,
][] = [
  ["Leave the table", "onBack"],
  ["How to play", "onHelp"],
];

test.each(CHROME_BUTTONS)("%s invokes the screen's handler", async (label, prop) => {
  const handlers = { onBack: jest.fn(), onHelp: jest.fn() };
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
  await fireEvent.press(view.getByTestId("action-raise"));
  await fireEvent(view.getByLabelText("Wager amount"), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
  await fireEvent.press(view.getByTestId("action-wager"));
  expect(onRaise).toHaveBeenCalledWith(40);
  expect(onBet).not.toHaveBeenCalled();

  // With no bet out, the same slider opens the round — a bet, not a raise of nothing.
  await view.rerender(
    <GameScreen
      balance={LOADING_BALANCE}
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

  await fireEvent.press(view.getByTestId("action-raise"));
  await fireEvent(view.getByLabelText("Wager amount"), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
  await fireEvent.press(view.getByTestId("action-wager"));
  expect(onBet).toHaveBeenCalledWith(20);
  expect(onRaise).toHaveBeenCalledTimes(1);
});

test("opens collapsed, backs out untouched, and collapses again on a new turn", async () => {
  const onCheckOrCall = jest.fn();
  const onRaise = jest.fn();
  const view = await renderScreen({ onCheckOrCall, onRaise });
  const adjust = async (actionName: string) => fireEvent(view.getByLabelText("Wager amount"), "accessibilityAction", { nativeEvent: { actionName } });
  expect(view.getByRole("button", { name: "Call $20" })).toBeOnTheScreen();
  expect(view.queryByLabelText("Wager amount")).toBeNull();

  await fireEvent.press(view.getByText("RAISE ▲"));
  expect(view.getByText("CLOSE ▼")).toBeOnTheScreen();
  await adjust("increment");
  expect(view.getByRole("button", { name: "CONFIRM $40" })).toBeOnTheScreen();
  await adjust("decrement");
  await fireEvent.press(view.getByText("CLOSE ▼"));
  expect(view.queryByLabelText("Wager amount")).toBeNull();
  expect(onRaise).not.toHaveBeenCalled();

  await fireEvent.press(view.getByText("RAISE ▲"));
  await fireEvent.press(view.getByRole("button", { name: "Call $20" }));
  expect(onCheckOrCall).toHaveBeenCalledTimes(1);
  expect(view.queryByLabelText("Wager amount")).toBeNull();

  await fireEvent.press(view.getByText("RAISE ▲"));
  await adjust("increment");
  await view.rerender(<GameScreen balance={LOADING_BALANCE} game={{ ...FOUR_PLAYER_FLOP_FIXTURE, id: "next-turn" }} onCheckOrCall={onCheckOrCall} onRaise={onRaise} />);
  expect(view.queryByLabelText("Wager amount")).toBeNull();
  expect(view.getByText("RAISE ▲")).toBeOnTheScreen();
  expect(view.queryByTestId("action-wager")).toBeNull();
});

test("labels word confirmation Submit word", async () => {
  const onCheckOrCall = jest.fn();
  const view = await renderScreen({
    game: { ...FOUR_PLAYER_FLOP_FIXTURE, betting: { ...FOUR_PLAYER_FLOP_FIXTURE.betting, primary: "confirm", canCheck: true, callAmount: undefined, canBet: false, canRaise: false } },
    onCheckOrCall,
  });
  await fireEvent.press(view.getByRole("button", { name: "Submit word" }));
  expect(onCheckOrCall).toHaveBeenCalledTimes(1);
  expect(view.queryByTestId("action-wager")).toBeNull();
});

test.each([[375, 667], [800, 390], [1440, 900]])("shows the final submission stage at %s × %s", async (width, height) => {
  const original = Dimensions.get("window");
  Dimensions.set({ window: { ...original, width, height }, screen: { ...original, width, height } });
  jest.useFakeTimers();
  try {
    const game = {
      ...FOUR_PLAYER_FLOP_FIXTURE,
      id: "word-window",
      phase: "river" as const,
      secondsRemaining: 60,
      wordSubmission: { status: "drafting" as const },
      betting: { ...FOUR_PLAYER_FLOP_FIXTURE.betting, primary: "confirm" as const, canCheck: true, callAmount: undefined, canBet: false, canRaise: false },
    };
    const onSubmit = jest.fn();
    const view = await renderScreen({ game, onCheckOrCall: onSubmit });
    // The HUD names the stage; the row is the one Submit, in portrait and on its side alike.
    expect(view.getByText("FINAL STAGE")).toBeOnTheScreen();
    expect(view.queryByTestId("action-fold")).toBeNull();
    expect(view.queryByTestId("all-in-button")).toBeNull();
    expect(view.queryByLabelText("Wager amount")).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Submit word" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await view.rerender(<GameScreen balance={LOADING_BALANCE} game={{ ...game, wordSubmission: { status: "submitting" } }} />);
    expect(view.getByRole("button", { name: "Submitting word" })).toBeDisabled();
    await view.rerender(<GameScreen balance={LOADING_BALANCE} game={{ ...game, wordSubmission: { status: "confirmed" } }} />);
    expect(view.queryByTestId("action-check-call")).toBeNull();
    await view.rerender(<GameScreen balance={LOADING_BALANCE} game={{ ...game, wordSubmission: { status: null } }} />);
    expect(view.queryByTestId("action-check-call")).toBeNull();
  } finally {
    await act(() => Dimensions.set({ window: original, screen: original }));
  }
});

test("asks before committing the whole stack, and only commits on the confirm", async () => {
  const onAllIn = jest.fn();
  const view = await renderScreen({ onAllIn });

  // The button is a bare action; the sheet it opens states the exact amount §22 commits.
  // The ALL IN preset puts the knob at the stack, so the raise button reads ALL IN.
  const shove = async () => {
    await fireEvent.press(view.getByTestId("action-raise"));
    await fireEvent.press(view.getByRole("button", { name: /^All in raise to/ }));
    await fireEvent.press(view.getByTestId("all-in-button"));
  };
  await shove();
  expect(view.getByTestId("all-in-sheet")).toBeOnTheScreen();
  expect(view.getByText("Commits your entire Table Stack.")).toBeOnTheScreen();

  await fireEvent.press(view.getByTestId("all-in-cancel"));
  expect(view.queryByTestId("all-in-sheet")).toBeNull();
  expect(onAllIn).not.toHaveBeenCalled();

  // Cancelling leaves the slider open at the stack, so the button is still ALL IN.
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
      betting: { ...FOUR_PLAYER_FLOP_FIXTURE.betting, canFold: false, canRaise: false, canAllIn: false },
    },
    onAllIn,
    onFold,
  });

  await fireEvent.press(view.getByText("FOLD"));
  await fireEvent.press(view.getByTestId("action-raise"));

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

  for (const id of ["action-fold", "action-check-call", "action-raise"]) {
    await fireEvent.press(view.getByTestId(id));
  }
  await fireEvent.press(view.getByTestId("mode-control"));

  expect(onFold).not.toHaveBeenCalled();
  expect(onCheckOrCall).not.toHaveBeenCalled();
  expect(onRaise).not.toHaveBeenCalled();
  expect(view.queryByTestId("all-in-sheet")).toBeNull();
  expect(onLeading).toHaveBeenCalledTimes(1);
});

test("draws one plate per pot, each with only its own chips and who can win it", async () => {
  const view = await renderScreen();

  expect(view.getByTestId("pot")).toBeOnTheScreen();
  expect(view.getByTestId("pot-total")).toHaveTextContent("60");
  expect(view.queryByTestId("side-pot-0")).toBeNull();

  const [alex, bree, cam] = FOUR_PLAYER_FLOP_FIXTURE.players.flatMap((player) => (player ? [player] : []));
  await view.rerender(
    <GameScreen
      balance={LOADING_BALANCE}
      game={{
        ...FOUR_PLAYER_FLOP_FIXTURE,
        pot: 230,
        pots: [
          { amount: 90, eligible: [alex!.id, bree!.id, cam!.id] },
          { amount: 140, eligible: [bree!.id, cam!.id] },
        ],
      }}
      onBack={jest.fn()}
    />,
  );

  // The headline is the main pot's own chips, not the 230 on the table.
  expect(view.getByTestId("pot-total")).toHaveTextContent("90");
  expect(view.getByTestId("side-pot-amount-0")).toHaveTextContent("140");
  expect(view.getByTestId("pot-plate-main")).toHaveProp(
    "accessibilityLabel",
    "Main pot, 90 chips. Magnus, Ellis and Jay can win it.",
  );
  expect(view.getByTestId("side-pot-0")).toHaveProp(
    "accessibilityLabel",
    "Side pot, 140 chips. Ellis and Jay can win it.",
  );
});

test("keeps blinds visible with side pots on a portrait tablet", async () => {
  const original = Dimensions.get("window");
  const window = { ...original, width: 768, height: 1024 };
  Dimensions.set({ window, screen: window });
  try {
    const view = await renderScreen({
      game: {
        ...FOUR_PLAYER_FLOP_FIXTURE,
        pot: 230,
        pots: [
          { amount: 90, eligible: ["magnus", "ellis", "jay"] },
          { amount: 140, eligible: ["ellis", "jay"] },
        ],
      },
      onBack: jest.fn(),
    });
    expect(view.getByTestId("side-pot-0")).toBeOnTheScreen();
    expect(view.getByTestId("felt-blinds")).toHaveTextContent("BLINDS 10 / 20");
  } finally {
    await act(() => Dimensions.set({ window: original, screen: original }));
  }
});

describe("landscape", () => {
  const original = Dimensions.get("window");
  afterEach(() => {
    Dimensions.set({ window: original, screen: original });
  });

  // Phone landscape is the tight case: every control the tutorial points at has to still be drawn.
  test("keeps the table, rack and every betting control on a phone on its side", async () => {
    const window = { ...original, width: 800, height: 390 };
    Dimensions.set({ window, screen: window });
    const view = await renderScreen({ rackActions: <Text>RACK ACTIONS</Text> });

    expect(view.getByTestId("poker-table")).toBeOnTheScreen();
    expect(view.getByText("RACK ACTIONS")).toBeOnTheScreen();
    for (const id of ["action-fold", "action-check-call", "action-raise"]) {
      expect(view.getByTestId(id)).toBeOnTheScreen();
    }
  });

  test("opens the wager slider from RAISE on a phone on its side", async () => {
    const window = { ...original, width: 852, height: 393 };
    Dimensions.set({ window, screen: window });
    const onRaise = jest.fn();
    const view = await renderScreen({ onRaise });
    expect(view.queryByTestId("wager-slider")).toBeNull();

    await fireEvent.press(view.getByTestId("action-raise"));
    await fireEvent.press(view.getByTestId("wager-preset-minimum"));
    await fireEvent.press(view.getByTestId("action-wager"));
    expect(onRaise).toHaveBeenCalledWith(FOUR_PLAYER_FLOP_FIXTURE.betting.minRaise);
  });
});

test.each<[string, BalanceView, string]>([
  ["a free-play table's stacks practice chips", FREE_PLAY, "Ellis, 980 practice chips"],
  ["an online table's stacks plain chips", { state: "ready", amount: 1240 }, "Ellis, 980 chips"],
])("names %s", async (_name, balance, label) => {
  const view = await renderScreen({ balance });

  expect(view.getByLabelText(label)).toBeOnTheScreen();
});
