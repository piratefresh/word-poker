/**
 * results-header.test.tsx — the bar, the sentence and the pot, as a test and a reader see them.
 *
 * Nothing here asserts the entrance. A test cannot watch a worklet, and what the sequence changes
 * is style only: every string this file checks is on screen from the first frame, which is the
 * property the screen actually leans on while it animates (STO-384, STO-387). The payload is the
 * shared fixture, so these three components are read off the same hand the cards are.
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { colors } from "@/constants/theme";
import { formatAmount } from "@/lib/ui/format";

import { snapshotFixture } from "./results-fixtures";
import { ResultsHeader } from "./results-header";
import { ResultsHeadlineView } from "./results-headline";
import { ResultsPot } from "./results-pot";

// `useSafeAreaInsets` throws without a provider, and the shipped provider needs native views.
// The library's own mock stands in, with zero insets.
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock").default,
);

/**
 * The clock a component test hands in: the sequence at its end, which is where Reduce Motion
 * pins it. A beat read off this clock is already at its final value, so nothing below depends on
 * a frame having been drawn.
 */
function settledClock(): SharedValue<number> {
  const settled = 1;
  return { get: () => settled, value: settled } as unknown as SharedValue<number>;
}

/** The four texts and the pot are hidden under the headline's one node: queries need the flag. */
const HIDDEN = { includeHiddenElements: true } as const;

const SNAPSHOT = snapshotFixture();

async function renderHeadline() {
  return render(<ResultsHeadlineView clock={settledClock()} snapshot={SNAPSHOT} />);
}

test("the bar stamps the hand it was handed, and follows it", async () => {
  const onBack = jest.fn();
  const view = await render(<ResultsHeader hand={18} onBack={onBack} />);

  expect(screen.getByText("HAND #18 · RESULTS")).toBeOnTheScreen();

  await view.rerender(<ResultsHeader hand={21} onBack={onBack} />);

  expect(screen.getByText("HAND #21 · RESULTS")).toBeOnTheScreen();
  expect(screen.queryByText("HAND #18 · RESULTS")).toBeNull();
});

test("the back control is the bar's one button and it leaves the table", async () => {
  const onBack = jest.fn();
  await render(<ResultsHeader hand={18} onBack={onBack} />);

  const back = screen.getByRole("button", { name: "Back to the main menu" });
  expect(screen.getByTestId("results-back")).toBe(back);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(onBack).not.toHaveBeenCalled();

  await fireEvent.press(back);

  expect(onBack).toHaveBeenCalledTimes(1);
});

test("the headline is one node, and its label carries the pot", async () => {
  const { emphasis, lead, subline } = SNAPSHOT.headline;
  const label = `${lead} ${emphasis}, ${formatAmount(SNAPSHOT.pot)} pot, ${subline}`;

  await renderHeadline();

  expect(screen.getByRole("header")).toHaveProp("accessibilityLabel", label);
  expect(screen.getAllByLabelText(label)).toHaveLength(1);

  // The texts inside it are hidden: a reader hears the sentence once, not five fragments, and
  // never the pot's own digits.
  expect(screen.queryByText("HEADLINE · RESULTS")).toBeNull();
  expect(screen.queryByText(subline)).toBeNull();
  expect(screen.queryByText(emphasis)).toBeNull();
  expect(screen.queryByDisplayValue(formatAmount(SNAPSHOT.pot))).toBeNull();
});

test("the sentence's emphasis is its one gold span", async () => {
  const { headline } = SNAPSHOT;

  await renderHeadline();

  // The sentence is the bright cream one: the lead is its own text, not a second span.
  const sentence = screen.getByText(`${headline.lead} ${headline.emphasis}`, HIDDEN);
  expect(sentence).toHaveStyle({ color: colors.textBright });

  // And the one gold run inside it is the emphasis: the lead is drawn in the sentence's own
  // colour, and nothing else in the paragraph is gold.
  const goldSpans = sentence
    .queryAll((node) => StyleSheet.flatten(node.props.style)?.color === colors.gold)
    .map((span) =>
      span.children.filter((child): child is string => typeof child === "string").join(""),
    );

  expect(goldSpans).toEqual([headline.emphasis]);
});

const POT_CASES: [string, number][] = [
  ["a pot of one group", 80],
  ["a pot that needs its separators", 1_240],
];

test.each(POT_CASES)("the pot prints %s once it has settled", async (_name, amount) => {
  await render(<ResultsPot amount={amount} clock={settledClock()} />);

  const settled = formatAmount(amount);

  // The layer the player sees: filled over the box the invisible copy reserves, and carrying the
  // settled amount from the first frame — what a platform that cannot animate `text` shows.
  const visible = screen.getByDisplayValue(settled, HIDDEN);
  expect(visible).toHaveProp("testID", "results-pot");
  expect(visible).toHaveProp("value", settled);
  // A pot is a readout: nothing is typed into it.
  expect(visible).toHaveProp("editable", false);

  // The reservation: the same amount, in the same type, invisibly in the flow underneath.
  const reserve = screen.getByTestId("results-pot-reserve", HIDDEN);
  expect(reserve).toHaveTextContent(settled);
  expect(reserve).toHaveStyle({ opacity: 0 });
});

test("the count-up writes its one number under both keys", async () => {
  await render(<ResultsPot amount={80} clock={settledClock()} />);

  // Both keys carry the same string, because they are one number for two renderers: native paints
  // the input's `text` slot, and the web build's DOM input holds `value`. Dropping either one
  // stops the count-up on a platform, so neither may be tidied away.
  const countUp = screen.getByTestId("results-pot", HIDDEN).props.animatedProps;

  expect(Object.keys(countUp).sort()).toEqual(["text", "value"]);
  expect(countUp.text).toBe(countUp.value);
});
