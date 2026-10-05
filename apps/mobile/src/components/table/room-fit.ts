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
  const left = gutter + Math.max(0, ...bounds.map((bound) => bound.left));
  const right = gutter + Math.max(0, ...bounds.map((bound) => bound.right));
  const top = gutter + Math.max(0, ...bounds.map((bound) => bound.top));
  const bottom = gutter + Math.max(0, ...bounds.map((bound) => bound.bottom));
  const width = Math.max(0, size.width - left - right);
  const height = Math.max(0, size.height - top - bottom);
  // The ring's top and bottom seats reach the room's top and bottom, not the ring's inset.
  const minY = Math.min(...seats.map((seat) => seat.y));
  const spanY = Math.max(...seats.map((seat) => seat.y)) - minY || 1;
  return seats.map((seat) => ({
    ...seat,
    x: size.width > 0 ? (left + seat.x * width) / size.width : 0.5,
    y: size.height > 0 ? (top + ((seat.y - minY) / spanY) * height) / size.height : 0.5,
  }));
}
