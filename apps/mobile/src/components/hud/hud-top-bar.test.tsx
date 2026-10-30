import { fireEvent, render, screen } from "@testing-library/react-native";

import type { RoundPhase } from "@wordpoker/contracts";

import { FREE_PLAY, hangsModeTag, type BalanceView } from "./hud-types";
import { HudTopBar, hudBarHeight, type HudTopBarProps } from "./hud-top-bar";
import { CHIP_HEIGHT } from "./top-bar/balance-chip";
import { MODE_TAG_BLOCK, MODE_TAG_GAP } from "./top-bar/banner";
import { deriveTurnTimer, type TurnTimerView } from "./turn-clock";

// The suite's reanimated mock has no `useReducedMotion` — the library ships it as a TODO —
// and the bar reads it for its two effects, so the one hook is layered on here.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

const SECOND = 1000;
const START = 1_700_000_000_000;
const PHRASE = "Magnus to act";

/** A 40-second turn resolved `elapsedMs` into its budget. */
function turnAt(elapsedMs: number): TurnTimerView {
  return deriveTurnTimer(
    { startedAtMs: START, endsAtMs: START + 40 * SECOND, pausedAtMs: null },
    START + elapsedMs,
  );
}

/** 5s in is calm, 37s in is critical, 45s in is spent. */
const CALM = turnAt(5 * SECOND);
const CRITICAL = turnAt(37 * SECOND);
const EXPIRED = turnAt(45 * SECOND);

async function renderBar(props: Partial<HudTopBarProps> = {}) {
  return render(
    <HudTopBar
      balance={{ state: "ready", amount: 1240 }}
      phase="turn"
      turn={null}
      {...props}
    />,
  );
}

const PHASE_CASES: [RoundPhase, string][] = [
  ["preflop", "PREFLOP"],
  ["flop", "FLOP"],
  ["turn", "TURN"],
  ["river", "RIVER"],
  ["payout", "PAYOUT"],
];

test.each(PHASE_CASES)("names %s in the capsule", async (phase, stamp) => {
  await renderBar({ phase });

  expect(screen.getByText(stamp)).toBeOnTheScreen();
});

test("a waiting table's stamp replaces the phase and runs no clock", async () => {
  await renderBar({ stamp: "WAITING FOR PLAYERS" });

  expect(screen.getByText("WAITING FOR PLAYERS")).toBeOnTheScreen();
  expect(screen.queryByText("--:--")).toBeNull();
});

/** label is what a screen reader reads, text is what is on screen. */
const BALANCE_CASES: [string, BalanceView, string, string][] = [
  ["ready", { state: "ready", amount: 1240 }, "Balance $1,240", "$1.2K"],
  ["empty", { state: "ready", amount: 0 }, "Balance $0", "$0"],
  ["loading", { state: "loading" }, "Balance loading", "···"],
  ["unavailable", { state: "unavailable" }, "Balance unavailable", "—"],
  ["free-play", FREE_PLAY, "Practice game", "PRACTICE"],
];

test.each(BALANCE_CASES)(
  "renders a %s balance as its own readout",
  async (_name, balance, label, text) => {
    await renderBar({ balance });

    expect(screen.getByLabelText(label)).toHaveTextContent(text);
  },
);

test("keeps the exact amount in the label while the compact value is on screen", async () => {
  await renderBar({ balance: { state: "ready", amount: 12_500 } });

  expect(screen.getByText("$12.5K")).toBeOnTheScreen();
  expect(screen.getByLabelText("Balance $12,500")).toBeOnTheScreen();
});

test("a loading balance cannot be read as a figure", async () => {
  await renderBar({ balance: { state: "loading" } });

  expect(screen.getByLabelText("Balance loading")).not.toHaveTextContent(/\d/);
});

const READ_ONLY_CASES: [string, BalanceView][] = [
  ["a ready balance", { state: "ready", amount: 1240 }],
  ["a loading balance", { state: "loading" }],
  ["an unavailable balance", { state: "unavailable" }],
  ["a free-play balance", FREE_PLAY],
];

test.each(READ_ONLY_CASES)("%s is a value, not a control", async (_name, balance) => {
  await renderBar({ balance });

  expect(screen.queryByRole("button", { name: /balance/i })).toBeNull();
});

test("hangs the mode's tag under the capsule, and only there", async () => {
  const view = await renderBar({ balance: FREE_PLAY, modeTag: true });

  expect(view.getByLabelText("Practice game")).toBeOnTheScreen();
  // One readout: the corner group is not drawing a second copy of it.
  expect(view.getAllByLabelText("Practice game")).toHaveLength(1);
});

test("keeps a mode's tag in the corner group where the screen cannot hang it", async () => {
  const view = await renderBar({ balance: FREE_PLAY, modeTag: false });

  // Without a tag under the capsule the chip rides the corner with the help button, where it
  // has always been: a room too short for the tag leaves the header as it was.
  expect(view.getByLabelText("Practice game")).toBeOnTheScreen();
  expect(view.getByRole("button", { name: "How to play" })).toBeOnTheScreen();
});

