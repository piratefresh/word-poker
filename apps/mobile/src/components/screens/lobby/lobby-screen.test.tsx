import { act, fireEvent, render, waitFor, within, type RenderResult } from "@testing-library/react-native";

import { LOBBY_ROOM_NAME, WAITING_PHASE } from "@wordpoker/contracts";

import { LobbyScreen } from "./lobby-screen";

// The socket the lobby subscribes through is the test's own, and the two things a tap can do to
// a table — take a seat, or make one — are stubbed: this suite is about what the screen shows.
jest.mock("@/lib/game-client", () => ({ gameClient: { joinOrCreate: jest.fn() } }));
jest.mock("@/lib/room-session", () => ({
  createTable: jest.fn(),
  joinTable: jest.fn(),
  useActiveRoomId: jest.fn(() => null),
}));

// expo-router reaches a navigation package Jest cannot parse, and the router is the one thing
// this screen's taps are allowed to reach.
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock").default,
);

import { router } from "expo-router";

import { gameClient } from "@/lib/game-client";
import { createTable, joinTable, useActiveRoomId } from "@/lib/room-session";

const joinOrCreate = gameClient.joinOrCreate as unknown as jest.Mock;
const join = joinTable as unknown as jest.Mock;
const create = createTable as unknown as jest.Mock;
const activeRoomId = useActiveRoomId as unknown as jest.Mock;
const push = router.push as unknown as jest.Mock;

const ROOMS = "rooms";
const ADDED = "+";
const LEFT = "left";

/** One subscription: the handlers the screen registers, and the pushes the LobbyRoom would make. */
interface Subscription {
  readonly leave: jest.Mock;
  readonly send: jest.Mock;
  readonly onMessage: jest.Mock;
  readonly onLeave: jest.Mock;
  readonly onError: jest.Mock;
  push(type: string, payload?: unknown): void;
}

function subscription(): Subscription {
  const handlers: Record<string, (payload?: unknown) => void> = {};

  return {
    leave: jest.fn(async () => 0),
    send: jest.fn(),
    onMessage: jest.fn((type: string, handler: (payload?: unknown) => void) => {
      handlers[type] = handler;
      return () => delete handlers[type];
    }),
    onLeave: jest.fn((handler: () => void) => {
      handlers[LEFT] = handler;
    }),
    onError: jest.fn((handler: () => void) => {
      handlers[LEFT] = handler;
    }),
    push(type: string, payload?: unknown) {
      handlers[type]?.(payload);
    },
  };
}

type Listing = {
  roomId: string;
  clients: number;
  maxClients: number;
  locked: boolean;
  metadata: { name: string; buyIn: number; minBet: number; maxSeats: number; status: string };
};

/** One table as the lobby lists it — a listing entry and the metadata a row draws from it. */
function table(roomId: string, overrides: Partial<Listing> = {}): Listing {
  return {
    roomId,
    clients: 1,
    maxClients: 6,
    locked: false,
    metadata: {
      name: `Table ${roomId}`,
      buyIn: 500,
      minBet: 10,
      maxSeats: 6,
      status: WAITING_PHASE,
    },
    ...overrides,
  };
}

/** The lobby room pushing one of its own messages into the screen's subscription. */
async function deliver(lobby: Subscription, type: string, payload?: unknown) {
  await act(async () => {
    lobby.push(type, payload);
  });
}

/** The list is the last thing the screen waits on, so every test opens on a settled lobby. */
async function openLobby() {
  const lobby = subscription();
  joinOrCreate.mockResolvedValue(lobby);

  const view = await render(<LobbyScreen />);
  await waitFor(() => expect(joinOrCreate).toHaveBeenCalledWith(LOBBY_ROOM_NAME));

  return { lobby, view };
}

/** The sentence an `@expo/ui` text draws: the adapter view carries it as its `text` prop. */
function sentence(view: RenderResult, testID: string): string {
  return String(view.getByTestId(testID).props.text);
}

/**
 * Press a button that lives inside the sheet. The sheet's content is hosted behind its own
 * gesture layer (`pointerEvents="none"` — the native sheet takes the touches), which a synthetic
 * press on the tree cannot reach through, so the button's own event is fired by name instead.
 */
async function pressInSheet(view: RenderResult, testID: string) {
  await act(async () => {
    fireEvent(view.getByTestId(testID), "buttonPress");
  });
}

/**
 * Pick an option on an `@expo/ui` picker. The control hands its own platform a native event on
 * iOS and the value itself on the web, so the two shapes are both spelled out here — the seats
 * picker is the one place a test has to reach past the visible options to prove the refusal.
 */
async function chooseOption(view: RenderResult, testID: string, value: number) {
  const picker = view.getByTestId(testID);
  await act(async () => {
    if (picker.props.onSelectionChange) {
      picker.props.onSelectionChange({ nativeEvent: { selection: value } });
      return;
    }
    picker.props.onValueChange(value);
  });
}

