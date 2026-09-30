import { act, renderHook, waitFor } from "@testing-library/react-native";

import { LOBBY_ROOM_NAME, WAITING_PHASE, type RoomSummary } from "@wordpoker/contracts";

import { useLobby } from "./use-lobby";

// The socket itself is the test's to drive: `joinOrCreate` hands back a subscription whose
// messages the test pushes by hand, so nothing here waits on a server.
jest.mock("./game-client", () => ({ gameClient: { joinOrCreate: jest.fn() } }));

import { gameClient } from "./game-client";

const joinOrCreate = gameClient.joinOrCreate as unknown as jest.Mock;

/** The lobby room's own events, as a test can fire them. */
const ROOMS = "rooms";
const ADDED = "+";
const REMOVED = "-";
const LEFT = "left";
const FAILED = "failed";

/** One subscription: the handlers `useLobby` registers, and the pushes the LobbyRoom would make. */
interface Subscription {
  readonly leave: jest.Mock;
  readonly send: jest.Mock;
  readonly onMessage: jest.Mock;
  readonly onLeave: jest.Mock;
  readonly onError: jest.Mock;
  push(type: string, payload?: unknown): void;
}

/**
 * A lobby room the test owns. Colyseus pushes `+` as a `[roomId, listing]` pair — a table added,
 * or one whose listing changed — and `-` as the room id alone.
 */
function subscription(respondToFilter = false): Subscription {
  const handlers: Record<string, (payload?: unknown) => void> = {};

  return {
    leave: jest.fn(async () => 0),
    send: jest.fn((type: string) => {
      if (respondToFilter && type === "filter") handlers[ROOMS]?.([listing("filtered")]);
    }),
    onMessage: jest.fn((type: string, handler: (payload?: unknown) => void) => {
      handlers[type] = handler;
      return () => delete handlers[type];
    }),
    onLeave: jest.fn((handler: () => void) => {
      handlers[LEFT] = handler;
    }),
    onError: jest.fn((handler: () => void) => {
      handlers[FAILED] = handler;
    }),
    push(type: string, payload?: unknown) {
      handlers[type]?.(payload);
    },
  };
}

/** One listing entry as the lobby room sends it: Colyseus's own cache fields plus our metadata. */
function listing(roomId: string, overrides: Partial<RoomSummary> = {}) {
  return {
    roomId,
    clients: 1,
    maxClients: 6,
    locked: false,
    metadata: {
      name: `Table ${roomId}`,
      buyIn: 500,
      smallBlind: 5,
      bigBlind: 10,
      maxSeats: 6,
      status: WAITING_PHASE,
    },
    ...overrides,
  };
}

async function opened() {
  const lobby = subscription();
  joinOrCreate.mockResolvedValue(lobby);

  const view = await renderHook(() => useLobby());
  await waitFor(() => expect(joinOrCreate).toHaveBeenCalledWith(LOBBY_ROOM_NAME));

  return { lobby, view };
}

/** Push a message into the subscription the way the server would. */
async function push(lobby: Subscription, type: string, payload?: unknown) {
  await act(async () => {
    lobby.push(type, payload);
  });
}

beforeEach(() => {
  joinOrCreate.mockReset();
});

test("opens on the lobby room and holds the screen until its first list arrives", async () => {
  const { lobby, view } = await opened();

  expect(joinOrCreate).toHaveBeenCalledWith(LOBBY_ROOM_NAME);
  expect(view.result.current.status).toBe("loading");
  expect(view.result.current.rooms).toEqual([]);

  await push(lobby, ROOMS, [listing("alpha")]);

  expect(view.result.current.status).toBe("ready");
  expect(view.result.current.rooms.map((room) => room.roomId)).toEqual(["alpha"]);
  expect(view.result.current.error).toBeUndefined();
});

test("refreshes after joining so a listing that raced the join is not lost", async () => {
  const lobby = subscription(true);
  // A LobbyRoom can send its initial listing while the join handshake is still settling. The
  // handler is not installed until the join promise resolves, so this message is intentionally
  // lost unless the client asks for the list once more after registering its handlers.
  lobby.push(ROOMS, [listing("raced")]);
  joinOrCreate.mockResolvedValue(lobby);

  const view = await renderHook(() => useLobby());

  await waitFor(() => expect(lobby.send).toHaveBeenCalledWith("filter"));
  expect(view.result.current.status).toBe("ready");
  expect(view.result.current.rooms.map((room) => room.roomId)).toEqual(["filtered"]);
});

test("lists only the entries it can describe as a table", async () => {
  const { lobby, view } = await opened();

  await push(lobby, ROOMS, [
    listing("alpha"),
    { roomId: "no-metadata" },
    "nonsense",
    { roomId: "wrong-type", clients: "1", maxClients: 6, metadata: listing("x").metadata },
    listing("beta", { locked: true }),
  ]);

  // The two good entries are rows; nothing else is drawn half-broken.
  expect(view.result.current.rooms.map((room) => room.roomId)).toEqual(["alpha", "beta"]);
  expect(view.result.current.rooms[1]?.locked).toBe(true);
});

