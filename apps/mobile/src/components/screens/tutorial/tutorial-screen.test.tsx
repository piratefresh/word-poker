import { fireEvent, render, type RenderResult } from "@testing-library/react-native";

import {
  advanceLessonRound,
  communityPhase,
  firstLessonRound,
  openLessonTurn,
  TutorialScreen,
} from "./tutorial-screen";

jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock")
    .default,
);

// expo-router reaches a navigation package Jest cannot parse. The screen only touches
// `router` from its leave handler.
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() },
}));

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

/**
 * `@expo/ui` buttons render as native adapter views: no text node, no button role, just
 * the props the native control receives. `label` and the disabled modifier are on that
 * host element, so the lesson's controls are located and inspected through them.
 */
function lessonButton(view: RenderResult, label: string): NonNullable<RenderResult["root"]> {
  const [node] = view.root!.queryAll((candidate) => candidate.props?.label === label);
  if (!node) throw new Error(`No lesson button labelled ${label}`);
  return node;
}

/** `@expo/ui` encodes `disabled` as a modifier rather than a plain prop. */
function isButtonDisabled(node: NonNullable<RenderResult["root"]>) {
  return (node.props.modifiers ?? []).some(
    (modifier: { $type: string; disabled?: boolean }) =>
      modifier.$type === "disabled" && modifier.disabled === true,
  );
}

/**
 * The board's phase, at and around each boundary. Off by one here shows the player the
 * wrong phase for a whole street, which is the kind of thing that survives a glance.
 */
describe("communityPhase", () => {
  test.each([
    [0, "preflop"],
    [1, "flop"],
    [2, "flop"],
    [3, "flop"],
    [4, "turn"],
    [5, "river"],
  ])("counts %p dealt tiles as %p", (dealt, phase) => {
    expect(communityPhase(dealt)).toBe(phase);
  });

  test("stays on the river if the count runs past the board", () => {
    expect(communityPhase(9)).toBe("river");
  });
});

describe("<TutorialScreen />", () => {
  test("mounts the in-hand HUD over the felt", async () => {
    const view = await render(<TutorialScreen />);

    expect(view.getByText("PHASE 2 · PRE-FLOP")).toBeOnTheScreen();
    expect(view.getByLabelText("Balance unavailable")).toBeOnTheScreen();
  });

  test("arms the first round held on mount, so the clock freezes at the budget", async () => {
    const view = await render(<TutorialScreen />);

    // One clock, in the top bar: 30_000ms → "00:30". Deterministic: a paused turn pins to
    // pausedAtMs and cannot tick.
    expect(view.getAllByText("00:30")).toHaveLength(1);
    expect(view.queryByText("--:--")).toBeNull();
  });

  test("continuing the held round starts its clock", async () => {
    const view = await render(<TutorialScreen />);

    await fireEvent.press(lessonButton(view, "Continue"));

    // The round is running, so the lesson's only control stands down: the native control
    // is handed `disabled` until the street's clock expires.
    expect(isButtonDisabled(lessonButton(view, "Continue"))).toBe(true);
  });

  test("offers exactly one way back to the picker", async () => {
    const view = await render(<TutorialScreen />);

    // The lesson's own Back button was removed when the HUD landed: the HUD's leave slot
    // is the affordance the real game screen has, so a second one would not be a preview
    // of anything.
    expect(view.getAllByRole("button", { name: "Leave the table" })).toHaveLength(1);
    expect(view.queryByRole("button", { name: "Back" })).toBeNull();
  });
});

describe("firstLessonRound", () => {
  test("starts the lesson on the first hand's first street, held", () => {
    expect(firstLessonRound()).toEqual({ hand: 1, phaseIndex: 0, running: false });
  });
});

describe("advanceLessonRound", () => {
  test.each([
    [0, 1, 1], // preflop → flop
    [1, 1, 2], // flop → turn
    [2, 1, 3], // turn → river
    [3, 1, 4], // river → payout
  ])("advances street %p of hand %p to street %p, held", (from, hand, to) => {
    expect(advanceLessonRound({ hand, phaseIndex: from, running: true })).toEqual({
      hand,
      phaseIndex: to,
      running: false,
    });
  });

  test("payout rolls into a fresh hand's preflop, held", () => {
    expect(advanceLessonRound({ hand: 1, phaseIndex: 4, running: true })).toEqual({
      hand: 2,
      phaseIndex: 0,
      running: false,
    });
  });
});

describe("openLessonTurn", () => {
  test("freezes a held round at its budget", () => {
    const turn = openLessonTurn({ hand: 1, phaseIndex: 0, running: false }, 1_000);
    expect(turn.key).toBe("hold-1-preflop");
    expect(turn.timing).toEqual({ startedAtMs: 1_000, endsAtMs: 31_000, pausedAtMs: 1_000 });
  });

  test("anchors a running round at the shared clock's reading", () => {
    const turn = openLessonTurn({ hand: 1, phaseIndex: 0, running: true }, 1_000);
    expect(turn.key).toBe("run-1-preflop:30");
    expect(turn.timing).toEqual({ startedAtMs: 1_000, endsAtMs: 31_000, pausedAtMs: null });
  });

  test("names every round instance a fresh turn", () => {
    const keys = new Set([
      openLessonTurn({ hand: 1, phaseIndex: 0, running: false }, 1_000).key,
      openLessonTurn({ hand: 1, phaseIndex: 0, running: true }, 1_000).key,
      openLessonTurn({ hand: 1, phaseIndex: 1, running: false }, 1_000).key,
      openLessonTurn({ hand: 2, phaseIndex: 0, running: false }, 1_000).key,
    ]);
    expect(keys.size).toBe(4);
  });
});
