import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import {
  SUPPORTED_SEAT_COUNTS,
  TABLE_FELT,
  TABLE_RAIL,
  computeTableLayout,
  fitTable,
  placeSeatsOnFelt,
  type NormEllipse,
  type PixelSize,
  type SeatAnchor,
  type SeatCount,
} from "@/components/table";
import { placeSeatsInRoom } from "@/components/table/room-fit";
import { MODE_TAG_BLOCK } from "@/components/hud/top-bar/banner";

import { FOUR_PLAYER_FLOP_FIXTURE } from "./game-fixtures";
import { PlayerSeat } from "./primitives";
import type { GamePlayer } from "./game-types";
import {
  COMMUNITY_ROW_HEIGHT,
  MIN_AVATAR,
  avatarDiameter,
  playerSeatBounds,
  seatDirection,
  seatMetrics,
  tableSeating,
  tabletopFitsTopChrome,
  tabletopSeatAngles,
  tabletopSeatBounds,
} from "./seat-metrics";

/** Table regions from a phone up to a 1080p desktop window. */
const BOXES: [number, number][] = [
  [375, 300],
  [390, 300],
  [768, 560],
  [1008, 330],
  [1264, 360],
  [1350, 420],
  [1584, 520],
  [1904, 640],
];

function ringSeats(seatCount: SeatCount): SeatAnchor[] {
  return computeTableLayout({ seatCount }).seats;
}

/** The seats as the game screen places them: inside the table, for a felt `size`. */
function placed(seatCount: SeatCount, size: PixelSize): SeatAnchor[] {
  return placeSeatsOnFelt(ringSeats(seatCount), size, playerSeatBounds, seatCount);
}

/** The table as `PokerTable` fits it with its seats on the felt, edge to edge. */
function fitOnFelt(box: PixelSize, seatCount: SeatCount = 4) {
  return fitTable(box, ringSeats(seatCount), playerSeatBounds, 0, seatCount, (size) =>
    placed(seatCount, size),
  );
}

function inside(x: number, y: number, e: NormEllipse, size: PixelSize, slack = 0.5): boolean {
  const dx = (x - e.cx * size.width) / (e.rx * size.width + slack);
  const dy = (y - e.cy * size.height) / (e.ry * size.height + slack);
  return dx * dx + dy * dy <= 1;
}

function seatBox(anchor: SeatAnchor, size: PixelSize, seatCount: SeatCount) {
  const e = playerSeatBounds(anchor, size.width, seatCount);
  const x = anchor.x * size.width;
  const y = anchor.y * size.height;
  return { left: x - e.left, right: x + e.right, top: y - e.top, bottom: y + e.bottom, x, y, e };
}

test("draws a 64-point avatar at a 640-point felt, and follows the felt from there", () => {
  expect(avatarDiameter(640)).toBe(64);
  expect(avatarDiameter(960)).toBe(96);
  expect(avatarDiameter(1280)).toBe(128);
});

test("never draws an avatar under the phone's 38 points", () => {
  expect(avatarDiameter(0)).toBe(MIN_AVATAR);
  expect(avatarDiameter(300)).toBe(MIN_AVATAR);
  expect(avatarDiameter(380)).toBe(MIN_AVATAR);
  expect(avatarDiameter(400)).toBe(40);
});

test("scales the whole seat by the avatar's own factor", () => {
  const small = seatMetrics(380);
  const large = seatMetrics(760);

  expect(large.scale / small.scale).toBeCloseTo(large.avatar / small.avatar);
  expect(large.width / small.width).toBeCloseTo(large.scale / small.scale);
  expect(large.nameSize / small.nameSize).toBeCloseTo(large.scale / small.scale);
  expect(large.chip / small.chip).toBeCloseTo(large.scale / small.scale);
  expect(large.avatarBorder / small.avatarBorder).toBeCloseTo(large.scale / small.scale);
});

