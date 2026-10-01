import {
  act,
  fireEvent,
  render,
  renderHook,
} from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import type { Tile } from "@wordpoker/contracts";

import type { PowerView } from "@/lib/power-view";

import { PowerHeldChip, PowerUsePrompt } from "./power-use";
import { swapFlipOf, usePowerTargeting } from "./use-power-targeting";

// The suite's reanimated mock has no `useReducedMotion`, and the card art reads through it.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>(
    "react-native-reanimated/mock",
  ),
  useReducedMotion: () => false,
}));

const TILE_A: Tile = { id: "A-1", letter: "A", points: 1 };
const TILE_QK: Tile = {
  id: "QK-1",
  letter: "Q",
  points: 10,
  alternativeLetter: "K",
  alternativePoints: 5,
};

function held(
  overrides: Partial<NonNullable<PowerView["held"]>> = {},
): NonNullable<PowerView["held"]> {
  return { id: "random_wild", used: false, usable: true, ...overrides };
}

describe("<PowerHeldChip />", () => {
  test("is a button named by the catalog, live while the table would take the power", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <PowerHeldChip active={false} held={held()} onPress={onPress} />,
    );

    const chip = screen.getByTestId("power-held");
    expect(chip.props.accessibilityLabel).toBe(
      "Random Wild: Swap one of your tiles for a random letter.",
    );
    expect(chip.props.accessibilityState).toMatchObject({
      disabled: false,
      expanded: false,
    });

    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("is inert off the power's window", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <PowerHeldChip
        active={false}
        held={held({ usable: false })}
        onPress={onPress}
      />,
    );

    await fireEvent.press(screen.getByTestId("power-held"));
    expect(onPress).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("power-held").props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  test("wears USED once spent", async () => {
    const screen = await render(
      <PowerHeldChip
        active={false}
        held={held({ used: true, usable: false })}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText("USED")).toBeTruthy();
    expect(screen.getByTestId("power-held").props.accessibilityLabel).toMatch(
      /Used\.$/,
    );
  });

  test("draws nothing while the hero holds no power", async () => {
    const screen = await render(
      <PowerHeldChip active={false} held={null} onPress={jest.fn()} />,
    );

    expect(screen.queryByTestId("power-held")).toBeNull();
  });
});

describe("<PowerUsePrompt />", () => {
  test("draws nothing while idle", async () => {
    const screen = await render(
      <PowerUsePrompt
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
        power="random_wild"
        targeting={{ stage: "idle" }}
      />,
    );

    expect(screen.queryByTestId("power-scrim")).toBeNull();
  });

  test("while choosing, says what to do, and the felt or CANCEL backs out", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const onCancel = jest.fn();
    const screen = await render(
      <PowerUsePrompt
        onCancel={onCancel}
        onConfirm={jest.fn()}
        power="random_wild"
        targeting={{ stage: "picking" }}
      />,
    );

    expect(screen.getByText("Tap one of your tiles to swap it")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Choose one of your tiles to swap");
    await fireEvent.press(screen.getByTestId("power-scrim"));
    await fireEvent.press(screen.getByTestId("power-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  test("asks to confirm in the catalog's words, naming the tile", async () => {
    const onConfirm = jest.fn();
    const screen = await render(
      <PowerUsePrompt
        onCancel={jest.fn()}
        onConfirm={onConfirm}
        power="vowel_magnet"
        targeting={{ stage: "confirming", tile: TILE_A }}
      />,
    );

    expect(screen.getByText("Discard A for a random vowel?")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("power-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("names both faces of a choice tile", async () => {
    const screen = await render(
      <PowerUsePrompt
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
        power="mulligan"
        targeting={{ stage: "confirming", tile: TILE_QK }}
      />,
    );

    expect(
      screen.getByText("Discard Q/K for the next tile in the bag?"),
    ).toBeTruthy();
  });
});

describe("usePowerTargeting", () => {
  async function setup(initial: PowerView["held"]) {
    const onUse = jest.fn();
    const hook = await renderHook(
      ({ current }: { current: PowerView["held"] }) =>
        usePowerTargeting({ held: current, onUse }),
      {
        initialProps: { current: initial },
      },
    );
    return { hook, onUse };
  }

  test("chip, tile, confirm: spends the power on the chosen tile and keeps the tile it discarded", async () => {
    const { hook, onUse } = await setup(held());

    await act(() => hook.result.current.toggle());
    expect(hook.result.current.targeting).toEqual({ stage: "picking" });
    await act(() => hook.result.current.pick(TILE_A));
    expect(hook.result.current.targeting).toEqual({
      stage: "confirming",
      tile: TILE_A,
    });
    await act(() => hook.result.current.confirm());

    expect(onUse).toHaveBeenCalledWith("random_wild", "A-1");
    expect(hook.result.current.targeting).toEqual({ stage: "idle" });
    expect(hook.result.current.discarded).toBe(TILE_A);
  });

  test("the chip's second tap cancels", async () => {
    const { hook } = await setup(held());

    await act(() => hook.result.current.toggle());
    await act(() => hook.result.current.toggle());
    expect(hook.result.current.targeting).toEqual({ stage: "idle" });
  });

  test("drops back to idle the moment the table stops taking the power, and stays there", async () => {
    const { hook, onUse } = await setup(held());

    await act(() => hook.result.current.toggle());
    await act(() => hook.result.current.pick(TILE_A));
    await hook.rerender({ current: held({ usable: false }) });
    expect(hook.result.current.targeting).toEqual({ stage: "idle" });

    await hook.rerender({ current: held() });
    expect(hook.result.current.targeting).toEqual({ stage: "idle" });
    await act(() => hook.result.current.confirm());
    expect(onUse).not.toHaveBeenCalled();
  });

  test("the chip does nothing while the power is not usable", async () => {
    const { hook } = await setup(held({ usable: false }));

    await act(() => hook.result.current.toggle());
    expect(hook.result.current.targeting).toEqual({ stage: "idle" });
  });
});

describe("swapFlipOf", () => {
  const swap = {
    handId: 1,
    powerUpId: "random_wild" as const,
    discardedTileId: "A-1",
    tile: { id: "power-0", letter: "Z", points: 10 },
  };

  test("turns the new tile over from the one the hero discarded", () => {
    expect(swapFlipOf(swap, TILE_A)).toEqual({
      tileId: "power-0",
      from: TILE_A,
    });
  });

  test("has nothing to turn without a swap, or without the tile it replaced", () => {
    expect(swapFlipOf(null, TILE_A)).toBeNull();
    expect(swapFlipOf(swap, null)).toBeNull();
    expect(swapFlipOf(swap, TILE_QK)).toBeNull();
  });
});