test("the signed-out chip is the one pressable balance and signs the player in", async () => {
  const onBalancePress = jest.fn();
  await renderBar({ balance: { state: "signed-out" }, onBalancePress });

  await fireEvent.press(
    screen.getByRole("button", { name: "Sign in to see your balance" }),
  );

  expect(onBalancePress).toHaveBeenCalledTimes(1);
});

test("a signed-out balance with nowhere to go is left out of the header", async () => {
  await renderBar({ balance: { state: "signed-out" } });

  expect(screen.queryByText(/sign in/i)).toBeNull();
  expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
  // The rest of the header is untouched by the missing chip.
  expect(screen.getByLabelText("Leave the table")).toBeOnTheScreen();
});

const BUTTON_CASES: [
  string,
  keyof Pick<HudTopBarProps, "onLeave" | "onHelp">,
][] = [
  ["Leave the table", "onLeave"],
  ["How to play", "onHelp"],
];

test.each(BUTTON_CASES)("%s invokes its handler", async (label, prop) => {
  const handlers = { onLeave: jest.fn(), onHelp: jest.fn() };
  await renderBar(handlers);

  await fireEvent.press(screen.getByRole("button", { name: label }));

  expect(handlers[prop]).toHaveBeenCalledTimes(1);
});

test("between turns the clock idles and nothing is announced", async () => {
  await renderBar({ turn: null, turnPhrase: PHRASE });

  expect(screen.getByText("--:--")).toBeOnTheScreen();
  expect(screen.getByLabelText("No turn in progress")).toBeOnTheScreen();
  expect(screen.queryByText(/Magnus to act/)).toBeNull();
});

test("a calm turn counts down without speaking", async () => {
  await renderBar({ turn: CALM, turnPhrase: PHRASE });

  expect(screen.getByText("00:35")).toBeOnTheScreen();
  expect(screen.getByLabelText("35 seconds left")).toBeOnTheScreen();
  expect(screen.queryByText("!")).toBeNull();
  expect(screen.queryByText(new RegExp(PHRASE))).toBeNull();
});

test("a critical turn marks the clock on screen and in the spoken label", async () => {
  await renderBar({ turn: CRITICAL, turnPhrase: PHRASE });

  expect(screen.getByText("00:03")).toBeOnTheScreen();
  expect(screen.getByLabelText("3 seconds left, hurry")).toBeOnTheScreen();
  // The glyph, not the colour, is what survives a monochrome screen.
  expect(screen.getByText("!")).toBeOnTheScreen();
});

test("the band announcement lands in one polite live region", async () => {
  await renderBar({ turn: CRITICAL, turnPhrase: PHRASE });

  const announced = screen.getByText(`${PHRASE}: 3 seconds, hurry`);
  expect(announced).toHaveProp("accessibilityLiveRegion", "polite");
  // The digits republish four times a second; a live region on them would narc on
  // every tick.
  expect(screen.getByText("00:03")).not.toHaveProp("accessibilityLiveRegion", "polite");
});

test("an expired turn says time is up", async () => {
  await renderBar({ turn: EXPIRED, turnPhrase: PHRASE });

  expect(screen.getByText("00:00")).toBeOnTheScreen();
  expect(screen.getByLabelText("Time is up")).toBeOnTheScreen();
  expect(screen.getByText(`${PHRASE}: time is up`)).toBeOnTheScreen();
});

describe("the banner's size", () => {
  test("keeps the phone's banner on a phone, upright or on its side", () => {
    const phone = hudBarHeight({ width: 390, height: 844 });

    expect(hudBarHeight({ width: 844, height: 390 })).toBe(phone);
    expect(hudBarHeight({ width: 1280, height: 720 })).toBe(phone);
  });

  test("hangs a larger banner in a larger window, and stops growing", () => {
    const small = hudBarHeight({ width: 1280, height: 720 });
    const medium = hudBarHeight({ width: 1440, height: 900 });
    const large = hudBarHeight({ width: 1920, height: 1080 });

    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
    expect(hudBarHeight({ width: 2560, height: 1440 })).toBeGreaterThan(large);
    expect(hudBarHeight({ width: 3840, height: 2160 })).toBe(hudBarHeight({ width: 2560, height: 1440 }));
  });

  test("hangs a mode's tag under the capsule in portrait, and keeps it in the corner on its side", () => {
    expect(hangsModeTag(FREE_PLAY, { width: 390, height: 844 })).toBe(true);
    // A landscape bar has the width to keep the tag beside the clock, and its middle seat
    // is drawn right under the capsule.
    expect(hangsModeTag(FREE_PLAY, { width: 844, height: 390 })).toBe(false);
    // Only a mode: a figure is a readout wherever it is.
    expect(hangsModeTag({ state: "ready", amount: 1240 }, { width: 390, height: 844 })).toBe(false);
    expect(hangsModeTag({ state: "loading" }, { width: 390, height: 844 })).toBe(false);
    expect(hangsModeTag({ state: "unavailable" }, { width: 390, height: 844 })).toBe(false);
  });

  test("hangs the tag deep enough under the capsule to clear it", () => {
    expect(MODE_TAG_BLOCK).toBeGreaterThanOrEqual(CHIP_HEIGHT + MODE_TAG_GAP);
  });
});
