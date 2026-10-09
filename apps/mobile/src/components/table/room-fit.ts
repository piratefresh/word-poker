import type { PixelSize, SeatBounds } from "./table-fit";
import type { SeatAnchor } from "./table-layout";

/** The room fit's own gutter: the least space any seat keeps from the room's edges. */
export const ROOM_GUTTER = 12;

/**
 * Spread seats over a room's play area while keeping their full chrome inside it.
 *
 * `topChrome` is chrome hanging over the room's own top edge — the header's tag row — that no
 * seat may sit under: the seats start below it, where the rest of the room's edges keep the
 * same gutter.
 */
export function placeSeatsInRoom(
  seats: readonly SeatAnchor[],
  size: PixelSize,
  seatBounds: SeatBounds,
  appearanceWidth: number,
  topChrome = 0,
): SeatAnchor[] {
  const bounds = seats.map((seat) => seatBounds(seat, appearanceWidth, seats.length));
  const top = ROOM_GUTTER + topChrome + Math.max(0, ...bounds.map((bound) => bound.top));
  // The ring's top and bottom seats reach the room's top and bottom, not the ring's inset.
  const minY = Math.min(...seats.map((seat) => seat.y));
  const maxY = Math.max(...seats.map((seat) => seat.y));
  const spanY = maxY - minY || 1;
  // The hero has no opponent rack. Reserve the lower edge for the seats that actually sit there.
  const bottom = ROOM_GUTTER + Math.max(
    0,
    ...seats.flatMap((seat, index) => seat.y === maxY ? [bounds[index].bottom] : []),
  );
  const height = Math.max(0, size.height - top - bottom);
  return seats.map((seat, index) => ({
    ...seat,
    x: size.width > 0
      ? Math.max(
          ROOM_GUTTER + bounds[index].left,
          Math.min(size.width - ROOM_GUTTER - bounds[index].right, seat.x * size.width),
        ) / size.width
      : 0.5,
    y: size.height > 0
      ? Math.min(
          size.height - ROOM_GUTTER - bounds[index].bottom,
          top + ((seat.y - minY) / spanY) * height,
        ) / size.height
      : 0.5,
  }));
}
