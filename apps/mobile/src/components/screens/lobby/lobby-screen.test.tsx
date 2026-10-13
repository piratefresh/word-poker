import { act, fireEvent, render, waitFor, within, type RenderResult } from "@testing-library/react-native";

import { LOBBY_ROOM_NAME, ROUND_PHASES, WAITING_PHASE } from "@wordpoker/contracts";

import { LobbyScreen } from "./lobby-screen";

// The socket the lobby subscribes through is the test's own, and the two things a tap can do to
// a table — take a seat, or make one — are stubbed: this suite is about what the screen shows.
jest.mock("@/features/online/game-client", () => ({ gameClient: { joinOrCreate: jest.fn() } }));
jest.mock("@/features/online/room-session", () => ({
  createTable: jest.fn(),
  joinTable: jest.fn(),
  useActiveRoomId: jest.fn(() => null),
}));

// expo-router reaches a navigation package Jest cannot parse, and the router is the one thing
// this screen's taps are allowed to reach.
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

// The session is what the masthead's avatar is drawn from; the lobby reads nothing else of it.
jest.mock("@/auth/client/auth-client", () => ({
  authClient: { useSession: jest.fn(() => ({ data: { user: { name: "Dylan", email: "d@x.dev" } } })) },
}));

jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock").default,
);

import { router, useLocalSearchParams } from "expo-router";

import { gameClient } from "@/features/online/game-client";
import { createTable, joinTable, useActiveRoomId } from "@/features/online/room-session";

const joinOrCreate = gameClient.joinOrCreate as unknown as jest.Mock;
const join = joinTable as unknown as jest.Mock;
const create = createTable as unknown as jest.Mock;
const activeRoomId = useActiveRoomId as unknown as jest.Mock;
const push = router.push as unknown as jest.Mock;

const ROOMS = "rooms";
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
  metadata: {
    name: string;
    buyIn: number;
    smallBlind: number;
    bigBlind: number;
    maxSeats: number;
    powerUps: { deal: string };
    status: string;
  };
};

/** One table as the lobby lists it — a listing entry and the metadata a card draws from it. */
function table(roomId: string, overrides: Partial<Listing> = {}): Listing {
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
      powerUps: { deal: "off" },
      status: WAITING_PHASE,
    },
    ...overrides,
  };
}

/** A table whose hand is under way: the hero card's own reason to be featured. */
function live(roomId: string, overrides: Partial<Listing> = {}): Listing {
  return table(roomId, {
    ...overrides,
    metadata: { ...table(roomId).metadata, status: ROUND_PHASES[0], ...overrides.metadata },
  });
}

/**
 * Two tables where the first is the hero and the second is a row: the featured pick is the fullest
 * table with a hand under way, so `hero` has to be one seat short of its cap to win it.
 */
const HERO_AND_ROW = [live("hero", { clients: 5 }), table("row")];

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

/**
 * The sentence a text draws, whichever kind of text it is: `@expo/ui`'s adapter carries it in a
 * `text` prop, and React Native's splits it across children.
 */
function sentence(view: RenderResult, testID: string): string {
  const node = view.getByTestId(testID);
  if (typeof node.props.text === "string") return node.props.text;

  const parts: string[] = [];
  const walk = (children: unknown): void => {
    if (Array.isArray(children)) {
      for (const child of children) walk(child);
      return;
    }
    if (typeof children === "string" || typeof children === "number") parts.push(String(children));
  };
  walk(node.props.children);
  return parts.join("");
}

/**
 * Press a button that lives inside the sheet. The sheet's content is hosted behind its own
 * gesture layer (`pointerEvents="none"` — the native sheet takes the touches), which a synthetic
 * press on the tree cannot reach through, so the button's own handler is called instead.
 */
async function pressInSheet(view: RenderResult, testID: string) {
  await act(async () => {
    view.getByTestId(testID).props.onClick?.() ?? view.getByTestId(testID).props.onPress?.();
  });
}

/**
 * Pick an option on an `@expo/ui` picker. The control hands its own platform a native event on
 * iOS and the value itself on the web, so the two shapes are both spelled out here — the seats
 * picker is the one place a test has to reach past the visible options to prove the refusal.
 */
async function chooseOption(view: RenderResult, testID: string, value: number | string) {
  const picker = view.getByTestId(testID);
  await act(async () => {
    if (picker.props.onSelectionChange) {
      picker.props.onSelectionChange({ nativeEvent: { selection: value } });
      return;
    }
    picker.props.onValueChange(value);
  });
}

/**
 * The felt measures its own box before it draws anything (`PokerTable`), and a test tree never
 * lays out — the same `fireEvent(..., "layout")` the felt's other suites drive it with.
 */
