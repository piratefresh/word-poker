import { act, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import type { PowerUsedNotice } from "@/lib/power-view";

import { POWER_USED_BEATS, POWER_USED_MOTION, PowerUsedCard } from "./power-used";

// The suite's reanimated mock has no `useReducedMotion`, and the card reads through it.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

const FULL_BEAT_MS = POWER_USED_BEATS.enterMs + POWER_USED_BEATS.holdMs + POWER_USED_BEATS.exitMs;

const ELLIS: PowerUsedNotice = {
  handId: 3,
  seat: 1,
  powerUpId: "random_wild",
  street: "flop",
  name: "Ellis",
  mine: false,
};
const HERO: PowerUsedNotice = {
  handId: 3,
  seat: 0,
  powerUpId: "vowel_magnet",
  street: "flop",
  name: "Guest",
  mine: true,
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("<PowerUsedCard />", () => {
  test("draws nothing with an empty queue", async () => {
    const screen = await render(<PowerUsedCard notices={[]} onDone={jest.fn()} />);

    expect(screen.queryByTestId("power-used")).toBeNull();
  });

  test("names who used which power in the catalog's words, and never what it gave", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const screen = await render(<PowerUsedCard notices={[ELLIS]} onDone={jest.fn()} />);

    expect(screen.getByText("ELLIS USED")).toBeTruthy();
    expect(screen.getByText("RANDOM WILD")).toBeTruthy();
    expect(screen.getByText("Swap one of your tiles for a random letter.")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Ellis used Random Wild");
    expect(screen.getByTestId("power-used").props.accessibilityLabel).toBe(
      "Ellis used Random Wild: Swap one of your tiles for a random letter.",
    );
  });

  test("calls the hero's own use \"You\"", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const screen = await render(<PowerUsedCard notices={[HERO]} onDone={jest.fn()} />);

    expect(screen.getByText("YOU USED")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("You used Vowel Magnet");
  });

  test("takes no input: the felt and the action row stay live under it", async () => {
    const screen = await render(<PowerUsedCard notices={[ELLIS]} onDone={jest.fn()} />);

    expect(screen.getByTestId("power-used-layer").props.pointerEvents).toBe("none");
  });

  test("plays the queue in order: each card holds, clears, and reports itself", async () => {
    const onDone = jest.fn();
    const screen = await render(<PowerUsedCard notices={[ELLIS, HERO]} onDone={onDone} />);
    expect(screen.getByText("ELLIS USED")).toBeTruthy();

    // Held through its beat: still up just before the clear starts.
    await act(async () => {
      jest.advanceTimersByTime(POWER_USED_BEATS.enterMs + POWER_USED_BEATS.holdMs - 1);
    });
    expect(screen.getByText("ELLIS USED")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();

    // Clearing: the card is on its way out, and only reports once it is gone.
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText("ELLIS USED")).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(POWER_USED_BEATS.exitMs);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenLastCalledWith(ELLIS);

    // The adapter drops the reported card; the next one plays its own full beat.
    await screen.rerender(<PowerUsedCard notices={[HERO]} onDone={onDone} />);
    expect(screen.getByText("YOU USED")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(FULL_BEAT_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenLastCalledWith(HERO);
  });

  test("a re-render with a fresh copy of the same queue does not restart the beat", async () => {
    const onDone = jest.fn();
    const screen = await render(<PowerUsedCard notices={[ELLIS]} onDone={onDone} />);

    await act(async () => {
      jest.advanceTimersByTime(FULL_BEAT_MS / 2);
    });
    // The felt re-renders every beat of the table, with a new array and a new handler.
    const next = jest.fn();
    await screen.rerender(<PowerUsedCard notices={[{ ...ELLIS }]} onDone={next} />);
    await act(async () => {
      jest.advanceTimersByTime(FULL_BEAT_MS / 2);
    });

    expect(onDone).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("rises in and drifts out, and only fades under reduced motion", async () => {
    const moving = await render(<PowerUsedCard notices={[ELLIS]} onDone={jest.fn()} reduceMotion={false} />);
    expect(moving.getByTestId("power-used").props.entering).toBe(POWER_USED_MOTION.rise.entering);
    expect(moving.getByTestId("power-used").props.exiting).toBe(POWER_USED_MOTION.rise.exiting);
    await moving.unmount();

    const onDone = jest.fn();
    const still = await render(<PowerUsedCard notices={[ELLIS]} onDone={onDone} reduceMotion />);
    expect(still.getByTestId("power-used").props.entering).toBe(POWER_USED_MOTION.fade.entering);
    expect(still.getByTestId("power-used").props.exiting).toBe(POWER_USED_MOTION.fade.exiting);
    // The same hold either way: reduced motion changes how it moves, not how long it reads.
    await act(async () => {
      jest.advanceTimersByTime(FULL_BEAT_MS);
    });
    expect(onDone).toHaveBeenCalledWith(ELLIS);
  });
});
