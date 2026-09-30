import { act, fireEvent, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { POWER_DRAW_MS, type PowerUpId } from "@wordpoker/contracts";

import type { PowerView } from "@/lib/power-view";

import { POWER_DRAW_KEPT_MS, PowerDrawReveal } from "./power-draw-reveal";

// The suite's reanimated mock has no `useReducedMotion`, and the reveal reads it.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

const OFFERS: readonly PowerUpId[] = ["vowel_magnet", "random_wild", "mulligan"];

function openDraw(picked: PowerUpId | null = null): NonNullable<PowerView["draw"]> {
  return { offers: OFFERS, endsAtMs: Date.now() + POWER_DRAW_MS, picked };
}

/** Fires the region's layout, so the reveal has room to size its cards in. */
async function layOut(screen: Awaited<ReturnType<typeof render>>) {
  await fireEvent(screen.getByTestId("power-draw"), "layout", {
    nativeEvent: { layout: { height: 320, width: 360, x: 0, y: 0 } },
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("<PowerDrawReveal />", () => {
  test("draws nothing while no draw is open", async () => {
    const screen = await render(<PowerDrawReveal draw={null} held={null} onPick={jest.fn()} />);

    expect(screen.queryByTestId("power-draw")).toBeNull();
  });

  test("offers every card as a button named by the catalog, and announces the window", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={jest.fn()} />);
    await layOut(screen);

    for (const id of OFFERS) expect(screen.getByTestId(`power-offer-${id}`)).toBeOnTheScreen();
    expect(screen.getByLabelText("Random Wild: Swap one of your tiles for a random letter.")).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith("Pick a power, 10 seconds");
  });

  test("picks the tapped card, and only once", async () => {
    const onPick = jest.fn();
    const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={onPick} />);
    await layOut(screen);

    await fireEvent.press(screen.getByTestId("power-offer-mulligan"));
    await fireEvent.press(screen.getByTestId("power-offer-random_wild"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("mulligan");
  });

  test("plays the kept card out after the draw closes, then leaves the felt", async () => {
    const draw = openDraw();
    const screen = await render(<PowerDrawReveal draw={draw} held={null} onPick={jest.fn()} />);
    await layOut(screen);

    // The clock ran out: the table closed the draw and handed the hero the first offer.
    await screen.rerender(<PowerDrawReveal draw={null} held="vowel_magnet" onPick={jest.fn()} />);
    expect(screen.getByTestId("power-offer-vowel_magnet")).toBeSelected();
    expect(screen.getByTestId("power-offer-random_wild")).toBeDisabled();

    await act(async () => {
      jest.advanceTimersByTime(POWER_DRAW_KEPT_MS);
    });
    expect(screen.queryByTestId("power-draw")).toBeNull();
  });

  test("opens again on the next hand's draw", async () => {
    const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={jest.fn()} />);
    await screen.rerender(<PowerDrawReveal draw={null} held="random_wild" onPick={jest.fn()} />);
    await act(async () => {
      jest.advanceTimersByTime(POWER_DRAW_KEPT_MS);
    });

    jest.advanceTimersByTime(1_000);
    await screen.rerender(<PowerDrawReveal draw={openDraw()} held={null} onPick={jest.fn()} />);
    await layOut(screen);

    expect(screen.getByTestId("power-offer-random_wild")).not.toBeDisabled();
  });
});