/** Open the create sheet from the lobby, the way a player does. */
async function openForm(view: RenderResult) {
  await fireEvent.press(view.getByTestId("lobby-create"));
  return view.getByTestId("create-table-name");
}

beforeEach(() => {
  jest.clearAllMocks();
  activeRoomId.mockReturnValue(null);
  join.mockResolvedValue(undefined);
  create.mockResolvedValue("new-table");
});

test("waits for the first list instead of claiming the lobby is empty", async () => {
  const { view } = await openLobby();

  expect(sentence(view, "lobby-loading")).toBe("Looking for tables…");
  expect(view.queryByTestId("lobby-empty")).toBeNull();
});

test("says the lobby is empty only once the server says so", async () => {
  const { lobby, view } = await openLobby();

  await deliver(lobby, ROOMS, []);

  expect(sentence(view, "lobby-empty")).toBe("No tables open — create one.");
  expect(view.queryByTestId("lobby-loading")).toBeNull();
});

test("lists a table with the stakes, the seats and the state a player picks it by", async () => {
  const { lobby, view } = await openLobby();

  await deliver(lobby, ROOMS, [
    table("alpha"),
    table("beta", {
      clients: 6,
      maxClients: 6,
      metadata: {
        ...table("beta").metadata,
        name: "High rollers",
        buyIn: 50_000,
        minBet: 1_000,
      },
    }),
  ]);

  const alpha = within(view.getByTestId("lobby-room-alpha"));
  expect(alpha.getByText("Table alpha")).toBeOnTheScreen();
  expect(alpha.getByText("$500")).toBeOnTheScreen();
  expect(alpha.getByText("1 / 6")).toBeOnTheScreen();
  expect(alpha.getByText("WAITING")).toBeOnTheScreen();

  const beta = within(view.getByTestId("lobby-room-beta"));
  expect(beta.getByText("High rollers")).toBeOnTheScreen();
  expect(beta.getByText("$50,000")).toBeOnTheScreen();
  expect(beta.getByText("6 / 6")).toBeOnTheScreen();

  expect(view.queryByTestId("lobby-empty")).toBeNull();
});

test("takes a seat at the table a row names, then shows it", async () => {
  const { lobby, view } = await openLobby();
  await deliver(lobby, ROOMS, [table("alpha")]);

  await fireEvent.press(view.getByTestId("lobby-room-alpha"));

  await waitFor(() => expect(join).toHaveBeenCalledWith("alpha"));
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith({ pathname: "/online/[roomId]", params: { roomId: "alpha" } }),
  );
});

test("routes back to the seat already held instead of joining it a second time", async () => {
  const { lobby, view } = await openLobby();
  activeRoomId.mockReturnValue("alpha");
  await deliver(lobby, ROOMS, [table("alpha"), table("beta")]);

  await fireEvent.press(view.getByTestId("lobby-room-alpha"));

  // A room counts connections, not identities: a second `joinById` would take a second seat.
  expect(join).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith({
    pathname: "/online/[roomId]",
    params: { roomId: "alpha" },
  });
});

test("offers the table already held as a way back, not as a join", async () => {
  const { lobby, view } = await openLobby();
  activeRoomId.mockReturnValue("mine");
  await deliver(lobby, ROOMS, [table("mine"), table("theirs")]);

  const mine = view.getByTestId("lobby-room-mine");
  expect(within(mine).getByText("YOUR TABLE")).toBeOnTheScreen();
  expect(mine.props.accessibilityLabel).toBe(
    "Your table, Table mine, $500 buy-in, 1 of 6 seats taken, waiting for players",
  );

  const theirs = view.getByTestId("lobby-room-theirs");
  expect(within(theirs).getByText("JOIN")).toBeOnTheScreen();
  expect(theirs.props.accessibilityLabel).toContain("Join Table theirs");
});

test("a full table you are seated at is still the way back to your seat", async () => {
  const { lobby, view } = await openLobby();
  activeRoomId.mockReturnValue("mine");
  await deliver(lobby, ROOMS, [table("mine", { clients: 6, maxClients: 6 })]);

  const mine = view.getByTestId("lobby-room-mine");

  // Full *because* of the seat reading the row: §3's "already seated" outranks "table is full".
  expect(mine).not.toBeDisabled();
  expect(within(mine).getByText("YOUR TABLE")).toBeOnTheScreen();

  await fireEvent.press(mine);
  expect(join).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith({
    pathname: "/online/[roomId]",
    params: { roomId: "mine" },
  });
});

