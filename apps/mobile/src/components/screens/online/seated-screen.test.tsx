import { act, fireEvent, render, type RenderResult } from "@testing-library/react-native";

import { WAITING_PHASE, blindsFor, type RoomPhase } from "@wordpoker/contracts";

import type { RoomSessionView, TableSnapshot } from "@/features/online/room-session";

import { SeatedScreen } from "./seated-screen";

/** The room the route names — the table every test is routed to. */
const mockRoomId = "table-7f3a";

/**
 * The table the snapshot describes: §2's middle buy-in with the blinds §2 derives from it, so the
 * copy is checked against numbers the game uses rather than numbers the test invented.
 */
const TABLE: TableSnapshot = {
  name: "Thursday Felt",
  buyIn: 5_000,
  ...blindsFor(5_000),
  maxSeats: 6,
  powerUps: { deal: "off" },
  seats: 3,
  phase: WAITING_PHASE,
};

const REFUSAL = "That table is full or has just closed.";

/** The session, as the room-session module publishes it: one view the screen reads. */
let mockSession: RoomSessionView = { status: "idle" };

const mockJoinTable = jest.fn(async (_roomId: string) => {});
const mockLeaveTable = jest.fn(async () => {});
const mockDismissTo = jest.fn();

// `useActiveRoomId` is the seat the session holds — the session's `seated` room, or none. The
// screen asks it before joining, so a test seated at the routed room must not see a join.
jest.mock("@/features/online/room-session", () => ({
  joinTable: (roomId: string) => mockJoinTable(roomId),
  leaveTable: () => mockLeaveTable(),
  useRoomSession: () => mockSession,
  useActiveRoomId: () =>
    mockSession.status === "seated" ? (mockSession.roomId ?? null) : null,
  // This suite is the seat lifecycle, not the live hand: it never hands the felt a room, so the
  // felt's own suite (online-felt) drives the hand. A live-hand snapshot here still renders the
  // table's card, which is what these tests read.
  useSeatedRoom: () => null,
}));

// The dictionary loads through a dynamic import Jest cannot run, and this suite never reaches
// the felt that needs it: the seat lifecycle holds the table's card, dictionary or not.
jest.mock("@/features/table/use-dictionary", () => ({ useDictionary: () => null }));

// expo-router reaches a navigation package Jest cannot parse. The screen reads the room it was
// routed to, and its two ways out both `dismissTo` the lobby it was pushed from.
jest.mock("expo-router", () => ({
  router: { dismissTo: (href: string) => mockDismissTo(href) },
  useLocalSearchParams: () => ({ roomId: mockRoomId }),
}));

// This suite never reaches the felt that needs it (above), but it is still in the module graph:
// the real module pulls in Better Auth's client, which Jest cannot parse.
jest.mock("@/lib/quests-provider", () => ({
  useQuests: () => ({ lastCompletions: [], reportHand: jest.fn() }),
}));

/**
 * `@expo/ui` draws through the platform's own toolkit: a text is a native adapter view whose
 * content arrives as the `text` prop, so the screen's copy is read from there — the same way
 * the felt's suites read the `label` a native button is handed.
 */
function textOf(view: RenderResult, testID: string): string {
  return String(view.getByTestId(testID).props.text);
}

/** The session's view as the library would publish it for a seat it is holding. */
function seated(table?: TableSnapshot): RoomSessionView {
  return table === undefined
    ? { status: "seated", roomId: mockRoomId }
    : { status: "seated", roomId: mockRoomId, table };
}

/** A session that has moved on, re-read by the screen through its hook. */
async function reshow(view: RenderResult, next: RoomSessionView) {
  mockSession = next;
  await view.rerender(<SeatedScreen />);
}

