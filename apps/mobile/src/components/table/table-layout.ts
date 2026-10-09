/**
 * table-layout.ts — deterministic poker-table geometry.
 *
 * Pure math, no React and no engine/network imports. Everything is expressed in
 * a normalized [0,1] coordinate box (origin top-left, y pointing down) so the
 * geometry can be unit-tested without a renderer and stays stable across
 * resizes: a given seat index always resolves to the same normalized point for
 * a given config, and `resolvePoint` scales it into pixels at paint time.
 *
 * Child animations (deals, chip movement) query these anchors to target stable
 * coordinates instead of reading laid-out view frames, which avoids reflow.
 */

/** Seat counts the table is designed to place without overlap. */
export const SUPPORTED_SEAT_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9] as const;

export type SeatCount = (typeof SUPPORTED_SEAT_COUNTS)[number];

export function isSupportedSeatCount(n: number): n is SeatCount {
  return (SUPPORTED_SEAT_COUNTS as readonly number[]).includes(n);
}

/** A point in the normalized [0,1] table box. */
export interface NormPoint {
  x: number;
  y: number;
}

/** A seat slot placed on the felt ellipse. */
export interface SeatAnchor extends NormPoint {
  /** Stable identity for React keys and animation targets. */
  key: string;
  index: number;
  /** Angle (radians) from table center, y-down. Useful for rotating chrome. */
  angle: number;
}

/** A community-card slot (flop/turn/river reveal position). */
export interface CommunityAnchor extends NormPoint {
  key: string;
  index: number;
}

/** A rectangular region expressed in normalized units. */
export interface NormRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything a table needs to place its chrome, all in normalized units. */
export interface TableLayout {
  seats: SeatAnchor[];
  community: CommunityAnchor[];
  /** Center of the pot chip stack. */
  pot: NormPoint;
  /** Where cards originate when dealt (the deck / burn pile). */
  dealOrigin: NormPoint;
  /** The felt playing surface inside the rail. */
  felt: NormRegion;
  config: ResolvedTableLayoutConfig;
}

export interface TableLayoutConfig {
  seatCount: SeatCount;
  /**
   * Radii of the ellipse the seats sit on, as a fraction of the felt half-box.
   * 1 puts seat centers on the felt edge; <1 pulls them inward.
   */
  seatRadius?: { x: number; y: number };
  seatCenterY?: number;
  /** Number of community slots. Poker uses 5 (flop 3 + turn + river). */
  communitySlots?: number;
  /** Horizontal span the community row occupies, as a fraction of felt width. */
  communitySpan?: number;
  /** Vertical center of the community row, 0 top .. 1 bottom. */
  communityY?: number;
  /** Vertical center of the pot region. */
  potY?: number;
  /**
   * Seats in rows: every seat on one side of the ring takes that side's own rim, so a shallow
   * arc reads as a line of seats across the table rather than a fan (the tabletop room's
   * opponents, where a few seats have the width to sit level).
   */
  seatRows?: boolean;
  /**
   * Optional explicit seat angles (radians, y-down). When omitted, seats are
   * distributed evenly starting from bottom-center (the hero seat).
   */
  seatAngles?: number[];
}

export type ResolvedTableLayoutConfig = Required<
  Omit<TableLayoutConfig, "seatAngles">
> & { seatAngles?: number[] };

const DEFAULTS: Omit<ResolvedTableLayoutConfig, "seatCount"> = {
  seatRadius: { x: 0.9, y: 0.86 },
  seatCenterY: 0.5,
  communitySlots: 5,
  communitySpan: 0.62,
  communityY: 0.44,
  potY: 0.62,
  seatRows: false,
};

/** Bottom-center in y-down space is +90°, so the hero seat lands there. */
const HERO_ANGLE = Math.PI / 2;

/**
 * Evenly distribute `count` seats around the ellipse, hero fixed at
 * bottom-center and the rest fanning clockwise. Deterministic for a given
 * count so tests and animations can rely on it.
 */
