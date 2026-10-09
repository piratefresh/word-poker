import { playerSeatBounds } from "../screens/game/seat-metrics";
import { placeSeatsInRoom } from "./room-fit";
import { computeTableLayout } from "./table-layout";

const seats = computeTableLayout({ seatCount: 4 }).seats;

test.each([
  { width: 360, height: 420 },
  { width: 832, height: 640 },
  { width: 1040, height: 520 },
])("room seats keep badges, chips and labels inside $width × $height", (size) => {
  const appearanceWidth = Math.min(size.width, 560);
  const placed = placeSeatsInRoom(seats, size, playerSeatBounds, appearanceWidth);
  for (const seat of placed) {
    const bounds = playerSeatBounds(seat, appearanceWidth, seats.length);
    const x = seat.x * size.width;
    const y = seat.y * size.height;
    expect(x - bounds.left).toBeGreaterThanOrEqual(12);
    expect(x + bounds.right).toBeLessThanOrEqual(size.width - 12);
    expect(y - bounds.top).toBeGreaterThanOrEqual(12);
    expect(y + bounds.bottom).toBeLessThanOrEqual(size.height - 12);
  }
  // Keep room between the far seat's labels and the hero's avatar for the pot.
  const hero = placed[0];
  const far = placed[2];
  const farBounds = playerSeatBounds(far, appearanceWidth, 4);
  const heroBounds = playerSeatBounds(hero, appearanceWidth, 4);
  expect((hero.y - far.y) * size.height - farBounds.bottom - heroBounds.top)
    .toBeGreaterThan(100);
});

test("a wider room spreads seats without growing their chrome", () => {
  const small = placeSeatsInRoom(seats, { width: 420, height: 520 }, playerSeatBounds, 420);
  const wide = placeSeatsInRoom(seats, { width: 1040, height: 520 }, playerSeatBounds, 420);
  const smallSpan = (small[3].x - small[1].x) * 420;
  const wideSpan = (wide[3].x - wide[1].x) * 1040;
  expect(wideSpan).toBeGreaterThan(smallSpan * 2);
  expect(wide[0].y).toBe(small[0].y);
  expect(wide.map((seat) => seat.key)).toEqual(seats.map((seat) => seat.key));
});

test("starts the seats below chrome hanging over the room's top", () => {
  const size = { width: 420, height: 520 };
  const appearanceWidth = 420;
  const HANGING = 34;
  const bare = placeSeatsInRoom(seats, size, playerSeatBounds, appearanceWidth);
  const cleared = placeSeatsInRoom(seats, size, playerSeatBounds, appearanceWidth, HANGING);

  for (const seat of cleared) {
    const bounds = playerSeatBounds(seat, appearanceWidth, seats.length);
    expect(seat.y * size.height - bounds.top).toBeGreaterThanOrEqual(12 + HANGING);
  }
  // The seats already under the hanging chrome — the far ones — are the ones that move.
  expect(bare[2].y).toBeLessThan(cleared[2].y);
  // The hero keeps to the bottom of the room it had: the chrome eats into the band, not the
  // room's own edges.
  expect(cleared[0].y * size.height + playerSeatBounds(cleared[0], appearanceWidth, 4).bottom)
    .toBeLessThanOrEqual(size.height - 12);
});
