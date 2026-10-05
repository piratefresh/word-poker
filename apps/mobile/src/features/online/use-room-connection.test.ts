import { act, renderHook } from "@testing-library/react-native";

import { useRoomConnection, type RoomConnectionLike } from "./use-room-connection";

/** A room whose drop and reconnect signals the test drives by hand. */
function makeRoom() {
  const drop = new Set<() => void>();
  const reconnect = new Set<() => void>();

  const room: RoomConnectionLike = {
    onDrop: Object.assign((cb: () => void) => drop.add(cb), {
      remove: (cb: () => void) => drop.delete(cb),
    }),
    onReconnect: Object.assign((cb: () => void) => reconnect.add(cb), {
      remove: (cb: () => void) => reconnect.delete(cb),
    }),
  };

  return {
    room,
    drop: () => drop.forEach((cb) => cb()),
    reconnect: () => reconnect.forEach((cb) => cb()),
    listeners: () => drop.size + reconnect.size,
  };
}

describe("useRoomConnection", () => {
  test("starts connected — the felt only mounts once the seat is held", async () => {
    const fake = makeRoom();
    const { result } = await renderHook(() => useRoomConnection(fake.room));
    expect(result.current).toBe("connected");
  });

  test("flips to reconnecting on a drop and back on reconnect", async () => {
    const fake = makeRoom();
    const { result } = await renderHook(() => useRoomConnection(fake.room));

    await act(async () => fake.drop());
    expect(result.current).toBe("reconnecting");

    await act(async () => fake.reconnect());
    expect(result.current).toBe("connected");
  });

  test("removes its listeners on unmount", async () => {
    const fake = makeRoom();
    const { unmount } = await renderHook(() => useRoomConnection(fake.room));
    expect(fake.listeners()).toBe(2);

    await act(async () => unmount());
    expect(fake.listeners()).toBe(0);
  });
});
