import { act, fireEvent, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { POWER_DRAW_MS, type PowerUpId } from "@wordpoker/contracts";

import type { PowerView } from "@/features/table/power-view";

import { POWER_DRAW_KEPT_MS, POWER_DRAW_MOTION, PowerDrawReveal } from "./power-draw-reveal";

// `useSafeAreaInsets` throws without a provider; the library ships a mock.
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock").default,
);

// The suite's reanimated mock has no `useReducedMotion`, and the reveal reads it.
let mockReduceMotion = false;
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => mockReduceMotion,
}));

const OFFERS: readonly PowerUpId[] = ["vowel_magnet", "random_wild"];
const READY_MS = POWER_DRAW_MOTION.entrance.readyAt;

function openDraw(picked: PowerUpId | null = null, endsAtMs = Date.now() + POWER_DRAW_MS): NonNullable<PowerView["draw"]> {
  return { offers: OFFERS, endsAtMs, picked };
}

/** Fires the region's layout, so the reveal has room to size its cards in. */
async function layOut(screen: Awaited<ReturnType<typeof render>>, width = 360) {
  await fireEvent(screen.getByTestId("power-draw"), "layout", {
    nativeEvent: { layout: { height: 320, width, x: 0, y: 0 } },
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  mockReduceMotion = false;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe("<PowerDrawReveal />", () => {
  test("draws nothing while no draw is open", async () => {
    const screen = await render(<PowerDrawReveal draw={null} held={null} onPick={jest.fn()} />);

    expect(screen.queryByTestId("power-draw")).toBeNull();
  });

  test("offers every card in the draw's order as a button named by the catalog, and announces the window", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={jest.fn()} />);
    await layOut(screen);

    const offers = screen.getAllByRole("button");
    expect(offers.map((offer) => offer.props.testID)).toEqual(OFFERS.map((id) => `power-offer-${id}`));
    expect(screen.getByLabelText("Wild Tile: Swap one of your tiles for a random letter.")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Wild power" })).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith("Pick a power, 10 seconds");
  });

  test("holds the cards shut until the row has landed, and ignores a tap before then", async () => {
    const onPick = jest.fn();
    const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={onPick} />);
    await layOut(screen);

    expect(screen.getByTestId("power-offer-vowel_magnet")).toBeDisabled();
    expect(screen.queryByTestId("power-draw-ready")).toBeNull();
    await fireEvent.press(screen.getByTestId("power-offer-vowel_magnet"));
    expect(onPick).not.toHaveBeenCalled();

    await advance(READY_MS - 1);
    expect(screen.queryByTestId("power-draw-ready")).toBeNull();
    await advance(1);

    expect(screen.getByTestId("power-draw-ready")).toBeOnTheScreen();
    expect(screen.getByText("CHOOSE ONE POWER")).toBeOnTheScreen();
    for (const id of OFFERS) expect(screen.getByTestId(`power-offer-${id}`)).not.toBeDisabled();
  });

  test("counts the entrance from the layout, and a resize does not restart it", async () => {
    const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={jest.fn()} />);
    await advance(READY_MS);
    expect(screen.queryByTestId("power-draw-ready")).toBeNull();

    await layOut(screen);
    await advance(READY_MS / 2);
    await layOut(screen, 300);
    await advance(READY_MS / 2);

    expect(screen.getByTestId("power-draw-ready")).toBeOnTheScreen();
  });

  test("opens the tapped card to read, and keeps it only on CONFIRM, once", async () => {
    const onPick = jest.fn();
    const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={onPick} />);
    await layOut(screen);
    await advance(READY_MS);

    await fireEvent(screen.getByTestId("power-offer-vowel_magnet"), "focus");
    await fireEvent.press(screen.getByTestId("power-offer-vowel_magnet"));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByTestId("power-draw-zoom")).toBeOnTheScreen();
    // BACK returns to the row, and a card can be opened again.
    await fireEvent.press(screen.getByTestId("power-draw-back"));
    expect(screen.queryByTestId("power-draw-zoom")).toBeNull();
    await fireEvent.press(screen.getByTestId("power-offer-vowel_magnet"));
    await fireEvent.press(screen.getByTestId("power-draw-confirm"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("vowel_magnet");
    expect(screen.queryByTestId("power-draw-ready")).toBeNull();
    for (const id of OFFERS) expect(screen.getByTestId(`power-offer-${id}`)).toBeDisabled();
  });

  test("keeps the card the table names, not the one the seat tapped", async () => {
    const draw = openDraw();
    const screen = await render(<PowerDrawReveal draw={draw} held={null} onPick={jest.fn()} />);
    await layOut(screen);
    await advance(READY_MS);
    await fireEvent.press(screen.getByTestId("power-offer-vowel_magnet"));
    await fireEvent.press(screen.getByTestId("power-draw-confirm"));

    await screen.rerender(<PowerDrawReveal draw={{ ...draw, picked: "random_wild" }} held={null} onPick={jest.fn()} />);

    expect(screen.getByTestId("power-offer-random_wild")).toBeSelected();
    expect(screen.getByTestId("power-offer-vowel_magnet")).not.toBeSelected();
  });

  test("plays the kept card out after the draw closes, then leaves the felt", async () => {
    const draw = openDraw();
    const screen = await render(<PowerDrawReveal draw={draw} held={null} onPick={jest.fn()} />);
    await layOut(screen);
    await advance(READY_MS);

    // The clock ran out: the table closed the draw and handed the hero the first offer.
    await screen.rerender(<PowerDrawReveal draw={null} held="vowel_magnet" onPick={jest.fn()} />);
    expect(screen.getByTestId("power-offer-vowel_magnet")).toBeSelected();
    expect(screen.getByTestId("power-offer-random_wild")).toBeDisabled();

    await advance(POWER_DRAW_KEPT_MS - 1);
    expect(screen.getByTestId("power-draw")).toBeOnTheScreen();
    await advance(1);
    expect(screen.queryByTestId("power-draw")).toBeNull();
  });

  test("a clock that runs out during the entrance cuts straight to the kept card's exit", async () => {
    const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={jest.fn()} />);
    await layOut(screen);
    await advance(300);

    await screen.rerender(<PowerDrawReveal draw={null} held="vowel_magnet" onPick={jest.fn()} />);
    expect(screen.getByTestId("power-offer-vowel_magnet")).toBeSelected();

    // Selection never opens on a draw that has already closed.
    await advance(READY_MS);
    expect(screen.queryByTestId("power-draw-ready")).toBeNull();
    expect(screen.queryByTestId("power-draw")).toBeNull();
  });

  test("a pick still waiting on other seats plays its exit once, then says so", async () => {
    const draw = openDraw();
    const screen = await render(<PowerDrawReveal draw={draw} held={null} onPick={jest.fn()} />);
    await layOut(screen);
    await advance(READY_MS);
    await fireEvent.press(screen.getByTestId("power-offer-vowel_magnet"));

    await screen.rerender(<PowerDrawReveal draw={{ ...draw, picked: "vowel_magnet" }} held={null} onPick={jest.fn()} />);
    expect(screen.queryByTestId("power-draw-waiting")).toBeNull();
    await advance(POWER_DRAW_KEPT_MS);

    expect(screen.getByText("WAITING FOR OTHER PLAYERS")).toBeOnTheScreen();
    expect(screen.queryByTestId("power-offer-vowel_magnet")).toBeNull();

    // The other seats are in: the draw closes, and the exit that already played is not replayed.
    await screen.rerender(<PowerDrawReveal draw={null} held="vowel_magnet" onPick={jest.fn()} />);
    expect(screen.queryByTestId("power-draw")).toBeNull();
  });

  test("opens again on the next hand's draw, shut until it lands", async () => {
    const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={jest.fn()} />);
    await layOut(screen);
    await advance(READY_MS);
    await fireEvent.press(screen.getByTestId("power-offer-random_wild"));
    await fireEvent.press(screen.getByTestId("power-draw-confirm"));
    await screen.rerender(<PowerDrawReveal draw={null} held="random_wild" onPick={jest.fn()} />);
    await advance(POWER_DRAW_KEPT_MS);

    await advance(1_000);
    const onPick = jest.fn();
    await screen.rerender(<PowerDrawReveal draw={openDraw()} held={null} onPick={onPick} />);
    await layOut(screen);

    expect(screen.getByTestId("power-offer-random_wild")).toBeDisabled();
    expect(screen.getByTestId("power-offer-random_wild")).not.toBeSelected();
    await advance(READY_MS);
    await fireEvent.press(screen.getByTestId("power-offer-random_wild"));
    await fireEvent.press(screen.getByTestId("power-draw-confirm"));
    expect(onPick).toHaveBeenCalledWith("random_wild");
  });

  test("clears its clock when it unmounts mid-reveal", async () => {
    // The test environment keeps timers of its own, so follow the reveal's own by its delay.
    const set = jest.spyOn(global, "setTimeout");
    const clear = jest.spyOn(global, "clearTimeout");
    const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={jest.fn()} />);
    await layOut(screen);
    await advance(200);
    const readyCall = set.mock.calls.findIndex(([, delay]) => delay === READY_MS);
    expect(readyCall).toBeGreaterThanOrEqual(0);

    await screen.unmount();

    expect(clear).toHaveBeenCalledWith(set.mock.results[readyCall]?.value);
    set.mockRestore();
    clear.mockRestore();
  });

  describe("under reduced motion", () => {
    beforeEach(() => {
      mockReduceMotion = true;
    });

    test("offers the cards at once", async () => {
      const onPick = jest.fn();
      const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={onPick} />);
      await layOut(screen);

      expect(screen.getByTestId("power-draw-ready")).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId("power-offer-random_wild"));
      await fireEvent.press(screen.getByTestId("power-draw-confirm"));
      expect(onPick).toHaveBeenCalledWith("random_wild");
    });

    test("fades the selection out in a short fade", async () => {
      const screen = await render(<PowerDrawReveal draw={openDraw()} held={null} onPick={jest.fn()} />);
      await layOut(screen);
      await screen.rerender(<PowerDrawReveal draw={null} held="random_wild" onPick={jest.fn()} />);
      expect(screen.getByTestId("power-offer-random_wild")).toBeSelected();

      await advance(POWER_DRAW_MOTION.reduced.fadeOut);
      expect(screen.queryByTestId("power-draw")).toBeNull();
    });
  });
});
