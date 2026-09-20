import { act, fireEvent, render, type RenderResult } from "@testing-library/react-native";

import type { Tile } from "@wordpoker/contracts";
import { WORD_WINDOW_MS, dealHand, type Dictionary } from "@wordpoker/game-rules";

import { testDictionary } from "@/lib/dictionary-fixtures";
import { OFFLINE_SEED } from "@/lib/use-offline-game";

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
 * The hero's own two tiles, as the offline deal will give them, and the word they spell.
 * The screen deals for itself, so the fixture has to read the same deal the hook makes.
 */
const HERO_TILES: readonly Tile[] = dealHand({ seed: OFFLINE_SEED, playerCount: 4 }).privateTiles[0] ?? [];

const HERO_WORD = HERO_TILES.map((tile) =>
  "sequenceLetter" in tile ? `${tile.letter}${tile.sequenceLetter}` : tile.letter,
).join("");

/** The table's vocabulary, injected: the drawer this screen loads holds the hero's word. */
let mockDictionary: Dictionary | null = testDictionary([HERO_WORD]);

jest.mock("@/lib/use-dictionary", () => ({
  useDictionary: () => mockDictionary,
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

/** Four taps walk preflop → flop → turn → river; the river's close opens §19's window. */
async function advanceToWordWindow(view: RenderResult) {
  for (let street = 0; street < 4; street += 1) {
    await fireEvent.press(view.getByText("CHECK"));
  }
}

/** The hero plays both of its tiles and locks the word in — §19's window turns check into confirm. */
async function buildHeroWord(view: RenderResult) {
  for (const tile of HERO_TILES) {
    await fireEvent.press(view.getByTestId(`word-builder-tile-${tile.id}`));
  }
  await fireEvent.press(view.getByText("CHECK"));
}

describe("<OfflineGameScreen />", () => {
  beforeEach(() => {
    mockDictionary = testDictionary([HERO_WORD]);
  });

  test("holds the table until the dictionary is in hand", async () => {
    mockDictionary = null;

    // No felt to measure yet: this is the state the screen is in before the list arrives.
    const view = await render(<OfflineGameScreen />);

    // §11 wants the word list on screen before play, and the hand is judged against it, so
    // the felt does not draw until it has arrived.
    expect(view.getByText("Setting the table…")).toBeOnTheScreen();
    expect(view.queryByText("PHASE 2 · PRE-FLOP")).toBeNull();
  });

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
      await fireEvent.press(view.getByText("CHECK"));

      // The hero taps their own turn; the bots' turns and the street roll that follows
      // are in the same transition, so one tap is one street.
      expectBoard(view, dealt);
      expect(view.getByText(phase)).toBeOnTheScreen();
    }
  });

  test("keeps the felt's row as the whole control surface", async () => {
    const view = await renderTable();

    // The builder brings no buttons of its own, and nothing of its drawing either until the
    // strip spells something: the row is fold, check and the bet with the shuffle at its head.
    expect(view.queryByTestId("word-preview")).toBeNull();
    expect(view.getByTestId("word-builder-shuffle")).toBeOnTheScreen();
    expect(view.getByText("FOLD")).toBeOnTheScreen();
    expect(view.getByText("CHECK")).toBeOnTheScreen();
    expect(view.queryByText("Advance")).toBeNull();
    expect(view.queryByText("Confirm")).toBeNull();
    expect(view.queryByText("Clear")).toBeNull();
  });

  test("reads the draft above the rack once there is one", async () => {
    const view = await renderTable();
    const first = HERO_TILES[0]!;

    await fireEvent.press(view.getByTestId(`word-builder-tile-${first.id}`));

    // One line of text over the rack, and nothing but the line: the strip below it is the
    // word, so the preview only has to be legible.
    const letters = "sequenceLetter" in first ? `${first.letter}${first.sequenceLetter}` : first.letter;
    expect(view.getByTestId("word-builder-word")).toHaveTextContent(letters);
  });

  test("plays a word from the rack, then pays out and deals the next hand", async () => {
    // §19's window is a clock, and a clock is what this test has to own: a seat that never
    // confirms — here, a bot whose tiny vocabulary holds nothing it can spell — leaves the
    // window to run out, and the hook's own timer is what settles it.
    jest.useFakeTimers();

    const view = await renderTable();
    await advanceToWordWindow(view);

    await buildHeroWord(view);

    await act(async () => {
      jest.advanceTimersByTime(WORD_WINDOW_MS + 100);
    });

    expect(view.getByText("PHASE 6 · PAYOUT")).toBeOnTheScreen();
    expect(view.getAllByText("WINNER")).toHaveLength(1);

    await fireEvent.press(roundButton(view, "Deal"));

    expect(view.getByText("PHASE 2 · PRE-FLOP")).toBeOnTheScreen();
    expectBoard(view, 0);

    jest.useRealTimers();
  });

  test("leaves the round where it was when a disabled betting control is pressed", async () => {
    const view = await renderTable();

    await fireEvent.press(view.getByText("FOLD"));

    expect(view.getByText("PHASE 2 · PRE-FLOP")).toBeOnTheScreen();
    expectBoard(view, 0);
  });
});