test("keeps a full table listed, and cannot be pressed", async () => {
  const { lobby, view } = await openLobby();
  await deliver(lobby, ROOMS, [
    table("full", { clients: 6, maxClients: 6 }),
    table("locked", { locked: true }),
  ]);

  const full = view.getByTestId("lobby-room-full");
  expect(full).toBeDisabled();
  expect(within(full).getByText("FULL")).toBeOnTheScreen();

  // §3: a table nobody can sit at is shown as one, not hidden — and a press does nothing.
  await fireEvent.press(full);
  expect(join).not.toHaveBeenCalled();

  const locked = view.getByTestId("lobby-room-locked");
  expect(locked).toBeDisabled();
  expect(within(locked).getByText("LOCKED")).toBeOnTheScreen();
});

test("says why a join was refused and asks for the list again", async () => {
  const { lobby, view } = await openLobby();
  await deliver(lobby, ROOMS, [table("alpha")]);
  join.mockRejectedValue(new Error("That table is full or has just closed."));

  await fireEvent.press(view.getByTestId("lobby-room-alpha"));

  await waitFor(() =>
    expect(sentence(view, "lobby-refusal")).toBe("That table is full or has just closed."),
  );
  // The refusal is never a screen stuck on "connecting", and a seat taken under us is what the
  // list has to be asked about again.
  expect(push).not.toHaveBeenCalled();
  expect(lobby.send).toHaveBeenCalledWith("filter");
});

test("surfaces a dropped subscription beside the rows it already had, and re-subscribes on retry", async () => {
  const { lobby, view } = await openLobby();
  await deliver(lobby, ROOMS, [table("alpha")]);

  await deliver(lobby, LEFT);

  expect(sentence(view, "lobby-error")).toBe(
    "Lost the table list. Check your connection and try again.",
  );
  // The last list the server sent stays up: a stale row beats an empty lobby.
  expect(view.getByTestId("lobby-room-alpha")).toBeOnTheScreen();

  const rejoined = subscription();
  joinOrCreate.mockResolvedValue(rejoined);
  await fireEvent.press(view.getByTestId("lobby-retry"));

  await waitFor(() => expect(joinOrCreate).toHaveBeenCalledTimes(2));
  // The retry is a fresh subscription, so the list the server pushes is the one it sends it.
  await waitFor(() => expect(rejoined.onMessage).toHaveBeenCalled());
  await deliver(rejoined, ROOMS, [table("beta")]);

  expect(view.queryByTestId("lobby-error")).toBeNull();
  expect(view.getByTestId("lobby-room-beta")).toBeOnTheScreen();
  expect(view.queryByTestId("lobby-room-alpha")).toBeNull();
});

test("refuses an over-long table name before it spends a round trip", async () => {
  const { view } = await openLobby();
  const name = await openForm(view);

  await fireEvent.changeText(name, "x".repeat(33));
  await pressInSheet(view, "create-table-submit");

  expect(create).not.toHaveBeenCalled();
  expect(sentence(view, "create-table-name-refusal")).toBe(
    "Table names run to 32 characters.",
  );
});

test("refuses a seat count outside §5 before it spends a round trip", async () => {
  const { view } = await openLobby();
  const name = await openForm(view);

  // A name the validator is happy with, so the seat count is the only thing left to refuse.
  await fireEvent.changeText(name, "Sunday felt");
  await chooseOption(view, "create-table-seats", 9);
  await pressInSheet(view, "create-table-submit");

  expect(create).not.toHaveBeenCalled();
  expect(sentence(view, "create-table-seats-refusal")).toBe(
    "Seats take a whole number from 2 to 6.",
  );
});

test("creates the table the form describes and shows it", async () => {
  const { view } = await openLobby();
  const name = await openForm(view);

  await fireEvent.changeText(name, "Sunday felt");
  await chooseOption(view, "create-table-buy-in", 5_000);
  await chooseOption(view, "create-table-seats", 3);
  await pressInSheet(view, "create-table-submit");

  await waitFor(() =>
    expect(create).toHaveBeenCalledWith({ name: "Sunday felt", buyIn: 5_000, maxSeats: 3 }),
  );
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith({
      pathname: "/online/[roomId]",
      params: { roomId: "new-table" },
    }),
  );
  // The sheet is closed behind the new table. (Its content stays mounted once it has been
  // presented — the native sheet needs it while it dismisses — so the sheet's own state is
  // what says it is closed.)
  expect(view.getByTestId("create-table-sheet").props.isPresented).toBe(false);
});

test("shows the server's own sentence when the create is refused", async () => {
  const { view } = await openLobby();
  const name = await openForm(view);
  create.mockRejectedValue(new Error("That table name is taken."));

  await fireEvent.changeText(name, "Sunday felt");
  await pressInSheet(view, "create-table-submit");

  await waitFor(() => expect(sentence(view, "create-table-error")).toBe("That table name is taken."));
  // The form stays open on what the player typed, ready for another try.
  expect(view.getByTestId("create-table-name").props.value).toBe("Sunday felt");
  expect(push).not.toHaveBeenCalled();
});