test("hangs every seat's labels under its avatar at up to four seats, and beside it past that", () => {
  for (const anchor of ringSeats(4)) expect(seatDirection(anchor, 4)).toBe("stacked");
  const [hero, left, , , , right] = ringSeats(6);
  expect(seatDirection(hero, 6)).toBe("right");
  expect(seatDirection(left, 6)).toBe("left");
  expect(seatDirection(right, 6)).toBe("right");
});

describe("seating the players inside the table", () => {
  test.each(BOXES)("keeps every seat inside the rail, avatars on the felt bar the far seat's, in a %i×%i box", (width, height) => {
    for (const count of SUPPORTED_SEAT_COUNTS) {
      const fit = fitOnFelt({ width, height }, count);
      const size = fit.size;
      for (const anchor of placed(count, size)) {
        const box = seatBox(anchor, size, count);
        // The near seat (the hero's) may hang its labels below the rail, toward the player.
        const near = Math.sin(anchor.angle) > 0.9;
        const corners = [
          [box.left, box.top],
          [box.right, box.top],
          [box.left, box.bottom],
          [box.right, box.bottom],
        ];
        for (const [x, y] of near ? corners.slice(0, 2) : corners) {
          expect(inside(x, y, TABLE_RAIL, size)).toBe(true);
        }
        // Whatever hangs past the rail still fits the room the table was given.
        expect(fit.origin.y + box.bottom).toBeLessThanOrEqual(height + 0.5);
        expect(fit.origin.y + box.top).toBeGreaterThanOrEqual(-0.5);
        // The far seat sits up on the far rail; every other avatar sits on the felt.
        const far = Math.sin(anchor.angle) < -0.9;
        const core = box.e.core ?? 0;
        for (let i = 0; i < (far ? 0 : 8); i++) {
          const a = (i / 8) * 2 * Math.PI;
          expect(inside(box.x + Math.cos(a) * core, box.y + Math.sin(a) * core, TABLE_FELT, size)).toBe(true);
        }
      }
    }
  });

  test.each(BOXES)("never overlaps two seats of a four-seat table in a %i×%i box", (width, height) => {
    const { size } = fitOnFelt({ width, height });
    const boxes = placed(4, size).map((a) => seatBox(a, size, 4));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart).toBe(true);
      }
    }
  });

  test("leaves the pot's middle clear between the far seat and the hero", () => {
    for (const [width, height] of BOXES) {
      const { size } = fitOnFelt({ width, height });
      const [hero, , top] = placed(4, size).map((a) => seatBox(a, size, 4));
      // The pot at the phone size is about 50 points tall, and grows with the seats.
      expect(hero.top - top.bottom).toBeGreaterThanOrEqual(50 * seatMetrics(size.width).scale);
    }
  });

  test("keeps the hero at the bottom and the seats in their order around the table", () => {
    const size = fitOnFelt({ width: 375, height: 300 }).size;
    const [hero, left, top, right] = placed(4, size);
    expect(hero.y).toBeGreaterThan(left.y);
    expect(top.y).toBeLessThan(left.y);
    expect(left.x).toBeLessThan(hero.x);
    expect(right.x).toBeGreaterThan(hero.x);
  });

  test("grows the avatars with the room the table is given", () => {
    let last = 0;
    for (const [width, height] of [[375, 300], [768, 560], [1904, 640]]) {
      const avatar = avatarDiameter(fitOnFelt({ width, height }).size.width);
      expect(avatar).toBeGreaterThanOrEqual(last);
      last = avatar;
    }
    expect(last).toBeGreaterThan(64);
  });
});