export function seatAngles(count: number): number[] {
  const step = (2 * Math.PI) / count;
  return Array.from({ length: count }, (_, i) => HERO_ANGLE + i * step);
}

/**
 * The seat's depth on the ring: how far past the middle it sits, in [-1, 1]. Its own sine —
 * unless the seats sit in rows, where every seat on a side takes that side's rim (`-1` north,
 * `1` south) and the x spread alone places them.
 */
function seatDepth(angle: number, rows: boolean): number {
  const depth = Math.sin(angle);
  return rows ? Math.sign(depth) : depth;
}

function resolveConfig(config: TableLayoutConfig): ResolvedTableLayoutConfig {
  return {
    seatCount: config.seatCount,
    seatRadius: config.seatRadius ?? DEFAULTS.seatRadius,
    seatCenterY: config.seatCenterY ?? DEFAULTS.seatCenterY,
    communitySlots: config.communitySlots ?? DEFAULTS.communitySlots,
    communitySpan: config.communitySpan ?? DEFAULTS.communitySpan,
    communityY: config.communityY ?? DEFAULTS.communityY,
    potY: config.potY ?? DEFAULTS.potY,
    seatRows: config.seatRows ?? DEFAULTS.seatRows,
    seatAngles: config.seatAngles,
  };
}

/**
 * Compute the full normalized layout for a table. Called with just a config, so
 * it is trivially unit-testable; the component multiplies the result by its
 * measured pixel size via `resolvePoint`.
 */
export function computeTableLayout(config: TableLayoutConfig): TableLayout {
  const resolved = resolveConfig(config);
  const { seatCount, seatRadius } = resolved;

  const cx = 0.5;
  const cy = resolved.seatCenterY;
  const rx = seatRadius.x / 2;
  const ry = seatRadius.y / 2;

  const angles = resolved.seatAngles ?? seatAngles(seatCount);

  const seats: SeatAnchor[] = angles.slice(0, seatCount).map((angle, index) => ({
    key: `seat-${index}`,
    index,
    angle,
    x: cx + rx * Math.cos(angle),
    y: cy + ry * seatDepth(angle, resolved.seatRows),
  }));

  const community = computeCommunity(resolved, cx);

  return {
    seats,
    community,
    pot: { x: cx, y: resolved.potY },
    dealOrigin: { x: cx, y: cy },
    felt: { x: 0, y: 0, width: 1, height: 1 },
    config: resolved,
  };
}

function computeCommunity(
  resolved: ResolvedTableLayoutConfig,
  cx: number,
): CommunityAnchor[] {
  const { communitySlots, communitySpan, communityY } = resolved;
  if (communitySlots <= 0) return [];

  // Slot centers spread evenly across the span, centered on the table.
  const left = cx - communitySpan / 2;
  const step = communitySlots === 1 ? 0 : communitySpan / (communitySlots - 1);

  return Array.from({ length: communitySlots }, (_, index) => ({
    key: `community-${index}`,
    index,
    x: communitySlots === 1 ? cx : left + step * index,
    y: communityY,
  }));
}

/**
 * Anchor for the dealer button — sits just inside a given seat, offset toward
 * the table center. Presentational: the caller passes whichever seat currently
 * holds the button.
 */
export function dealerButtonAnchor(seat: NormPoint, inset = 0.14): NormPoint {
  return {
    x: seat.x + (0.5 - seat.x) * inset,
    y: seat.y + (0.5 - seat.y) * inset,
  };
}

/** Scale a normalized point into pixels for a table of the given size. */
export function resolvePoint(
  point: NormPoint,
  size: { width: number; height: number },
): { x: number; y: number } {
  return { x: point.x * size.width, y: point.y * size.height };
}

/** Scale a normalized region into a pixel rect. */
export function resolveRegion(
  region: NormRegion,
  size: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: region.x * size.width,
    y: region.y * size.height,
    width: region.width * size.width,
    height: region.height * size.height,
  };
}
