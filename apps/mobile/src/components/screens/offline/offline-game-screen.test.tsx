import { act, fireEvent, render, type RenderResult } from "@testing-library/react-native";

import type { Tile } from "@wordpoker/contracts";
import { WORD_WINDOW_MS, dealHand, type Dictionary } from "@wordpoker/game-rules";

import { FOUR_PLAYER_FLOP_FIXTURE } from "@/components/screens/game/game-fixtures";
import { testDictionary } from "@/lib/dictionary-fixtures";
import { useOfflineGame, type OfflineGame } from "@/lib/use-offline-game";

import { OfflineGameScreen } from "./offline-game-screen";

// The session's end-state is a property of the state the hook maps, and a real session only
// reaches it by busting the hero — a hand the tests cannot deal without rigging the deck. The
// one test that needs it injects the mapped state; every other test runs the hook for real,
// which is why the mock delegates to it by default.
jest.mock("@/lib/use-offline-game", () => {
  const actual = jest.requireActual<{ useOfflineGame: typeof useOfflineGame }>("@/lib/use-offline-game");
  return { ...actual, useOfflineGame: jest.fn(actual.useOfflineGame) };
});

// `useSafeAreaInsets` throws without a provider, and the shipped provider needs native
// views. The library's own mock stands in, with zero insets.
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock")
    .default,
);

// expo-router reaches a navigation package Jest cannot parse. The screen reads `router` from
// the HUD's leave handler, and the table's seed from the route's params — the URL is the one
// thing that can pin the hand it plays.
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() },
  useLocalSearchParams: () => ({ seed: mockSeedParam }),
}));

// The suite's reanimated mock has no `useReducedMotion` — the library ships it as a TODO —
// and the word tile reads it, so the one hook is layered on for this screen.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

/**
 * The seed the URL pins, and the hero's own two tiles under it: `mockSeedParam` below is what
 * the screen reads, so this is the hand every test but the unpinned one plays. A table the URL
 * does not pin draws its own seed (`@/lib/offline-seed`), and a drawn seed is not knowable in
 * advance, so the draw is stood in for with {@link DRAWN_SEED}.
 */
const SEED = 20_260_919;

const HERO_TILES: readonly Tile[] = dealHand({ seed: SEED, playerCount: 4 }).privateTiles[0] ?? [];

/** The seed the app's own randomness hands an unpinned table — a different hand. */
const DRAWN_SEED = 12_345;

const DRAWN_TILES: readonly Tile[] =
  dealHand({ seed: DRAWN_SEED, playerCount: 4 }).privateTiles[0] ?? [];

/** What the route's params say, when they say anything: an absent seed is what a draw is for. */
let mockSeedParam: string | undefined = String(SEED);

const mockRandomSeed = jest.fn(() => DRAWN_SEED);

// The port is the real one — a pinned seed has to parse for the pinned hand to be dealt — and
// only the draw is stood in for.
jest.mock("@/lib/offline-seed", () => ({
  ...jest.requireActual<Record<string, unknown>>("@/lib/offline-seed"),
  randomSeed: () => mockRandomSeed(),
}));

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

/** The ids of the tiles the strip is holding, in the order it holds them. */
function stripTiles(view: RenderResult): string[] {
  return view
    .getAllByTestId(/^word-builder-tile-/)
    .map((tile) => String(tile.props.testID).replace("word-builder-tile-", ""));
}

/**
 * Takes the hero's turn the way the felt's row offers it: the check when nothing is owed, the
 * call when a bot has bet. The row arms exactly one of the two, and which one it is comes from
 * the engine's own bounds — never from the test's guess about the seed.
 */
async function takeTurn(view: RenderResult) {
  const check = view.queryByText("CHECK");
  if (check) {
    await fireEvent.press(check);
    return;
  }
  await fireEvent.press(view.getByText(/^CALL \$[\d,]+$/));
}

/**
 * Taps the hero's turn until the river's close opens §19's window. The room between the two
 * is read off the row itself: while a betting round is open the hero holds either a check or
 * a call worth taking, and once the window opens the row goes dark (its call button falls
 * back to `CALL $0`) until there is a word to confirm.
 */