describe("the rendered seat", () => {
  const hero = FOUR_PLAYER_FLOP_FIXTURE.players[0] as GamePlayer;
  const [heroAnchor, sideAnchor] = ringSeats(4);

  function renderSeat(
    tableWidth: number,
    player: GamePlayer | null = hero,
    anchor: SeatAnchor = heroAnchor,
  ) {
    return render(
      <PlayerSeat
        anchor={anchor}
        isDealer={false}
        scale={tableWidth / 640}
        seat={player}
        seatCount={4}
        size={{ width: tableWidth, height: tableWidth / 1.46 }}
      />,
    );
  }

  test("prints a power's tag beside the street's action, and nothing without one (§44)", async () => {
    const tagged = await renderSeat(640, { ...hero, status: "call", powerTag: "WILD" }, sideAnchor);
    expect(tagged.getByText("CALL")).toBeTruthy();
    expect(tagged.getByTestId(`seat-power-tag-${hero.id}`)).toHaveTextContent("WILD");
    await tagged.unmount();

    const plain = await renderSeat(640, { ...hero, status: "call" }, sideAnchor);
    expect(plain.queryByTestId(`seat-power-tag-${hero.id}`)).toBeNull();
  });

  test.each(["bet", "raise"] as const)("prints the %s round total in the status pill", async (status) => {
    const view = await renderSeat(380, { ...hero, status, bet: 1200, powerTag: "WILD" });
    const label = status === "raise" ? "RAISE TO $1,200" : "BET $1,200";
    expect(view.getByText(label)).toBeTruthy();
    expect(view.getByTestId(`seat-power-tag-${hero.id}`)).toHaveTextContent("WILD");
  });

  test("keeps bare action labels when no wager amount is available", async () => {
    const view = await renderSeat(380, { ...hero, status: "raise" });
    expect(view.getByText("RAISE")).toBeTruthy();
  });

  test.each([380, 640, 960, 1280])(
    "centres a side seat's avatar on its anchor at a %i-point felt",
    async (tableWidth) => {
      const view = await renderSeat(tableWidth, hero, sideAnchor);
      const d = avatarDiameter(tableWidth);
      const seat = StyleSheet.flatten(view.getByTestId(`seat-${hero.id}`).props.style);
      const avatar = StyleSheet.flatten(
        view.getByTestId(`seat-avatar-${hero.id}`).props.style,
      );

      expect(avatar.width).toBe(d);
      expect(avatar.height).toBe(d);
      // The column's top is the avatar's top, and the avatar is centred across the column: the
      // avatar's centre is the anchor (0, 0), whatever hangs below it.
      expect(seat.top).toBe(-d / 2);
      expect(seat.left).toBe(-seat.width / 2);
    },
  );

  test.each([380, 640, 960, 1280])(
    "centres the hero's avatar on its anchor, labels under it, at a %i-point felt",
    async (tableWidth) => {
      const view = await renderSeat(tableWidth);
      const d = avatarDiameter(tableWidth);
      const seat = StyleSheet.flatten(view.getByTestId(`seat-${hero.id}`).props.style);

      expect(seat.flexDirection).not.toBe("row");
      expect(seat.top).toBe(-d / 2);
      expect(seat.left).toBe(-seat.width / 2);
    },
  );

  test("keeps the avatar on its anchor however full the seat is", async () => {
    const full: GamePlayer = {
      ...hero,
      name: "A Very Long Player Name Indeed",
      roles: ["dealer", "small-blind", "big-blind"],
      bet: 1200,
      status: "winner",
    };
    for (const anchor of [heroAnchor, sideAnchor]) {
      const bare = await renderSeat(640, hero, anchor);
      const busy = await renderSeat(640, full, anchor);

      const bareSeat = StyleSheet.flatten(bare.getByTestId(`seat-${hero.id}`).props.style);
      const busySeat = StyleSheet.flatten(busy.getByTestId(`seat-${hero.id}`).props.style);
      expect(busySeat.top).toBe(bareSeat.top);
      expect(busySeat.left).toBe(bareSeat.left);
    }
  });

  test("an open seat sits on its anchor the same way", async () => {
    const view = await renderSeat(960, null);
    const seat = StyleSheet.flatten(view.getByTestId("seat-open").props.style);

    expect(seat.top).toBe(-avatarDiameter(960) / 2);
    expect(seat.left).toBe(-seat.width / 2);
  });
});

