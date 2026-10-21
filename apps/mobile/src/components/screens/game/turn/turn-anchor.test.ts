import { holdTurn, openTurn } from "./turn-anchor";

const GAME = { id: "turn-1", secondsRemaining: 60 };

test("uses the authoritative submission deadline after reconnect", () => {
  const turn = openTurn({ ...GAME, turnEndsAtMs: 61_000 }, 41_000);
  expect(turn.timing).toMatchObject({ startedAtMs: 1_000, endsAtMs: 61_000 });
});

describe("holdTurn", () => {
  it("pins a running turn where it stands, and leaves a held one alone", () => {
    const running = openTurn(GAME, 1_000);
    const held = holdTurn(running, true, 21_000);

    expect(held.timing).toEqual({ startedAtMs: 1_000, endsAtMs: 61_000, pausedAtMs: 21_000 });
    expect(holdTurn(held, true, 99_000)).toBe(held);
  });

  it("releases a held turn later by exactly the time it was held", () => {
    const held = holdTurn(openTurn(GAME, 1_000), true, 21_000);
    const released = holdTurn(held, false, 321_000);

    // Held for five minutes with 40 seconds left: 40 seconds are still left on release.
    expect(released.timing).toEqual({ startedAtMs: 301_000, endsAtMs: 361_000, pausedAtMs: null });
    expect(released.timing.endsAtMs - 321_000).toBe(40_000);
    expect(holdTurn(released, false, 400_000)).toBe(released);
  });
});