const FELT_BOX = { nativeEvent: { layout: { width: 320, height: 236 } } };

async function measureFelt(view: RenderResult) {
  await fireEvent(view.getByTestId("parlor-featured-felt"), "layout", FELT_BOX);
}

/**
 * Every sentence in the tree that an `@expo/ui` text carries. The library's `Text` keeps its string
 * in a `text` prop rather than in children, so a rendered-text query cannot see the felt's seats —
 * and the felt's seats are the library's own. The walk is over the host tree, which is what the
 * screen renders through.
 */
function libraryTexts(view: RenderResult): string[] {
  const found: string[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node !== "object" || node === null) return;

    const element = node as { props?: Record<string, unknown>; children?: unknown };
    const text = element.props?.text;
    if (typeof text === "string") found.push(text);
    walk(element.children);
  };

  walk(view.toJSON());
  return found;
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

test("waits for the first list instead of claiming the room is empty", async () => {
  const { view } = await openLobby();

  expect(sentence(view, "lobby-loading")).toBe("Looking for tables…");
  expect(view.queryByTestId("lobby-empty")).toBeNull();
});

test("says the room is empty only once the server says so", async () => {
  const { lobby, view } = await openLobby();

  await deliver(lobby, ROOMS, []);

  expect(sentence(view, "lobby-empty")).toBe("The room is empty — deal the first table.");
  expect(view.queryByTestId("lobby-loading")).toBeNull();
  expect(view.queryByTestId("parlor-featured")).toBeNull();
});

test("features the liveliest table with its terms, its seats on the felt, and the one way in", async () => {
  const { lobby, view } = await openLobby();

  await deliver(lobby, ROOMS, HERO_AND_ROW);

  const card = within(view.getByTestId("parlor-featured"));
  expect(card.getByText("Table hero")).toBeOnTheScreen();
  expect(card.getByText("IN HAND")).toBeOnTheScreen();
  expect(card.getByText("$500")).toBeOnTheScreen();
  expect(card.getByText("$5 / $10 BLINDS")).toBeOnTheScreen();
  expect(card.getByText("TAKE THE LAST SEAT")).toBeOnTheScreen();

  // The felt is the game rooms' own and draws itself into the box the card gives it. A seat the
  // listing counts is a numbered place with no face invented for it; a seat that is free is the
  // OPEN one the rooms draw, and the figure in the middle is the table's own count.
  await measureFelt(view);
  expect(card.getByText("5 / 6")).toBeOnTheScreen();

  const texts = libraryTexts(view);
  expect(texts).toContain("SEAT 5");
  expect(texts.filter((text) => text === "OPEN")).toHaveLength(1);
});

test("lists the other tables with the stakes, the seats and the state a player picks them by", async () => {
  const { lobby, view } = await openLobby();

  await deliver(lobby, ROOMS, [
    ...HERO_AND_ROW,
    table("beta", {
      clients: 6,
      maxClients: 6,
      metadata: {
        ...table("beta").metadata,
        name: "High rollers",
        buyIn: 50_000,
        smallBlind: 500,
        bigBlind: 1_000,
      },
    }),
  ]);

  const row = within(view.getByTestId("lobby-room-row"));
  expect(row.getByText("Table row")).toBeOnTheScreen();
  expect(row.getByText("$500")).toBeOnTheScreen();
  expect(row.getByText("$5 / $10 BLINDS")).toBeOnTheScreen();
  expect(row.getByText("1 / 6 SEATS")).toBeOnTheScreen();
  expect(row.getByText("WAITING")).toBeOnTheScreen();
  expect(row.getByText("JOIN")).toBeOnTheScreen();

  const beta = within(view.getByTestId("lobby-room-beta"));
  expect(beta.getByText("High rollers")).toBeOnTheScreen();
  expect(beta.getByText("$50,000")).toBeOnTheScreen();
  expect(beta.getByText("$500 / $1,000 BLINDS")).toBeOnTheScreen();
  expect(beta.getByText("6 / 6 SEATS")).toBeOnTheScreen();
  expect(beta.getByText("FULL")).toBeOnTheScreen();
});

