import { fireEvent, render } from "@testing-library/react-native";

import { seatFixture } from "./results-fixtures";
import { XpResultOverlay } from "./xp-result-overlay";

let mockOutcomes: Record<string, unknown> = {};
jest.mock("@/lib/quests/quests-provider", () => ({ useQuests: () => ({ claimOutcomes: mockOutcomes }) }));
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock").default,
);

const hero = seatFixture({ name: "You", isYou: true, place: 3, total: 12 });

beforeEach(() => { mockOutcomes = {}; });

test("shows the placement, the predicted reward, its breakdown and the pending label", async () => {
  const view = await render(<XpResultOverlay hero={hero} onComplete={jest.fn()} report={{ handToken: "t", baselineXp: 90 }} />);
  expect(view.getByText("3RD PLACE")).toBeOnTheScreen();
  expect(view.getByText("You earned +22 XP")).toBeOnTheScreen();
  expect(view.getByText("Participation:")).toBeOnTheScreen();
  expect(view.getByText("+10 XP")).toBeOnTheScreen();
  expect(view.getByText("+12 XP")).toBeOnTheScreen();
  // 90 + 22 = 112 → level 2 (100), next level at 283.
  expect(view.getByText("171 XP away from Level 3")).toBeOnTheScreen();
  expect(view.getByText("XP pending sync")).toBeOnTheScreen();
});

test("the server's answer for its own claim replaces the prediction; another claim's is ignored", async () => {
  mockOutcomes = { other: { status: "confirmed", xp: 5000, level: 12 } };
  const view = await render(<XpResultOverlay hero={hero} onComplete={jest.fn()} report={{ handToken: "t", baselineXp: 90 }} />);
  expect(view.getByText("XP pending sync")).toBeOnTheScreen();

  mockOutcomes = { t: { status: "confirmed", xp: 120, level: 2 } };
  await view.rerender(<XpResultOverlay hero={hero} onComplete={jest.fn()} report={{ handToken: "t", baselineXp: 90 }} />);
  expect(view.queryByText("XP pending sync")).toBeNull();
  expect(view.getByText("163 XP away from Level 3")).toBeOnTheScreen();
});

test("without loaded account XP it shows the reward but invents no level", async () => {
  const view = await render(<XpResultOverlay hero={hero} onComplete={jest.fn()} report={{ handToken: "t", baselineXp: null }} />);
  expect(view.getByText("You earned +22 XP")).toBeOnTheScreen();
  expect(view.queryByText(/away from Level/)).toBeNull();
});

test("signed out, it asks for sign-in instead of claiming a reward, and Continue still works", async () => {
  const onComplete = jest.fn();
  const view = await render(<XpResultOverlay hero={hero} onComplete={onComplete} report={null} />);
  expect(view.getByText("Sign in and verify your account to earn XP")).toBeOnTheScreen();
  expect(view.queryByText(/You earned/)).toBeNull();
  await fireEvent.press(view.getByTestId("xp-result-continue"));
  expect(onComplete).toHaveBeenCalledTimes(1);
});
