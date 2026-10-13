import { act, renderHook } from "@testing-library/react-native";

import { seatFixture, snapshotFixture } from "./results-fixtures";
import type { ResultsSnapshot } from "./results-types";
import { useSimpleWinCelebration } from "./use-simple-win-celebration";

jest.mock("./simple-win-preload", () => ({ preloadSimpleWin: jest.fn() }));

test.each([false, true])("celebrates a local win with revealed=%s until Continue", async (revealed) => {
  const snapshot = snapshotFixture({
    revealed,
    seats: [
      seatFixture({ name: "Guest", isYou: true, takesPot: true }),
      seatFixture({ name: "Ellis", folded: true }),
    ],
  });
  const { result, rerender } = await renderHook(
    ({ hand }: { hand: ResultsSnapshot | null }) => useSimpleWinCelebration(hand),
    { initialProps: { hand: snapshot as ResultsSnapshot | null } },
  );

  expect(result.current.active).toBe(true);
  await act(() => result.current.complete());
  expect(result.current.active).toBe(false);
  await rerender({ hand: snapshot });
  expect(result.current.active).toBe(false);
  await rerender({ hand: null });
  expect(result.current.active).toBe(false);
  await rerender({ hand: { ...snapshot, hand: snapshot.hand + 1 } });
  expect(result.current.active).toBe(true);
});

test("does not celebrate another player's fold-out win", async () => {
  const snapshot = snapshotFixture({
    revealed: false,
    seats: [
      seatFixture({ name: "Ellis", takesPot: true }),
      seatFixture({ name: "Guest", isYou: true, folded: true }),
    ],
  });
  const { result } = await renderHook(() => useSimpleWinCelebration(snapshot));
  expect(result.current.active).toBe(false);
});
