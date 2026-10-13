import { act, fireEvent, render, within, type RenderResult } from "@testing-library/react-native";

import type { Tile } from "@wordpoker/contracts";
import { dealHand, type Dictionary } from "@wordpoker/game-rules";

import { FOUR_PLAYER_FLOP_FIXTURE } from "@/components/screens/game/game-fixtures";
import { duration } from "@/constants/theme";
import { testDictionary } from "@/test-support/dictionary-fixtures";
import { useOfflineGame, type OfflineGame } from "@/features/offline/use-offline-game";
import { WordBuilder } from "@/components/word-builder";
import { POWER_USED_BEATS } from "@/components/powers/power-used";


import { OfflineGameScreen } from "./offline-game-screen";

// Keep the Continue interaction real while omitting Rive's native renderer.
jest.mock("@/components/screens/results/simple-win-preload", () => ({ preloadSimpleWin: jest.fn() }));
jest.mock("@/components/screens/results/simple-win-result-rive", () => ({
  SimpleWinResultRive: () => null,
}));

// The community counter is the felt looks' label; the tabletop room draws no label band.

// The session's end-state is a property of the state the hook maps, and a real session only
// reaches it by busting the hero — a hand the tests cannot deal without rigging the deck. The
// one test that needs it injects the mapped state; every other test runs the hook for real,
// which is why the mock delegates to it by default.
jest.mock("@/features/offline/use-offline-game", () => {
  const actual = jest.requireActual<{ useOfflineGame: typeof useOfflineGame }>("@/features/offline/use-offline-game");
  return { ...actual, useOfflineGame: jest.fn(actual.useOfflineGame) };
});

