import { act, renderHook } from "@testing-library/react-native";

import { seatFixture, snapshotFixture } from "./results-fixtures";
import type { ResultsSnapshot } from "./results-types";
import { useXpResultOverlay } from "./use-xp-result-overlay";

const mockReportHand = jest.fn();
jest.mock("@/lib/quests-provider", () => ({ useQuests: () => ({ reportHand: mockReportHand }) }));

const extra = { wildTable: false, heroUsedPower: false };
const loss = (hand: number) => snapshotFixture({ hand, seats: [
  seatFixture({ name: "Ellis", place: 1, takesPot: true, total: 20 }),
  seatFixture({ name: "You", isYou: true, place: 2, total: 12 }),
] });

beforeEach(() => {
  mockReportHand.mockReset();
  mockReportHand.mockReturnValue({ handToken: "tok", baselineXp: 5 });
});

test("a lost showdown opens the overlay, reports once, and Continue closes it for that hand", async () => {
  const { result, rerender } = await renderHook(({ snapshot }: { snapshot: ResultsSnapshot }) => useXpResultOverlay(snapshot, 0, extra), {
    initialProps: { snapshot: loss(1) },
  });
  expect(result.current.hero?.isYou).toBe(true);
  await rerender({ snapshot: loss(1) });
  expect(mockReportHand).toHaveBeenCalledTimes(1);

  await act(() => result.current.complete());
  expect(result.current.hero).toBeNull();
  await rerender({ snapshot: loss(1) });
  expect(result.current.hero).toBeNull();
  expect(mockReportHand).toHaveBeenCalledTimes(1);

  await rerender({ snapshot: loss(2) });
  expect(result.current.hero).not.toBeNull();
  expect(mockReportHand).toHaveBeenCalledTimes(2);
});

test("winners, pot-sharers, fold-outs and spectators get no overlay but still report", async () => {
  const won = snapshotFixture({ seats: [seatFixture({ name: "You", isYou: true, takesPot: true })] });
  const spectator = snapshotFixture({ seats: [seatFixture({ name: "Ellis", takesPot: true })] });
  const foldOut = snapshotFixture({ revealed: false, seats: [seatFixture({ name: "You", isYou: true })] });
  const folded = snapshotFixture({ seats: [seatFixture({ name: "You", isYou: true, folded: true })] });
  for (const snapshot of [won, spectator, foldOut, folded]) {
    const { result } = await renderHook(() => useXpResultOverlay(snapshot, 0, extra));
    expect(result.current.hero).toBeNull();
  }
});

test("a new session reopens a hand number already dismissed", async () => {
  const { result, rerender } = await renderHook(({ session }: { session: number }) => useXpResultOverlay(loss(1), session, extra), {
    initialProps: { session: 0 },
  });
  await act(() => result.current.complete());
  expect(result.current.hero).toBeNull();
  await rerender({ session: 1 });
  expect(result.current.hero).not.toBeNull();
  expect(mockReportHand).toHaveBeenCalledTimes(2);
});

test("signed out: the overlay opens with no report", async () => {
  mockReportHand.mockReturnValue(null);
  const { result } = await renderHook(() => useXpResultOverlay(loss(1), 0, extra));
  expect(result.current.hero).not.toBeNull();
  expect(result.current.report).toBeNull();
});
