import { fireEvent, render } from "@testing-library/react-native";
import { useAudioPlayer } from "expo-audio";

import { haptic } from "@/components/word-builder/haptics";

import { WagerButton } from "./wager-button";

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));
jest.mock("expo-audio", () => ({ useAudioPlayer: jest.fn() }));
jest.mock("@/components/word-builder/haptics", () => ({ haptic: jest.fn() }));
// Jest's asset stub gives every file the same value; the two sounds must be told apart.
jest.mock("../../../../../assets/images/ui/v2/button/raise-press.mp3", () => "raise-press");
jest.mock("../../../../../assets/images/ui/v2/button/your-turn.mp3", () => "your-turn");

const CLICK = require("../../../../../assets/images/ui/v2/button/raise-press.mp3");
const YOUR_TURN = require("../../../../../assets/images/ui/v2/button/your-turn.mp3");

/** The half-spent clock of a seat the table waits on. */
const WAITING_VIEW = {
  remainingMs: 16_000,
  totalMs: 20_000,
  elapsedMs: 4_000,
  elapsedFraction: 0.2,
  urgency: "calm",
  expired: false,
  paused: false,
} as const;

/** One player per source, so the press click and the your-turn cue can be told apart. */
type Player = { play: jest.Mock; seekTo: jest.Mock; volume: number };
const players = new Map<unknown, Player>();

function playerFor(source: unknown): Player {
  let player = players.get(source);
  if (!player) {
    player = { play: jest.fn(), seekTo: jest.fn(async () => {}), volume: 1 };
    players.set(source, player);
  }
  return player;
}

const click = () => players.get(CLICK)!;
const cue = () => players.get(YOUR_TURN)!;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAudioPlayer).mockImplementation(((source: unknown) =>
    playerFor(source)) as unknown as typeof useAudioPlayer);
});

test("replays feedback and commits one wager for each activation", async () => {
  const onPress = jest.fn();
  const view = await render(<WagerButton amount="300" label="RAISE" onPress={onPress} />);
  const button = view.getByRole("button", { name: "Raise to 300" });
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(2);
  expect(click().seekTo).toHaveBeenNthCalledWith(1, 0);
  expect(click().seekTo).toHaveBeenNthCalledWith(2, 0);
  expect(click().play).toHaveBeenCalledTimes(2);
});

test("disabled wagers produce neither an action nor a sound", async () => {
  const onPress = jest.fn();
  const view = await render(<WagerButton amount="300" label="RAISE" disabled onPress={onPress} />);
  await fireEvent.press(view.getByRole("button"));
  expect(onPress).not.toHaveBeenCalled();
  expect(click().play).not.toHaveBeenCalled();
});

test("a failed audio session never prevents the wager", async () => {
  click().play.mockImplementationOnce(() => { throw new Error("Audio unavailable"); });
  const onPress = jest.fn();
  const view = await render(<WagerButton amount="20" label="BET" onPress={onPress} />);
  await fireEvent.press(view.getByRole("button", { name: "Bet 20" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("an off-turn wait names the acting seat and refuses the tap", async () => {
  const onPress = jest.fn();
  const view = await render(
    <WagerButton amount="300" label="RAISE" onPress={onPress} waitingOn={{ name: "Aria", view: WAITING_VIEW }} />,
  );
  const button = view.getByRole("button", { name: "Waiting for Aria" });
  expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  expect(view.getByText("Aria")).toBeTruthy();
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
  expect(click().play).not.toHaveBeenCalled();
  expect(cue().play).toHaveBeenCalledTimes(1);
});

test("a wait with no acting seat names nobody", async () => {
  const view = await render(<WagerButton label="CHECK" waitingOn={{}} />);
  expect(view.getByRole("button", { name: "Waiting" })).toBeTruthy();
});

test("the turn arriving cues a haptic once per turn, silently", async () => {
  const onPress = jest.fn();
  const view = await render(
    <WagerButton label="CHECK" onPress={onPress} waitingOn={{ name: "Aria", view: WAITING_VIEW }} />,
  );
  // The wait moves to another seat — still a wait, so still no cue.
  await view.rerender(<WagerButton label="CHECK" onPress={onPress} waitingOn={{ name: "Bo", view: WAITING_VIEW }} />);
  expect(haptic).not.toHaveBeenCalled();

  await view.rerender(<WagerButton label="CHECK" onPress={onPress} />);
  expect(haptic).toHaveBeenCalledTimes(1);

  // Re-renders on the hero's own turn never re-fire it.
  await view.rerender(<WagerButton label="CHECK" onPress={onPress} />);
  expect(haptic).toHaveBeenCalledTimes(1);

  // A later turn is cued again — once per turn, not once ever.
  await view.rerender(<WagerButton label="CHECK" onPress={onPress} waitingOn={{ name: "Aria", view: WAITING_VIEW }} />);
  await view.rerender(<WagerButton label="CHECK" onPress={onPress} />);
  expect(haptic).toHaveBeenCalledTimes(2);
  expect(cue().play).not.toHaveBeenCalled();
});

test("a wait that ends in the tutorial's hold is not cued", async () => {
  const view = await render(<WagerButton label="CHECK" waitingOn={{ name: "Aria", view: WAITING_VIEW }} />);
  await view.rerender(<WagerButton label="CHECK" disabled />);
  expect(haptic).not.toHaveBeenCalled();
});

test("a button that mounts already on the hero's turn stays quiet", async () => {
  await render(<WagerButton amount="20" label="BET" onPress={() => {}} />);
  expect(haptic).not.toHaveBeenCalled();
  expect(cue().play).not.toHaveBeenCalled();
});
