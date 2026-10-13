import { fireEvent, render } from "@testing-library/react-native";
import { useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { resultsEntrance } from "@/constants/theme";

import { ResultsActions } from "./results-actions";
import { ResultsScreen } from "./results-screen";
import { snapshotFixture } from "./results-fixtures";

// The suite's reanimated mock has no `useReducedMotion` — the library ships it as a TODO —
// and both the tiles and the entrance read it, so the one hook is layered on here. `withTiming`
// is spied on: the entrance's clock is the thing under test, not the animations it starts.
jest.mock("react-native-reanimated", () => {
  const mock = jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock");
  return {
    ...mock,
    useReducedMotion: jest.fn(() => false),
    withTiming: jest.fn(mock.withTiming as (...args: unknown[]) => unknown),
  };
});

// `useSafeAreaInsets` throws without a provider, and the shipped provider needs native views.
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock").default,
);

// The rating card is its own surface with its own tests; the screen under test only has to
// place it, and its POST must never run from a test that is not about it.
jest.mock("./results-rating", () => ({
  sendResultsRating: jest.fn(async () => ({ id: "rating-1" })),
  RATING_TAGS: ["Gameplay", "Scoring", "Pacing", "Visuals", "Bug", "Suggestion"],
  RATING_NOTE_MAX: 500,
}));

// The provider is its own surface with its own tests; this one only has to draw whatever
// `lastCompletions` it holds, and the real module pulls in Better Auth's client, which Jest
// cannot parse.
let mockLastCompletions: readonly string[] = [];
jest.mock("@/lib/quests-provider", () => ({
  useQuests: () => ({ lastCompletions: mockLastCompletions }),
}));

const reduced = jest.mocked(useReducedMotion);
const timing = jest.mocked(withTiming);

beforeEach(() => {
  mockLastCompletions = [];
});

beforeEach(() => {
  reduced.mockReturnValue(false);
  timing.mockClear();
});

/** The surface, over a fixture hand, with the two exits counted. */
async function renderResults(snapshot = snapshotFixture()) {
  const onDeal = jest.fn();
  const onExit = jest.fn();

  const view = await render(<ResultsScreen onDeal={onDeal} onExit={onExit} snapshot={snapshot} />);
  return { view, onDeal, onExit, snapshot };
}

