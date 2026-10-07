import type { PixelSize, SeatBounds } from "./table-fit";
import type { SeatAnchor } from "./table-layout";

/** Spread seats over a room's play area while keeping their full chrome inside it. */
export function placeSeatsInRoom(
  seats: readonly SeatAnchor[],
  size: PixelSize,
  seatBounds: SeatBounds,
  appearanceWidth: number,
): SeatAnchor[] {
  const gutter = 12;
  const bounds = seats.map((seat) => seatBounds(seat, appearanceWidth, seats.length));
  const top = gutter + Math.max(0, ...bounds.map((bound) => bound.top));
  // The ring's top and bottom seats reach the room's top and bottom, not the ring's inset.
  const minY = Math.min(...seats.map((seat) => seat.y));
  const maxY = Math.max(...seats.map((seat) => seat.y));
  const spanY = maxY - minY || 1;
  // The hero has no opponent rack. Reserve the lower edge for the seats that actually sit there.
  const bottom = gutter + Math.max(
    0,
    ...seats.flatMap((seat, index) => seat.y === maxY ? [bounds[index].bottom] : []),
  );
  const height = Math.max(0, size.height - top - bottom);
  return seats.map((seat, index) => ({
    ...seat,
    x: size.width > 0
      ? Math.max(
          gutter + bounds[index].left,
          Math.min(size.width - gutter - bounds[index].right, seat.x * size.width),
        ) / size.width
      : 0.5,
    y: size.height > 0
      ? Math.min(
          size.height - gutter - bounds[index].bottom,
          top + ((seat.y - minY) / spanY) * height,
        ) / size.height
      : 0.5,
  }));
}