test("marks a Wild table on its card, its row and its sentence, and leaves a Classic one plain", async () => {
  const { lobby, view } = await openLobby();
  const wild = { ...table("wild").metadata, powerUps: { deal: "choose3" } };

  await deliver(lobby, ROOMS, [
    live("hero", { clients: 5, metadata: { ...live("hero").metadata, powerUps: { deal: "choose3" } } }),
    table("wild", { metadata: wild }),
    table("plain"),
  ]);

  // §40: the setting is shown in the table browser and before joining.
  expect(within(view.getByTestId("parlor-featured")).getByText("WILD POWERS")).toBeOnTheScreen();
  expect(within(view.getByTestId("lobby-room-wild")).getByText("WILD POWERS")).toBeOnTheScreen();
  expect(within(view.getByTestId("lobby-room-plain")).queryByText("WILD POWERS")).toBeNull();

  expect(view.getByTestId("lobby-room-wild").props.accessibilityLabel).toMatch(/, Wild Powers$/);
  expect(view.getByTestId("lobby-room-plain").props.accessibilityLabel).not.toMatch(/Powers/);
});

test("takes a seat at the table the hero card offers, then shows it", async () => {
  const { lobby, view } = await openLobby();
  await deliver(lobby, ROOMS, HERO_AND_ROW);

  // The one offer, heard the same way wherever it is met: the hero's button says what a row says.
  expect(view.getByTestId("parlor-featured-join").props.accessibilityLabel).toBe(
    "Join Table hero, $500 buy-in, blinds $5 and $10, 5 of 6 seats taken, a hand in play",
  );

  await fireEvent.press(view.getByTestId("parlor-featured-join"));

  await waitFor(() => expect(join).toHaveBeenCalledWith("hero"));
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith({ pathname: "/online/[roomId]", params: { roomId: "hero" } }),
  );
});

test("takes a seat at the table a row names, then shows it", async () => {
  const { lobby, view } = await openLobby();
  await deliver(lobby, ROOMS, HERO_AND_ROW);

  await fireEvent.press(view.getByTestId("lobby-room-row"));

  await waitFor(() => expect(join).toHaveBeenCalledWith("row"));
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith({ pathname: "/online/[roomId]", params: { roomId: "row" } }),
  );
});

test("routes back to the seat already held instead of joining it a second time", async () => {
  const { lobby, view } = await openLobby();
  activeRoomId.mockReturnValue("hero");
  await deliver(lobby, ROOMS, HERO_AND_ROW);

  await fireEvent.press(view.getByTestId("parlor-featured-join"));

  // A room counts connections, not identities: a second `joinById` would take a second seat.
  expect(join).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith({
    pathname: "/online/[roomId]",
    params: { roomId: "hero" },
  });
});

test("offers the table already held as a way back, not as a join", async () => {
  const { lobby, view } = await openLobby();
  activeRoomId.mockReturnValue("mine");
  await deliver(lobby, ROOMS, [...HERO_AND_ROW, table("mine")]);

  const mine = view.getByTestId("lobby-room-mine");
  expect(within(mine).getByText("YOUR TABLE")).toBeOnTheScreen();
  expect(mine.props.accessibilityLabel).toBe(
    "Your table, Table mine, $500 buy-in, blinds $5 and $10, 1 of 6 seats taken, waiting for players",
  );

  const row = view.getByTestId("lobby-room-row");
  expect(within(row).getByText("JOIN")).toBeOnTheScreen();
  expect(row.props.accessibilityLabel).toContain("Join Table row");
});