describe("<SeatedScreen />", () => {
  beforeEach(() => {
    mockSession = { status: "idle" };
    mockJoinTable.mockReset();
    mockJoinTable.mockResolvedValue(undefined);
    mockLeaveTable.mockReset();
    mockLeaveTable.mockResolvedValue(undefined);
    mockDismissTo.mockReset();
  });

  test("takes the seat the route names on a cold mount", async () => {
    const view = await render(<SeatedScreen />);

    // A deep link, or a reload of `/online/<roomId>`, holds no seat yet: the route is the
    // only thing that says which table this is, so the mount is what sits down at it.
    expect(mockJoinTable).toHaveBeenCalledTimes(1);
    expect(mockJoinTable).toHaveBeenCalledWith(mockRoomId);
    expect(view.getByTestId("seated-screen")).toBeOnTheScreen();
    expect(view.getByTestId("seated-joining")).toBeOnTheScreen();
  });

  test("stays put on a mount that already holds that seat", async () => {
    mockSession = seated(TABLE);

    const view = await render(<SeatedScreen />);

    // The lobby's row and a create that just resolved both arrive with the seat already
    // taken. A seat is a connection, so asking again would take a second one.
    expect(mockJoinTable).not.toHaveBeenCalled();
    expect(view.getByTestId("seated-table")).toBeOnTheScreen();
  });

  test("waits out the round trip between the seat and its snapshot", async () => {
    // The room's synced state arrives one round trip after the seat does, so a seated
    // session can hold no table yet — and neither the copy nor the numbers may guess.
    mockSession = seated();

    const view = await render(<SeatedScreen />);

    expect(mockJoinTable).not.toHaveBeenCalled();
    expect(textOf(view, "seated-joining-title")).toBe("Taking your seat…");
    expect(view.queryByTestId("seated-table")).toBeNull();
    expect(view.queryByTestId("seated-name")).toBeNull();
    expect(view.queryByTestId("seated-buy-in")).toBeNull();
    expect(view.queryByTestId("seated-seats")).toBeNull();
  });

  test("shows a refused join's sentence with the way back to the lobby", async () => {
    mockJoinTable.mockRejectedValueOnce(new Error(REFUSAL));

    const view = await render(<SeatedScreen />);
    // The join's refusal is published by the session; the screen renders that state.
    await act(async () => {});
    await reshow(view, { status: "error", roomId: mockRoomId, error: REFUSAL });

    expect(view.getByTestId("seated-error")).toBeOnTheScreen();
    expect(textOf(view, "seated-message")).toBe(REFUSAL);

    await fireEvent.press(view.getByTestId("seated-back-to-lobby"));

    expect(mockDismissTo).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith("/online");
  });

  test("renders the table's own face from the snapshot", async () => {
    mockSession = seated(TABLE);

    const view = await render(<SeatedScreen />);

    expect(textOf(view, "seated-name")).toBe(TABLE.name);
    expect(textOf(view, "seated-buy-in")).toBe("$5,000");
    expect(textOf(view, "seated-blinds")).toBe("$50 / $100");
    expect(textOf(view, "seated-seats")).toBe("3 / 6");
    expect(textOf(view, "seated-powers")).toBe("Classic");
    expect(textOf(view, "seated-status")).toBe("WAITING");
  });

  test("says a Wild table deals powers before the first hand does (§40)", async () => {
    mockSession = seated({ ...TABLE, powerUps: { deal: "choose3" } });

    const view = await render(<SeatedScreen />);

    expect(textOf(view, "seated-powers")).toBe("Wild");
    expect(view.getByTestId("seated-table").props.accessibilityLabel).toMatch(/, Wild Powers,/);
  });

  test("reads the phase as the table's status, and the seats as they fill", async () => {
    mockSession = seated(TABLE);

    const view = await render(<SeatedScreen />);

    // The waiting room and the hand's rounds are the two things a waiting player decides on:
    // whether the table is filling, and whether it is playing.
    const phases: [RoomPhase, string][] = [
      [WAITING_PHASE, "WAITING"],
      ["preflop", "IN HAND"],
      ["river", "IN HAND"],
    ];

    for (const [phase, status] of phases) {
      await reshow(view, seated({ ...TABLE, phase, seats: 4 }));

      expect(textOf(view, "seated-status")).toBe(status);
      expect(textOf(view, "seated-seats")).toBe("4 / 6");
    }
  });

  test("leaves the table and returns to the lobby", async () => {
    mockSession = seated(TABLE);

    const view = await render(<SeatedScreen />);
    await fireEvent.press(view.getByTestId("seated-leave"));

    expect(mockLeaveTable).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith("/online");
  });

  test("leaves once however many times the control is tapped", async () => {
    mockSession = seated(TABLE);
    // A leave that has not come back yet: the control is disarmed while it is in flight.
    let settle: () => void = () => {};
    mockLeaveTable.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );

    const view = await render(<SeatedScreen />);
    await fireEvent.press(view.getByTestId("seated-leave"));
    await fireEvent.press(view.getByTestId("seated-leave"));

    expect(mockLeaveTable).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle();
    });

    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });

  test("does not take the seat back as the leave gives it up", async () => {
    // A mount that was routed to a table it already holds — a create, or a row tapped in the
    // lobby — never had to join, and it must not join on the way out either: the session
    // publishes the leave's own idle state while this screen is still mounted, and taking the
    // seat again on that flip would put the player back at the table they just left.
    mockSession = seated(TABLE);

    const view = await render(<SeatedScreen />);
    expect(mockJoinTable).not.toHaveBeenCalled();

    await act(async () => {
      mockSession = { status: "idle" };
    });
    await fireEvent.press(view.getByTestId("seated-leave"));

    expect(mockJoinTable).not.toHaveBeenCalled();
  });
});