describe("<ResultsScreen />", () => {
  test("freezes the hand it was opened on", async () => {
    const { view } = await renderResults();

    // The table deals behind the surface: the adapter hands over a different hand's numbers.
    const next = snapshotFixture({ hand: 19, pot: 240 });
    await view.rerender(
      <ResultsScreen onDeal={jest.fn()} onExit={jest.fn()} snapshot={next} />,
    );

    // Nothing on screen follows it: the caption and the pot are the frozen hand's.
    expect(view.getByText("HAND #18 · RESULTS")).toBeOnTheScreen();
    // The pot sits inside the headline's one accessibility node, so it is hidden from the tree
    // by design — the query has to say so.
    expect(view.getAllByText("$80", { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(view.queryByText("HAND #19 · RESULTS")).toBeNull();
    expect(view.queryByText("$240", { includeHiddenElements: true })).toBeNull();
  });

  test("runs the entrance off one clock, started once", async () => {
    /** The sequence's own clock, told apart from the tiles' own flips and lifts. */
    const clockStarts = () =>
      timing.mock.calls.filter(
        ([, config]) =>
          (config as { duration?: number } | undefined)?.duration === resultsEntrance.total,
      ).length;

    const { view } = await renderResults();

    expect(clockStarts()).toBe(1);

    // A re-render is not a re-entry: the beats that have already run do not start again.
    await view.rerender(
      <ResultsScreen onDeal={jest.fn()} onExit={jest.fn()} snapshot={snapshotFixture()} />,
    );

    expect(clockStarts()).toBe(1);
  });

  test("leaves for the next hand from the results' own primary", async () => {
    const { view, onDeal } = await renderResults();

    await fireEvent.press(view.getByTestId("results-deal"));

    expect(onDeal).toHaveBeenCalledTimes(1);
  });

  test("leaves the table from Main menu, and from Android's back", async () => {
    const { view, onExit } = await renderResults();

    await fireEvent.press(view.getByTestId("results-main-menu"));
    expect(onExit).toHaveBeenCalledTimes(1);

    // The Modal's own close request is what the platform's back gesture reaches: the same exit,
    // so a hand that has paid out is never re-entered by backing into it.
    await fireEvent(view.getByTestId("results-modal"), "requestClose");
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  test("shows a chip per completed quest, and none at all when nothing completed", async () => {
    const { view } = await renderResults();
    expect(view.queryByTestId("quest-completions")).toBeNull();

    mockLastCompletions = ["win-word-3"];
    const withCompletion = await renderResults();
    expect(withCompletion.view.getByTestId("quest-complete-win-word-3")).toHaveTextContent(
      "★ TRIPLE THREAT · +75",
    );
  });

  test("goes quiet under Reduce Motion: final values, live primary", async () => {
    reduced.mockReturnValue(true);
    const { view, onDeal } = await renderResults();

    // The sequence never runs: the clock is where it would have ended, so the pot is already
    // the exact amount and the primary is live on the first frame. No beat is started at all.
    const started = timing.mock.calls.map(([, config]) => config);
    expect(started).not.toContainEqual(
      expect.objectContaining({ duration: resultsEntrance.total }),
    );
    expect(view.getAllByText("$80", { includeHiddenElements: true }).length).toBeGreaterThan(0);

    await fireEvent.press(view.getByTestId("results-deal"));
    expect(onDeal).toHaveBeenCalledTimes(1);
  });
});

describe("<ResultsActions />", () => {
  test("updates the replay count while keeping the scoreboard frozen", async () => {
    const snapshot = snapshotFixture({ pot: 80 });
    const onDeal = jest.fn();
    const view = await render(<ResultsScreen snapshot={snapshot} onDeal={onDeal} onExit={jest.fn()} replay={{ requested: 0, total: 4 }} />);
    expect(view.getByTestId("results-deal")).toHaveTextContent("PLAY ANOTHER 0/4");
    await view.rerender(<ResultsScreen snapshot={snapshotFixture({ pot: 240 })} onDeal={onDeal} onExit={jest.fn()} replay={{ requested: 1, total: 4 }} />);
    expect(view.getByTestId("results-deal")).toHaveTextContent("PLAY ANOTHER 1/4");
    expect(view.getByTestId("results-deal").props.accessibilityLabel).toContain("1 of 4 players");
    expect(view.queryByText("$240", { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(view.getByTestId("results-deal"));
    expect(onDeal).toHaveBeenCalledTimes(1);
  });

  /** The row on its own, so the gate can be held on either side of the sequence settling. */
  async function renderActions(ready: boolean) {
    const onDeal = jest.fn();
    function Actions() {
      return <ResultsActions clock={useSharedValue(1)} onDeal={onDeal} onExit={jest.fn()} ready={ready} />;
    }
    const view = await render(<Actions />);
    return { view, onDeal };
  }

  test("is inert until the sequence settles, then deals exactly once", async () => {
    const waiting = await renderActions(false);
    await fireEvent.press(waiting.view.getByTestId("results-deal"));
    await fireEvent.press(waiting.view.getByTestId("results-deal"));

    // A disabled control is a fact about the screen: the press never reaches the handler.
    expect(waiting.onDeal).not.toHaveBeenCalled();
    expect(waiting.view.getByTestId("results-deal").props.accessibilityState).toMatchObject({
      disabled: true,
    });

    // Once the clock settles the same press is the deal — and the surface it lives on is gone
    // by the time a second tap could land (the host unmounts it with the next hand).
    const live = await renderActions(true);
    await fireEvent.press(live.view.getByTestId("results-deal"));
    expect(live.onDeal).toHaveBeenCalledTimes(1);
    expect(live.view.getByTestId("results-deal").props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });
});