test("a full table you are seated at is still the way back to your seat", async () => {
  const { lobby, view } = await openLobby();
  activeRoomId.mockReturnValue("mine");
  await deliver(lobby, ROOMS, [...HERO_AND_ROW, table("mine", { clients: 6, maxClients: 6 })]);

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
    ...HERO_AND_ROW,
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

test("still features a table when every table is full, and offers nothing to press", async () => {
  const { lobby, view } = await openLobby();

  // A room with no seat in it is still a room: the card says why it cannot be taken rather than
  // showing an empty parlour beside a list of full tables.
  await deliver(lobby, ROOMS, [table("full", { clients: 6, maxClients: 6 })]);

  const card = within(view.getByTestId("parlor-featured"));
  expect(card.getByText("TABLE FULL")).toBeOnTheScreen();
  expect(view.getByTestId("parlor-featured-join")).toBeDisabled();
});

test("says why a join was refused and asks for the list again", async () => {
  const { lobby, view } = await openLobby();
  await deliver(lobby, ROOMS, HERO_AND_ROW);
  join.mockRejectedValue(new Error("That table is full or has just closed."));

  await fireEvent.press(view.getByTestId("lobby-room-row"));

  await waitFor(() =>
    expect(sentence(view, "lobby-refusal")).toBe("That table is full or has just closed."),
  );
  // The refusal is never a card stuck on "taking your seat", and a seat taken under us is what
  // the list has to be asked about again.
  expect(push).not.toHaveBeenCalled();
  expect(lobby.send).toHaveBeenCalledWith("filter");
});

test("surfaces a dropped subscription beside the cards it already had, and re-subscribes on retry", async () => {
  const { lobby, view } = await openLobby();
  await deliver(lobby, ROOMS, HERO_AND_ROW);

  await deliver(lobby, LEFT);

  expect(sentence(view, "lobby-error")).toBe(
    "Lost the table list. Check your connection and try again.",
  );
  // The last list the server sent stays up: a stale card beats an empty parlour.
  expect(view.getByTestId("lobby-room-row")).toBeOnTheScreen();

  const rejoined = subscription();
  joinOrCreate.mockResolvedValue(rejoined);
  await fireEvent.press(view.getByTestId("lobby-retry"));

  await waitFor(() => expect(joinOrCreate).toHaveBeenCalledTimes(2));
  // The retry is a fresh subscription, so the list the server pushes is the one it sends it.
  await waitFor(() => expect(rejoined.onMessage).toHaveBeenCalled());
  await deliver(rejoined, ROOMS, [table("beta"), table("gamma")]);

  expect(view.queryByTestId("lobby-error")).toBeNull();
  // The list the new subscription pushes is the one on screen: beta takes the hero card, gamma
  // the row, and the table the dead subscription was holding is gone.
  expect(within(view.getByTestId("parlor-featured")).getByText("Table beta")).toBeOnTheScreen();
  expect(view.getByTestId("lobby-room-gamma")).toBeOnTheScreen();
  expect(view.queryByTestId("lobby-room-row")).toBeNull();
});

test("pulls the list again when the room is dragged down", async () => {
  const { lobby, view } = await openLobby();
  await deliver(lobby, ROOMS, HERO_AND_ROW);

  const scroll = view.getByTestId("lobby-scroll");
  await act(async () => {
    scroll.props.refreshControl.props.onRefresh();
  });

  // The subscription is live, so a refresh is the server's own "send me the list" rather than a
  // second connection — and the gesture stays armed until that list lands.
  expect(lobby.send).toHaveBeenCalledWith("filter");
  expect(scroll.props.refreshControl.props.refreshing).toBe(true);

  await deliver(lobby, ROOMS, HERO_AND_ROW);
  expect(view.getByTestId("lobby-scroll").props.refreshControl.props.refreshing).toBe(false);
});

test("leaves the room the way it arrived, and falls back to the menu when it arrived cold", async () => {
  const { view } = await openLobby();

  await fireEvent.press(view.getByTestId("parlor-back"));
  expect(router.back).toHaveBeenCalled();

  (router.canGoBack as unknown as jest.Mock).mockReturnValue(false);
  await fireEvent.press(view.getByTestId("parlor-back"));
  expect(router.replace).toHaveBeenCalledWith("/");
});

test("opens the create sheet when home sent a friend table, and drops the ask", async () => {
  // Home's "Play a Friend" (STO-581) is the lobby with its create sheet already open.
  (useLocalSearchParams as unknown as jest.Mock).mockReturnValueOnce({ create: "1" });
  const { view } = await openLobby();

  expect(view.getByTestId("create-table-sheet").props.isPresented).toBe(true);
  expect(router.setParams).toHaveBeenCalledWith({ create: undefined });
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

test("keeps the create actions outside the scrolling fields", async () => {
  const { view } = await openLobby();
  await openForm(view);

  const sheetScroll = view.getByTestId("create-table-scroll");
  expect(within(sheetScroll).queryByTestId("create-table-submit")).toBeNull();
  expect(within(sheetScroll).queryByTestId("create-table-cancel")).toBeNull();
  const actions = within(view.getByTestId("create-table-actions"));
  expect(actions.getByTestId("create-table-submit")).toBeOnTheScreen();
  expect(actions.getByTestId("create-table-cancel")).toBeOnTheScreen();
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
    "Seats take a whole number from 2 to 4.",
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
    expect(create).toHaveBeenCalledWith({
      name: "Sunday felt",
      buyIn: 5_000,
      maxSeats: 3,
      powerUps: { deal: "off" },
    }),
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

// Classic is the default the form opens on: the create above names no setting and sends "off".
test("creates a Wild table when the form says so", async () => {
  const { view } = await openLobby();
  const name = await openForm(view);

  await fireEvent.changeText(name, "Wild night");
  await chooseOption(view, "create-table-power-ups", "choose3");
  await pressInSheet(view, "create-table-submit");

  await waitFor(() =>
    expect(create).toHaveBeenCalledWith({
      name: "Wild night",
      buyIn: 500,
      maxSeats: 4,
      powerUps: { deal: "choose3" },
    }),
  );
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
