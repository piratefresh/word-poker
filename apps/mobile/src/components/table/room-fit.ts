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
  return seats.map((seat) => ({
    ...seat,
    x: size.width > 0 ? (left + seat.x * width) / size.width : 0.5,
    y: size.height > 0 ? (top + seat.y * height) / size.height : 0.5,
  }));
}
