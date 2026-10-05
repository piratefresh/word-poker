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

import { FOUR_PLAYER_FLOP_FIXTURE } from "./game-fixtures";
import { PlayerSeat } from "./primitives";
import type { GamePlayer } from "./game-types";
import {
  MIN_AVATAR,
  avatarDiameter,
  playerSeatBounds,
  seatDirection,
  seatMetrics,
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
