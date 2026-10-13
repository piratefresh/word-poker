import { act, fireEvent, render } from "@testing-library/react-native";

import type { Dictionary } from "@wordpoker/game-rules";

import { LESSON_TOUR } from "@/components/onboarding/tours";
import { testDictionary } from "@/test-support/dictionary-fixtures";

import { TutorialScreen } from "./tutorial-screen";

// The same stand-ins the offline table's suite uses: a safe area with no native views, a router
// Jest can parse, and the one reduced-motion hook the reanimated mock lacks.
jest.mock("@/components/screens/results/simple-win-preload", () => ({ preloadSimpleWin: jest.fn() }));
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock").default,
);
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() },
  useFocusEffect: () => undefined,
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

// The results surface this screen presents reads the provider for its completion chips; the
// real module pulls in Better Auth's client, which Jest cannot parse.
jest.mock("@/lib/quests-provider", () => ({
  useQuests: () => ({ lastCompletions: [], reportHand: jest.fn() }),
}));

let mockDictionary: Dictionary | null = testDictionary(["BROWN", "GONER"]);
jest.mock("@/features/table/use-dictionary", () => ({
  useDictionary: () => mockDictionary,
}));

const FELT_BOX = { nativeEvent: { layout: { width: 360, height: 320 } } };

beforeEach(() => {
  jest.useFakeTimers();
  mockDictionary = testDictionary(["BROWN", "GONER"]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("<TutorialScreen />", () => {
  it("waits for the dictionary before setting the table", async () => {
    mockDictionary = null;
    const view = await render(<TutorialScreen />);
    expect(view.getByText("Setting the table…")).toBeOnTheScreen();
  });

  it("deals the lesson on the shared felt, with the coach on its first step", async () => {
    const view = await render(<TutorialScreen />);
    await fireEvent(view.getByTestId("poker-table", { includeHiddenElements: true }), "layout", FELT_BOX);

    expect(view.getByTestId("action-check-call")).toBeTruthy();
    expect(view.getByTestId("word-builder-strip")).toBeTruthy();
    expect(view.getByText("Your seat")).toBeTruthy();
    expect(view.getByTestId("coach-count")).toHaveTextContent(`1/${LESSON_TOUR.length}`);
  });

  it("swaps the lesson's card for the felt's How to play, and back", async () => {
    const view = await render(<TutorialScreen />);

    await fireEvent.press(view.getByLabelText("How to play"));
    expect(view.getByText("HELPER")).toBeTruthy();
    expect(view.getByText("Community letters")).toBeTruthy();

    await fireEvent.press(view.getByTestId("coach-close"));
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(view.getByText("Your seat")).toBeTruthy();
  });
});