jest.mock("@/components/word-builder", () => {
  const actual = jest.requireActual<typeof import("@/components/word-builder")>("@/components/word-builder");
  return { ...actual, WordBuilder: jest.fn(actual.WordBuilder) };
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
  useLocalSearchParams: () => ({ seed: mockSeedParam, powers: mockPowerParam }),
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

// The provider is its own surface with its own tests; this screen only has to call
// `reportHand` once per settled hand, and the real module pulls in Better Auth's client, which
// Jest cannot parse.
const mockReportHand = jest.fn();
jest.mock("@/lib/quests-provider", () => ({
  useQuests: () => ({ reportHand: mockReportHand, lastCompletions: [] }),
}));

/**
 * The seed the URL pins, and the hero's own two tiles under it: `mockSeedParam` below is what
 * the screen reads, so this is the hand every test but the unpinned one plays. A table the URL
 * does not pin draws its own seed (`@/features/offline/offline-seed`), and a drawn seed is not knowable in
 * advance, so the draw is stood in for with {@link DRAWN_SEED}.
 */
const SEED = 129;

const HERO_TILES: readonly Tile[] = dealHand({ seed: SEED, playerCount: 4 }).privateTiles[0] ?? [];

/** The seed the app's own randomness hands an unpinned table — a different hand. */
const DRAWN_SEED = 12_345;

const DRAWN_TILES: readonly Tile[] =
  dealHand({ seed: DRAWN_SEED, playerCount: 4 }).privateTiles[0] ?? [];

/** What the route's params say, when they say anything: an absent seed is what a draw is for. */
let mockSeedParam: string | undefined = String(SEED);
let mockPowerParam: string | undefined;

const mockRandomSeed = jest.fn(() => DRAWN_SEED);

// The port is the real one — a pinned seed has to parse for the pinned hand to be dealt — and
// only the draw is stood in for.
jest.mock("@/features/offline/offline-seed", () => ({
  ...jest.requireActual<Record<string, unknown>>("@/features/offline/offline-seed"),
  randomSeed: () => mockRandomSeed(),
}));

/** The word the hero's taps spell: every tile plays the face it prints first (§10). */
const HERO_WORD = HERO_TILES.map((tile) => tile.letter).join("");

/** The table's vocabulary, injected: the drawer this screen loads holds the hero's word. */
let mockDictionary: Dictionary | null = testDictionary([HERO_WORD]);

jest.mock("@/features/table/use-dictionary", () => ({
  useDictionary: () => mockDictionary,
}));

/**
 * The table measures itself, so a seat only exists once the felt has a size — Jest never
 * lays anything out, so the test supplies the measurement the platform would have sent.
 */
const FELT_BOX = { nativeEvent: { layout: { width: 360, height: 320 } } };

/** The CPU's beat, as the theme states it: one seat's action per beat, and the tests own it. */
const BEAT_MS = duration.cpuBeat;

/** One beat of the table's own clock, painted. */
async function beat() {
  await act(async () => {
    jest.advanceTimersByTime(BEAT_MS);
  });
}

/**
 * Whether §19's window is what the table is waiting on. Nobody is to act in the window — no seat
 * is thinking and the hero's own pill has stopped saying it is their turn — while the phase stays
 * the river.
 */
function windowIsOpen(view: RenderResult): boolean {
  return view.queryByText("THINKING...") === null && view.queryByText("YOUR TURN") === null;
}

/** Whether the hero's own action is what the felt is waiting on: their turn, or their word. */
function waitsOnTheHero(view: RenderResult): boolean {
  return view.queryByText("YOUR TURN") !== null || windowIsOpen(view);
}

/** Runs the CPU's turns, one beat at a time, until the felt is the hero's to move again. */
async function passedToTheHero(view: RenderResult) {
  for (let step = 0; step < 40 && !waitsOnTheHero(view); step += 1) {
    await beat();
  }
}

async function renderTable() {
  const view = await render(<OfflineGameScreen />);
  await fireEvent(view.getByTestId("poker-table", { includeHiddenElements: true }), "layout", FELT_BOX);
  // The deal leaves the first turn to a bot, and the felt says so — a seat thinking while the
  // hero's row is dark. Every test here reads the table once the CPU has played it to the hero.
  await passedToTheHero(view);
  return view;
}

/**
 * The felt's own row, reached by the ids its controls carry: the seat nameplates print CHECK,
 * CALL and FOLD as status as well, so a text selector for a control can land on a seat instead.
 */
function control(view: RenderResult, id: string) {
  return within(view.getByTestId(id));
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
 * The board's progress is reported by the community row on the felt.
 * The HUD carried a second counter there until it was removed, so this is the only
 * report on screen and a regression in either direction shows up here.
 */
function expectBoard(view: RenderResult, dealt: number) {
  expect(view.getByLabelText(`Community ${dealt}/5`)).toBeOnTheScreen();
}

/** The ids of the tiles the strip is holding, in the order it holds them. */
function stripTiles(view: RenderResult): string[] {
  return view
    .getAllByTestId(/^word-builder-tile-/)
    .map((tile) => String(tile.props.testID).replace("word-builder-tile-", ""));
}

/** The chips the felt draws in the middle, as the number it is showing. */
function potAmount(view: RenderResult): number {
  const [amount] = within(view.getByTestId("pot")).getAllByText(/^\$[\d,]+$/);
  return Number(String(amount?.props.children).replace(/[$,]/g, ""));
}

/**
 * Takes the hero's turn the way the felt's row offers it: the check when nothing is owed, the
 * call when a bot has bet. Which one the row names comes from the engine's own bounds — never
 * from the test's guess about the seed — and the CPU answers on the beats either side of it.
 */
async function takeTurn(view: RenderResult) {
  await passedToTheHero(view);
  await fireEvent.press(view.getByTestId("action-check-call"));
  await passedToTheHero(view);
}

/**
 * Taps the hero's turn until the river's close opens §19's window. The rooms between the two are
 * the CPU's own beats, so each pass waits for the hero to hold the table before it acts.
 */
async function advanceToWordWindow(view: RenderResult) {
  for (let step = 0; step < 30 && !windowIsOpen(view); step += 1) {
    await takeTurn(view);
  }
  expect(windowIsOpen(view)).toBe(true);
}

/** The hero plays both of its tiles and locks the word in — §19's window turns check into confirm. */
async function buildHeroWord(view: RenderResult) {
  for (const tile of HERO_TILES) {
    await fireEvent.press(view.getByTestId(`word-builder-tile-${tile.id}`));
  }
  await fireEvent.press(view.getByTestId("action-check-call"));
}

describe("<OfflineGameScreen />", () => {
  // The CPU plays on a timer, so the screen's tests run the table's clock themselves — the same
  // way the hook's suite does — and `passedToTheHero` is what advances it.
  beforeEach(() => {
    jest.useFakeTimers();
    mockDictionary = testDictionary([HERO_WORD]);
    mockSeedParam = String(SEED);
    mockPowerParam = undefined;
    mockReportHand.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("holds the table until the dictionary is in hand", async () => {
    mockDictionary = null;

    // No felt to measure yet: this is the state the screen is in before the list arrives.
    const view = await render(<OfflineGameScreen />);

    // §11 wants the word list on screen before play, and the hand is judged against it, so
    // the felt does not draw until it has arrived.
    expect(view.getByText("Setting the table…")).toBeOnTheScreen();
    expect(view.queryByText("PREFLOP")).toBeNull();
  });

  test("deals a hand and puts the hero on the clock, with the row the engine armed", async () => {
    const view = await renderTable();

    expectBoard(view, 0);
    expect(view.getByText("PREFLOP")).toBeOnTheScreen();
    expect(view.getByText("YOUR TURN")).toBeOnTheScreen();
    // The badge only lands on the felt if the mapped state flags the hero's seat.
    expect(view.getByText("YOU")).toBeOnTheScreen();

    // The pinned hand posts 10 / 20 and then raises to 60, so the felt states a real call and a
    // real pot — the numbers the engine counted, not a placeholder row.
    expect(view.getByRole("button", { name: "Call $60" })).toBeOnTheScreen();
    expect(view.getByTestId("pot")).toHaveTextContent(/\$90/);
    expect(control(view, "all-in-button").getByText("ALL IN")).toBeOnTheScreen();
  });

  test("queues the hero behind a real CPU card and holds its flip until its own card clears", async () => {
    mockSeedParam = "246";
    mockPowerParam = "wild";
    const heroRack = dealHand({ seed: 246, playerCount: 4 }).privateTiles[0] ?? [];
    mockDictionary = testDictionary([heroRack.map((tile) => tile.letter).join("")]);
    const view = await renderTable();
    const live = () => {
      const results = jest.mocked(useOfflineGame).mock.results;
      const last = results[results.length - 1];
      if (last?.type !== "return") throw new Error("the screen has no adapter");
      return last.value as OfflineGame;
    };
    const flip = () => jest.mocked(WordBuilder).mock.calls.at(-1)?.[0].swapFlip;
    await act(async () => live().pickPower("random_wild"));
    for (let step = 0; step < 4; step += 1) await beat();
    expect(within(view.getByTestId("power-used")).getByText("MIRA USED")).toBeOnTheScreen();
    expect(view.getByTestId("seat-power-tag-mira")).toHaveTextContent("MULLIGAN");
    expect(stripTiles(view)).not.toContain("power-3");
    await beat();
    expect(view.getByText("YOUR TURN")).toBeOnTheScreen();
    const discarded = live().game.privateTiles[0];
    if (discarded === undefined) throw new Error("the hero has no tile");
    await fireEvent.press(view.getByTestId("power-held"));
    await fireEvent.press(view.getByTestId(`word-builder-tile-${discarded.id}`));
    await fireEvent.press(view.getByTestId("power-confirm"));
    expect(live().powers?.used.map((event) => event.mine)).toEqual([false, true]);
    expect(flip()).toMatchObject({ tileId: "power-0", revealed: false });
    await act(async () => jest.advanceTimersByTime(
      POWER_USED_BEATS.enterMs + POWER_USED_BEATS.holdMs + POWER_USED_BEATS.exitMs - BEAT_MS,
    ));
    expect(within(view.getByTestId("power-used")).getByText("YOU USED")).toBeOnTheScreen();
    expect(flip()?.revealed).toBe(false);
    await act(async () => jest.advanceTimersByTime(
      POWER_USED_BEATS.enterMs + POWER_USED_BEATS.holdMs + POWER_USED_BEATS.exitMs,
    ));
    expect(live().powers?.used.some((notice) => notice.mine)).toBe(false);
    expect(flip()?.revealed).toBe(true);
    expect(view.queryByTestId("power-used")).toBeNull();
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
      [3, "FLOP"],
      [4, "TURN"],
      [5, "RIVER"],
    ];

    for (const [dealt, phase] of streets) {
      await takeTurn(view);

      // The hero takes their own turn, and the CPU answers it on its beats: the whole round
      // answers before the street rolls, so one action is one street.
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
    expect(control(view, "action-fold").getByText("FOLD")).toBeOnTheScreen();
    expect(view.getByRole("button", { name: "Call $60" })).toBeOnTheScreen();
    expect(view.queryByTestId("action-wager")).toBeNull();
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
    expect(view.getByTestId("word-builder-word")).toHaveTextContent(first.letter);
  });

  test("plays a word from the rack, then pays out through the results into the next hand", async () => {
    // §19's window is a clock, and a clock is what this test has to own: a seat that never
    // confirms — here, a bot whose tiny vocabulary holds nothing it can spell — leaves the
    // window to run out, and the hook's own timer is what settles it.
    const view = await renderTable();
    await advanceToWordWindow(view);

    await buildHeroWord(view);

    // The window's last sixty seconds, run a beat at a time: the table's clock is what closes it.
    for (let step = 0; step < 80 && view.queryByTestId("simple-win-continue") === null; step += 1) {
      await act(async () => {
        jest.advanceTimersByTime(BEAT_MS);
      });
    }

    expect(view.getByTestId("simple-win-continue")).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(view.getByTestId("simple-win-overlay")).toBeOnTheScreen();
    expect(view.queryByText("HAND #1 · RESULTS")).toBeNull();
    await fireEvent.press(view.getByTestId("simple-win-continue"));
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

    // The hand's quest facts are reported exactly once, off this Classic table's own hero word.
    expect(mockReportHand).toHaveBeenCalledTimes(1);
    expect(mockReportHand).toHaveBeenCalledWith(
      expect.objectContaining({ revealed: true, heroWord: HERO_WORD, wildTable: false, heroUsedPower: false }),
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

    expect(view.getByText("PREFLOP")).toBeOnTheScreen();
    expectBoard(view, 0);
    // Nothing of the results is left on screen — or reachable to a second tap.
    expect(view.queryByTestId("results-deal")).toBeNull();
    expect(view.queryByTestId("results-main-menu")).toBeNull();
    expect(view.queryByText("HAND #1 · RESULTS")).toBeNull();
  });

  test("opens the round with the bet the row names, and the round moves on", async () => {
    const view = await renderTable();

    // The pinned hand checks around to the hero on the river, which is where the row arms the
    // opening bet rather than a raise: the same slider, and the other engine action.
    for (let street = 0; street < 3; street += 1) await takeTurn(view);
    expect(view.getByText("RIVER")).toBeOnTheScreen();
    expect(view.getByRole("button", { name: "Check" })).toBeOnTheScreen();
    await fireEvent(view.getByLabelText("Wager amount"), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(view.getByRole("button", { name: "Bet $20" })).toBeOnTheScreen();

    const before = potAmount(view);
    await fireEvent.press(view.getByTestId("action-wager"));

    // A real opening bet commits 20 immediately, before any bot answers on its beat.
    expect(potAmount(view)).toBe(before + 20);
    await passedToTheHero(view);

    // These opponents have no word in the one-word fixture dictionary: all three fold.
    expect(before).toBe(240);
    expect(potAmount(view)).toBe(260);
    expect(view.getByText("PAYOUT")).toBeOnTheScreen();

  });

  test("leaves the table where it was when a disabled control is pressed in the window", async () => {
    const view = await renderTable();
    await advanceToWordWindow(view);

    // The window is open and the hero has nothing to confirm yet, so the row is the table's
    // own controls gone quiet: the call button falls back to `CALL $0` and does nothing.
    await fireEvent.press(view.getByTestId("action-check-call"));

    expect(view.getByText("RIVER")).toBeOnTheScreen();
    expect(view.queryByText("PAYOUT")).toBeNull();

    await beat();

    expect(view.getByText("RIVER")).toBeOnTheScreen();
    expect(view.queryByText("PAYOUT")).toBeNull();
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
      primary: jest.fn(),
      wager: jest.fn(),
      allIn: jest.fn(),
      setDraft: jest.fn(),
      confirmWord: jest.fn(),
      wordCheck: { checksRemaining: 0, result: null },
      checkWord: jest.fn(),
      powers: null,
      pickPower: jest.fn(),
      usePower: jest.fn(),
      endPowerUsed: jest.fn(),
      endChipFlight: jest.fn(),
      sessionOver: true,
      newGame,
    };
    jest.mocked(useOfflineGame).mockReturnValue(over);

    const view = await renderTable();

    expect(view.getByTestId("session-over")).toBeOnTheScreen();
    expect(view.getByText("SESSION OVER")).toBeOnTheScreen();
    // Every seat's final Table Stack, not just the winner's.
    expect(view.getByText("Magnus · $980")).toBeOnTheScreen();
    expect(view.getByText("Mira · $980")).toBeOnTheScreen();

    await fireEvent.press(view.getByTestId("new-game-button"));

    expect(newGame).toHaveBeenCalledTimes(1);
    // The restart redraws the table, so the injected state must stay until the test is done.
    jest.mocked(useOfflineGame).mockImplementation(
      jest.requireActual<{ useOfflineGame: typeof useOfflineGame }>("@/features/offline/use-offline-game").useOfflineGame,
    );
  });
});
