import { render } from "@testing-library/react-native";
import { Text } from "react-native";

import { deriveTurnTimer } from "@/components/hud/turn-clock";

import { SeatBeamCanvas } from "./seat-beam-canvas";

test("fills from the turn's elapsed time, stops at expiry, and clears for a new turn", async () => {
  const timing = { startedAtMs: 0, endsAtMs: 60_000, pausedAtMs: null };
  const seat = (nowMs: number, active = true) => (
    <SeatBeamCanvas active={active} size={68} borderWidth={3}
      progress={deriveTurnTimer(timing, nowMs).elapsedFraction}>
      <Text>JA</Text>
    </SeatBeamCanvas>
  );
  const view = await render(seat(0));
  expect(view.queryByTestId("seat-timer-fill")).toBeNull();

  await view.rerender(seat(15_000));
  const quarter = view.getByTestId("seat-timer-fill").props.d;
  await view.rerender(seat(45_000));
  expect(view.getByTestId("seat-timer-fill").props.d).not.toBe(quarter);

  await view.rerender(seat(60_000));
  expect(view.getByTestId("seat-timer-full")).toBeTruthy();
  await view.rerender(seat(90_000));
  expect(view.getByTestId("seat-timer-full")).toBeTruthy();

  await view.rerender(seat(0));
  expect(view.queryByTestId("seat-timer-full")).toBeNull();
  await view.rerender(seat(30_000, false));
  expect(view.queryByTestId("seat-timer-fill")).toBeNull();
  expect(view.getByText("JA")).toBeTruthy();
});