async function advanceToWordWindow(view: RenderResult) {
  for (let step = 0; step < 30; step += 1) {
    if (!view.queryByText("CHECK") && !view.queryByText(/^CALL \$[1-9][\d,]*$/)) return;
    await takeTurn(view);
  }
  throw new Error("the window never opened");
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
    mockSeedParam = String(SEED);
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

  test("deals a hand and puts the hero on the clock, with the row the engine armed", async () => {
    const view = await renderTable();

    expectBoard(view, 0);
    expect(view.getByText("PHASE 2 · PRE-FLOP")).toBeOnTheScreen();
    expect(view.getByText("YOUR TURN")).toBeOnTheScreen();
    // The badge only lands on the felt if the mapped state flags the hero's seat.
    expect(view.getByText(/· YOU/)).toBeOnTheScreen();

    // The pinned hand's first bot opens for 60, so the felt states a real call and a real pot
    // — the numbers the engine counted, not a placeholder row.
    expect(view.getByText("CALL $60")).toBeOnTheScreen();
    expect(view.getByTestId("pot")).toHaveTextContent(/\$60/);
    expect(view.getByText("ALL IN · $1,000")).toBeOnTheScreen();
  });

  test("deals its own drawn hand for a table the URL does not pin", async () => {
    mockSeedParam = undefined;

    const view = await renderTable();

    // The felt's rack is the strip, so the seat's tiles are the deal the app drew — not the
    // hand every visit was handed while the seed was a constant. The two fixtures are
    // different hands, so this is the draw and not the pinned deal wearing other tiles.
    expect(stripTiles(view)).toEqual(DRAWN_TILES.map((tile) => tile.id));
    expect(DRAWN_TILES.map((tile) => tile.id)).not.toEqual(HERO_TILES.map((tile) => tile.id));
  });

  test("fills the board a street per hero action, the bots acting without one", async () => {
    const view = await renderTable();

    const streets: [dealt: number, phase: string][] = [
      [3, "PHASE 3 · THE FLOP"],
      [4, "PHASE 4 · THE TURN"],
      [5, "PHASE 5 · THE RIVER"],
    ];

    for (const [dealt, phase] of streets) {
      await takeTurn(view);

      // The hero takes their own turn; the bots' turns and the street roll that follows
      // are in the same transition, so one action is one street.
      expectBoard(view, dealt);
      expect(view.getByText(phase)).toBeOnTheScreen();
    }
  });

  test("keeps the felt's row as the whole control surface", async () => {
    const view = await renderTable();

    // The builder brings no buttons of its own, and nothing of its drawing either until the
    // strip spells something: the row is fold, the call, the wager and the all-in, with the
    // shuffle at its head. No second row of word or round buttons exists.
    expect(view.queryByTestId("word-preview")).toBeNull();
    expect(view.getByTestId("word-builder-shuffle")).toBeOnTheScreen();
    expect(view.getByText("FOLD")).toBeOnTheScreen();
    expect(view.getByText("CALL $60")).toBeOnTheScreen();
    expect(view.getByText("RAISE $120")).toBeOnTheScreen();
    expect(view.getByTestId("all-in-button")).toBeOnTheScreen();
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

  test("plays a word from the rack, then pays out through the results into the next hand", async () => {
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

    // The payoff of the hand is the results, over the felt: the table's own Deal is gone, and
    // the surface's primary is the only one left (STO-379 decisions 2 and 4).
    expect(view.queryByText("Deal")).toBeNull();
    expect(view.getByText(`HAND #1 · RESULTS`)).toBeOnTheScreen();
    // The pot is inside the headline's one accessibility node, so it is hidden from the tree by
    // design — the query has to say so (STO-387).
    expect(view.getByTestId("results-pot", { includeHiddenElements: true })).toBeOnTheScreen();
    // Every seat is counted: the table's shape, and how many of them played a word (§20).
    expect(view.getByTestId("results-summary")).toHaveTextContent(
      "4 PLAYERS · 0 FOLDS · 1 WORD PLAYED",
    );

    // The entrance's one hand-off to React lands a tick after the surface mounts — on a suite
    // that owns the clock, that tick is one of its own timers, so it has to be advanced before
    // the primary is live.
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(view.getByTestId("results-deal").props.accessibilityState).toMatchObject({
      disabled: false,
    });

    await fireEvent.press(view.getByTestId("results-deal"));

    expect(view.getByText("PHASE 2 · PRE-FLOP")).toBeOnTheScreen();
    expectBoard(view, 0);
    // Nothing of the results is left on screen — or reachable to a second tap.
    expect(view.queryByTestId("results-deal")).toBeNull();
    expect(view.queryByTestId("results-main-menu")).toBeNull();
    expect(view.queryByText("HAND #1 · RESULTS")).toBeNull();

    jest.useRealTimers();
  });

  test("leaves the table where it was when a disabled control is pressed in the window", async () => {
    jest.useFakeTimers();

    const view = await renderTable();
    await advanceToWordWindow(view);

    // The window is open and the hero has nothing to confirm yet, so the row is the table's
    // own controls gone quiet: the call button falls back to `CALL $0` and does nothing.
    await fireEvent.press(view.getByText("CALL $0"));

    expect(view.getByText("PHASE 5 · THE RIVER")).toBeOnTheScreen();
    expect(view.queryByText("PHASE 6 · PAYOUT")).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });

    expect(view.getByText("PHASE 5 · THE RIVER")).toBeOnTheScreen();
    expect(view.queryByText("PHASE 6 · PAYOUT")).toBeNull();

    jest.useRealTimers();
  });

  test("shows the session's end-state over the felt, and New game restarts it", async () => {
    const newGame = jest.fn();
    const over: OfflineGame = {
      game: {
        ...FOUR_PLAYER_FLOP_FIXTURE,
        id: "offline-9-payout-done",
        phase: "payout",
        phaseNumber: 6,
        sessionOver: true,
      },
      words: null,
      // The session's last hand keeps its end-of-session sheet rather than the results: a New
      // game is the only useful thing left to offer once the hero has busted (ADR 0002).
      results: null,
      deal: jest.fn(),
      fold: jest.fn(),
      check: jest.fn(),
      bet: jest.fn(),
      call: jest.fn(),
      raiseTo: jest.fn(),
      allIn: jest.fn(),
      setDraft: jest.fn(),
      confirmWord: jest.fn(),
      sessionOver: true,
      newGame,
    };
    jest.mocked(useOfflineGame).mockReturnValueOnce(over);

    const view = await renderTable();

    expect(view.getByTestId("session-over")).toBeOnTheScreen();
    expect(view.getByText("SESSION OVER")).toBeOnTheScreen();
    // Every seat's final Table Stack, not just the winner's.
    expect(view.getByText("Magnus · $980")).toBeOnTheScreen();
    expect(view.getByText("Mira · $980")).toBeOnTheScreen();

    await fireEvent.press(view.getByTestId("new-game-button"));

    expect(newGame).toHaveBeenCalledTimes(1);
  });
});