test("adds a table, replaces the one that changed, and drops the one that closed", async () => {
  const { lobby, view } = await opened();
  await push(lobby, ROOMS, [listing("alpha")]);

  await push(lobby, ADDED, ["beta", listing("beta", { clients: 2 })]);
  expect(view.result.current.rooms.map((room) => room.roomId)).toEqual(["alpha", "beta"]);

  // A listing that came back for a row already held is the same table with fresher numbers.
  await push(lobby, ADDED, ["beta", listing("beta", { clients: 6 })]);
  expect(view.result.current.rooms.map((room) => room.clients)).toEqual([1, 6]);

  // And a `+` nobody can describe changes nothing.
  await push(lobby, ADDED, ["gamma", { roomId: "gamma" }]);
  expect(view.result.current.rooms.map((room) => room.roomId)).toEqual(["alpha", "beta"]);

  await push(lobby, REMOVED, "alpha");
  expect(view.result.current.rooms.map((room) => room.roomId)).toEqual(["beta"]);
});

test("keeps the rows it has when the subscription drops, and says why", async () => {
  const { lobby, view } = await opened();
  await push(lobby, ROOMS, [listing("alpha")]);

  await push(lobby, LEFT);

  expect(view.result.current.status).toBe("error");
  expect(view.result.current.error).toBe(
    "Lost the table list. Check your connection and try again.",
  );
  // The last list the server sent is still on screen beside the message.
  expect(view.result.current.rooms.map((room) => room.roomId)).toEqual(["alpha"]);
});

test("asks the server for the whole list again when refresh is called on a live subscription", async () => {
  const { lobby, view } = await opened();
  await push(lobby, ROOMS, [listing("alpha")]);

  await act(async () => {
    view.result.current.refresh();
  });

  // A bare `filter` is the server's "no filter" path — the missing payload is the whole point:
  // `{}` would be read as a filter naming a room type we do not have, and would list nothing.
  expect(lobby.send).toHaveBeenCalledWith("filter");
});

test("arms the refresh until the list it asked for lands", async () => {
  const { lobby, view } = await opened();
  await push(lobby, ROOMS, [listing("alpha")]);

  expect(view.result.current.refreshing).toBe(false);

  await act(async () => {
    view.result.current.refresh();
  });

  // The subscription is live, so the gesture has nothing to wait on but the server's own answer —
  // and a list that never comes must not leave a spinner turning over it.
  expect(view.result.current.refreshing).toBe(true);

  await push(lobby, ROOMS, [listing("alpha"), listing("beta")]);

  expect(view.result.current.refreshing).toBe(false);
  expect(view.result.current.rooms.map((room) => room.roomId)).toEqual(["alpha", "beta"]);
});

test("disarms the refresh when the subscription drops under it", async () => {
  const { lobby, view } = await opened();
  await push(lobby, ROOMS, [listing("alpha")]);

  await act(async () => {
    view.result.current.refresh();
  });
  await push(lobby, LEFT);

  // The list is never coming. The message says so and the gesture ends with it.
  expect(view.result.current.refreshing).toBe(false);
  expect(view.result.current.status).toBe("error");
});

test("re-subscribes on refresh after a drop, and takes the fresh list", async () => {
  const { lobby, view } = await opened();
  await push(lobby, ROOMS, [listing("alpha")]);
  await push(lobby, LEFT);

  const rejoined = subscription();
  joinOrCreate.mockResolvedValue(rejoined);
  await act(async () => {
    view.result.current.refresh();
  });

  await waitFor(() => expect(joinOrCreate).toHaveBeenCalledTimes(2));
  expect(view.result.current.status).toBe("loading");

  await push(rejoined, ROOMS, [listing("beta")]);

  expect(view.result.current.status).toBe("ready");
  expect(view.result.current.error).toBeUndefined();
  expect(view.result.current.rooms.map((room) => room.roomId)).toEqual(["beta"]);
});

test("leaves the lobby room when the screen goes away", async () => {
  const { lobby, view } = await opened();
  await push(lobby, ROOMS, [listing("alpha")]);

  await view.unmount();

  expect(lobby.leave).toHaveBeenCalled();
});

test("gives back a subscription that arrives after the screen is already gone", async () => {
  const arriving = Promise.withResolvers<unknown>();
  joinOrCreate.mockReturnValue(arriving.promise);

  const view = await renderHook(() => useLobby());
  await view.unmount();

  const late = subscription();
  await act(async () => {
    arriving.resolve(late);
  });

  // Nobody is listening to this subscription, so the lobby must stop telling it.
  expect(late.leave).toHaveBeenCalled();
});
