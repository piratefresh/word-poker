import { act, render } from "@testing-library/react-native";
import { GAME_EVENTS, GAME_MESSAGES } from "@wordpoker/contracts";
import { SeatFriendSheet } from "./seat-friend-sheet";
import type { GameRoomLike } from "@/features/online/use-online-game";

test("requests by seat id, accepts only that seat's result, and unsubscribes", async () => {
  let receive: (payload: unknown) => void = () => {};
  const off = jest.fn();
  const room: GameRoomLike = {
    sessionId: "hero", state: {}, send: jest.fn(),
    onStateChange: Object.assign(() => {}, { remove: () => {} }),
    onMessage: jest.fn((name, callback) => { expect(name).toBe(GAME_EVENTS.befriendResult); receive = callback; return off; }),
  };
  const player = { id: "seat-b", name: "Seat 2", initials: "S2", stack: 500, color: "red", status: "waiting" as const };
  const view = await render(<SeatFriendSheet player={player} room={room} onClose={() => {}} />);
  expect(room.send).not.toHaveBeenCalled();
  await act(async () => {
    const node = view.getByTestId("seat-add-friend");
    (node.props.onButtonPress ?? node.props.onPress ?? node.props.onClick)?.();
  });
  expect(room.send).toHaveBeenCalledWith(GAME_MESSAGES.befriend, { playerId: "seat-b" });
  await act(async () => receive({ playerId: "other", message: "Wrong result" }));
  expect(view.queryByTestId("seat-friend-result")).toBeNull();
  await act(async () => receive({ playerId: "seat-b", message: "Friend request sent" }));
  expect(view.getByTestId("seat-friend-result")).toBeTruthy();
  expect(view.queryByTestId("seat-add-friend")).toBeNull();
  await view.unmount();
  expect(off).toHaveBeenCalled();
});