test.each([2, 4, 6, 9])("seats the hero at the bottom and %i-seat opponents across the top, left to right", (count) => {
  const [hero, ...opponents] = tabletopSeatAngles(count);
  expect(opponents).toHaveLength(count - 1);
  expect(Math.sin(hero)).toBe(1);
  for (const angle of opponents) expect(Math.sin(angle)).toBeLessThan(-0.3);
  const xs = opponents.map(Math.cos);
  expect([...xs].sort((a, b) => a - b)).toEqual(xs);
});

describe("the tabletop room's seating", () => {
  /**
   * The seats as the game screen places them: the tabletop seating, in a room of that size,
   * under the tag row the header hangs over the room's top.
   */
  function placedInRoom(seatCount: SeatCount, room: PixelSize): SeatAnchor[] {
    const { layoutConfig } = tableSeating(seatCount, true);
    const ring = computeTableLayout({ seatCount, ...layoutConfig });
    return placeSeatsInRoom(ring.seats, room, tabletopSeatBounds, room.width, MODE_TAG_BLOCK);
  }

  test.each(BOXES)(
    "lines a four-player table's opponents up across the top, the hero below them, in a %i×%i room",
    (width, height) => {
      const room = { width, height };
      const [hero, ...opponents] = placedInRoom(4, room);

      for (const opponent of opponents) {
        expect(opponent.y).toBeCloseTo(opponents[0].y, 10);
      }
      expect(hero.y).toBeGreaterThan(opponents[0].y);
      // Level seats are only placed with the room to sit level: no seat's own column may
      // reach into its neighbour's. (A seat's bet chip hangs past its column by design — it
      // sits level with the avatars, where its neighbour's column is clear.)
      const column = seatMetrics(width, true).width;
      for (let i = 1; i < opponents.length; i++) {
        expect((opponents[i].x - opponents[i - 1].x) * width).toBeGreaterThanOrEqual(column);
      }
    },
  );

  test("leaves the community row clear of the opponents' seats with the mode's tag above them", () => {
    const room = { width: 402, height: 551 };
    expect(tabletopFitsTopChrome(room.height, room.width, MODE_TAG_BLOCK)).toBe(true);

    const { layoutConfig } = tableSeating(4, true);
    const [, ...opponents] = placedInRoom(4, room);
    const scale = seatMetrics(room.width, true).scale;
    const labels = opponents.map(
      (seat) => seat.y * room.height + tabletopSeatBounds(seat, room.width, 4).bottom,
    );
    const communityTop =
      (layoutConfig.communityY ?? 0) * room.height - (COMMUNITY_ROW_HEIGHT / 2) * scale;

    expect(communityTop).toBeGreaterThan(Math.max(...labels));
  });

  test.each([
    // The room a table region gets, measured on the web build at that window.
    ["402×874", 402, 551, true],
    ["412×915", 412, 592, true],
    ["390×844", 390, 521, true],
    ["360×800", 360, 519, true],
    // The tag tucks under the capsule's foot, so it now clears the seats here too.
    ["375×812", 375, 489, true],
    ["375×667", 375, 386, false],
  ] as [string, number, number, boolean][])(
    "hangs the mode's tag over a %s room only where its seats still clear the community row",
    (_window, width, roomHeight, fits) => {
      expect(tabletopFitsTopChrome(roomHeight, width, MODE_TAG_BLOCK)).toBe(fits);
    },
  );

  test("gives up the tag before it lets the seats reach the community row", () => {
    // A room with the space for the row alone: the tag over it is one row too many.
    const room = 470;
    const width = 402;

    expect(tabletopFitsTopChrome(room, width, 0)).toBe(true);
    expect(tabletopFitsTopChrome(room, width, MODE_TAG_BLOCK)).toBe(false);
  });

  test("keeps a fuller table's opponents spread down the arc: that many would not sit level", () => {
    const { layoutConfig } = tableSeating(9, true);
    const opponents = computeTableLayout({ seatCount: 9, ...layoutConfig }).seats.slice(1);
    const ys = opponents.map((seat) => seat.y);

    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.1);
  });
});
