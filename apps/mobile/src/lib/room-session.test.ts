/**
 * room-session.test.ts — the one seat this device holds.
 *
 * A room counts connections, not identities: asking for the same table twice takes two seats, so
 * the module's own invariant — one seat per device — is what these tests hold it to. The socket is
 * the test's: `joinById` / `create` hand back a room whose events nothing here has to fire.
 */

import { joinTable, leaveTable } from "./room-session";

jest.mock("./game-client", () => ({
  gameClient: { create: jest.fn(), joinById: jest.fn() },
}));

import { gameClient } from "./game-client";

const joinById = gameClient.joinById as unknown as jest.Mock;

/** A room as the session holds it: the id it is addressed by, and the events it subscribes to. */
interface HeldRoom {
  readonly roomId: string;
  readonly leave: jest.Mock;
  readonly onStateChange: jest.Mock;
  readonly onLeave: jest.Mock;
  readonly onError: jest.Mock;
}

function room(roomId: string): HeldRoom {
  return {
    roomId,
    leave: jest.fn(async () => 0),
    onStateChange: jest.fn(),
    onLeave: jest.fn(),
    onError: jest.fn(),
  };
}

beforeEach(async () => {
  // The module keeps the seat in module state, so each test starts from an empty one.
  await leaveTable();
  joinById.mockReset();
});

test("takes one seat when the same table is asked for twice before the first join lands", async () => {
  const arriving = Promise.withResolvers<HeldRoom>();
  joinById.mockReturnValue(arriving.promise);

  const first = joinTable("table-1");
  const second = joinTable("table-1");

  arriving.resolve(room("table-1"));
  await Promise.all([first, second]);

  expect(joinById).toHaveBeenCalledTimes(1);
  expect(joinById).toHaveBeenCalledWith("table-1");
});

test("gives back a seat that lands after the device has moved on", async () => {
  const arriving = Promise.withResolvers<HeldRoom>();
  joinById.mockReturnValue(arriving.promise);

  const joining = joinTable("table-1");
  // The device gives the seat up before the join answers — a leave, or another screen taking over.
  await leaveTable();

  const late = room("table-1");
  arriving.resolve(late);
  await joining;

  // The seat is not the abandoned request's to keep, so the connection goes back rather than
  // outliving the session that asked for it.
  expect(late.leave).toHaveBeenCalledTimes(1);
});

test("gives up the seat it holds before taking another", async () => {
  const first = room("table-1");
  const second = room("table-2");
  joinById.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

  await joinTable("table-1");
  await joinTable("table-2");

  expect(joinById).toHaveBeenNthCalledWith(1, "table-1");
  expect(joinById).toHaveBeenNthCalledWith(2, "table-2");
  expect(first.leave).toHaveBeenCalledTimes(1);
});
