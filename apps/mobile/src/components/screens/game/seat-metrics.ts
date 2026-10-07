/**
 * seat-metrics.ts — one seat's geometry, scaled with the table it sits at.
 *
 * The avatar is 64 points across at a 640-point felt and follows the felt's width from there,
 * never below the 38 a phone seat has always had. Everything else on the seat — the name, the
 * status pill, the stack, the role badges, the bet chip, the borders — is drawn at the phone
 * size and grows by the same factor, so a seat on a wide window is the same seat, larger.
 *
 * `PlayerSeat` draws from these numbers and `playerSeatBounds` reports them to the table's fit,
 * so the seat the table makes room for and the seat that is drawn cannot drift apart.
 */

import type { SeatAnchor, SeatExtents, TableLayoutConfig } from "@/components/table";

/** The avatar at a felt `REFERENCE_TABLE_WIDTH` wide. */
const REFERENCE_AVATAR = 64;
const REFERENCE_TABLE_WIDTH = 640;
const BASE_GAP = 6;
/** The smallest avatar a seat draws, and the size every base measure below is drawn for. */
export const MIN_AVATAR = 38;

/**
 * How far a stacked seat's plate is pulled up over the avatar's rim, as a share of its
 * diameter: the plate tucks behind the avatar, and the label stack below it starts that much
 * higher up (`labelDrop`).
 */
export const PLATE_OVER = 0.22;

/** The seat at `MIN_AVATAR`, in points. Every one of them scales with the avatar. */
const BASE = {
  /** The seat's column: the name truncates inside it. */
  width: 86,
  gap: BASE_GAP,
  /** Between an avatar and the labels beside it: clear of the role badges that overhang it. */
  besideGap: BASE_GAP + 5,
  avatarBorder: 2,
  avatarBorderLit: 3,
  initials: 12,
  badge: 17,
  badgeText: 7,
  badgeGap: 2,
  /** Pinned to the avatar's top-right corner, reaching past it. */
  badgeRight: -6,
  badgeTop: -4,
  nameSize: 8,
  nameLine: 11,
  nameTracking: 0.8,
  nameGap: 3,
  pillGap: 3,
  pillPadX: 6,
  pillPadY: 1,
  pillRadius: 3,
  pillBorder: 1,
  statusSize: 7,
  statusLine: 9,
  statusTracking: 0.8,
  stackSize: 12,
  stackLine: 16,
  stackGap: 2,
  chip: 30,
  chipBorder: 1.5,
  chipText: 10,
  emptyLabelTracking: 1,
  /** A winner's glow radius; `highlightBleed` is how far past the avatar the fit keeps clear. */
  glow: 16,
  /** How far the turn beam's light spreads past the avatar's edge. */
  beamGlow: 7,
  highlightBleed: 8,
  /** The opponent rack's wood box (STO-532), and how its parts sit: the plate tucks over
   *  its top by `rackTuck`, the standing tiles' feet sit `rackFeet` above its bottom, and
   *  the lip re-draws the bottom `rackLip` of it over those feet. Ratios follow the
   *  approved gallery composition of the `opponent-rack-3` art. */
  rackW: 75,
  rackH: 28,
  rackTuck: 2.4,
  rackFeet: 4.3,
  rackLip: 6,
} as const;

type BaseMetrics = { -readonly [K in keyof typeof BASE]: number };

/**
 * Where a seat's labels go: under the avatar (`stacked`), or beside it on the `left` or the
 * `right`, level with it.
 */
export type SeatDirection = "stacked" | "left" | "right";

export type SeatMetrics = BaseMetrics & {
  /** The avatar's diameter. */
  avatar: number;
  /** The avatar over `MIN_AVATAR`: what every other measure was multiplied by. */
  scale: number;
};

/** How far off vertical (as the cosine of its angle) a seat still counts as a top or bottom seat. */
const END_SEAT_SPREAD = 0.3;

/**
 * A seat's layout, from its direction around the table — never from where it was placed, since
 * placement (`placeSeatsOnFelt`) depends on the layout. At up to four seats every seat hangs its
 * name, status and stack under its avatar. A crowded table (five or more, seated on the rail) has
 * no depth for that: its seats put their labels beside the avatar — outward on the sides, and to
 * the right at the top and bottom.
 */
export function seatDirection(anchor: Pick<SeatAnchor, "angle">, seatCount: number): SeatDirection {
  const across = Math.cos(anchor.angle);
  if (seatCount <= 4) return "stacked";
  if (Math.abs(across) < END_SEAT_SPREAD) return "right";
  return across < 0 ? "left" : "right";
}

/** The avatar's diameter for a felt `tableWidth` wide. */
export function avatarDiameter(tableWidth: number): number {
  return Math.max(MIN_AVATAR, Math.round((tableWidth * REFERENCE_AVATAR) / REFERENCE_TABLE_WIDTH));
}

/** Every measure of a seat at a felt `tableWidth` wide. */
export function seatMetrics(tableWidth: number): SeatMetrics {
  const avatar = avatarDiameter(tableWidth);
  const scale = avatar / MIN_AVATAR;
  const scaled = {} as BaseMetrics;
  for (const key of Object.keys(BASE) as (keyof typeof BASE)[]) {
    scaled[key] = BASE[key] * scale;
  }
  return { ...scaled, avatar, scale };
}

/** A side seat, as opposed to the top and bottom ones: it faces the pot sideways. */
function isSideSeat(anchor: Pick<SeatAnchor, "angle">): boolean {
  return Math.abs(Math.cos(anchor.angle)) > Math.abs(Math.sin(anchor.angle));
}

/**
 * Where a seat's bet chip sits, in the seat's own box (its top is the avatar's top edge; its
 * left is the column's left, or the avatar's for a seat whose labels are on its right). The chip
 * is level with the avatar, beside it — for a side seat, on the side that faces the pot, so the
 * eye reads the money going in.
 */
export function betChipOffset(
  anchor: Pick<SeatAnchor, "angle">,
  m: SeatMetrics,
  seatCount = 4,
): { left: number; top: number } {
  const direction = seatDirection(anchor, seatCount);
  const top = (m.avatar - m.chip) / 2;
  if (direction === "left") return { left: m.width + m.besideGap + m.avatar + 4 * m.scale, top };
  if (direction === "right") return { left: -m.chip - 4 * m.scale, top };
  const avatarLeft = (m.width - m.avatar) / 2;
  // A left-hand seat's chip faces the pot on its right; every other seat's goes on the avatar's
  // left — the pot's side for a right-hand seat, and clear of the role badges pinned top-right.
  if (isSideSeat(anchor) && Math.cos(anchor.angle) < 0) {
    return { left: avatarLeft + m.avatar + 4 * m.scale, top };
  }
  return { left: avatarLeft - m.chip - 4 * m.scale, top };
}

/** The label stack's height at its fullest: the plate (its own border and padding around the
 *  name and its coin row), the rack's wood under it, and the status badge under that. */
export function labelBlock(m: SeatMetrics): number {
  return (
    // The plate: `plate`'s border and `paddingVertical`, then its two lines.
    m.scale * 4 +
    m.nameLine +
    m.stackGap +
    m.stackLine +
    // The rack's wood, less the part the plate tucks over.
    m.rackH -
    m.rackTuck +
    // The status badge.
    m.pillGap +
    m.pillBorder * 2 +
    m.pillPadY * 2 +
    m.statusLine
  );
}

/** How far the label stack reaches below the avatar's bottom edge, when it hangs under it: the
 *  plate's top is pulled up over the avatar's rim by `PLATE_OVER`. */
export function labelDrop(m: SeatMetrics): number {
  return labelBlock(m) - m.avatar * PLATE_OVER;
}

/**
 * A seat's fullest reach around its anchor (the avatar's centre) for a felt `tableWidth` wide:
 * the labels under or beside the avatar, the role badges above it, and the bet chip across. It is
 * the same for every state the seat can be in, so a bet, a badge or a turn lighting up never
 * moves a seat. A winner's glow is soft light, not chrome, and is left free to spill.
 *
 * `core` is the avatar: the part of the seat that stays on the felt.
 */
export function playerSeatBounds(anchor: SeatAnchor, tableWidth: number, seatCount = 4): SeatExtents {
  const m = seatMetrics(tableWidth);
  const radius = m.avatar / 2;
  const direction = seatDirection(anchor, seatCount);
  const chip = betChipOffset(anchor, m, seatCount);
  const badges = radius - m.badgeTop;
  if (direction !== "stacked") {
    const chipSide = radius + 4 * m.scale + m.chip;
    const labelSide = radius + m.besideGap + m.width;
    // The labels are centred on the avatar, and may stand taller than it.
    const half = labelBlock(m) / 2;
    return {
      left: direction === "left" ? labelSide : chipSide,
      right: direction === "right" ? labelSide : chipSide,
      top: Math.max(badges, half),
      bottom: Math.max(radius, half),
      core: radius,
    };
  }
  const rootLeft = -m.width / 2;
  const chipLeft = rootLeft + chip.left;
  return {
    left: Math.max(m.width / 2, -chipLeft),
    right: Math.max(m.width / 2, chipLeft + m.chip),
    top: badges,
    // Reserve the full name/status/stack even for empty seats and changing states.
    bottom: radius + labelDrop(m),
    core: radius,
  };
}

/** How a felt seats its players, as `PokerTable` props. */
export interface TableSeating {
  seatPlacement: "felt" | "rail";
  layoutConfig: Partial<Omit<TableLayoutConfig, "seatCount">>;
}

/** Seats inside the table: the ring only gives each seat its direction (`placeSeatsOnFelt`). */
const FELT_SEATING: TableSeating = { seatPlacement: "felt", layoutConfig: { potY: 0.5 } };
/** Seats on the rail, and the table fitted with them. */
const RAIL_SEATING: TableSeating = {
  seatPlacement: "rail",
  layoutConfig: { seatRadius: { x: 0.98, y: 0.96 }, potY: 0.5 },
};

/**
 * How a table of `seatCount` is seated. Up to four players sit inside the table — avatars on the
 * felt, labels at most on the rail — so the table is sized by its painting and fills its room.
 * A fuller table has no room inside for every seat's labels at once (a phone's felt holds the
 * hero and one seat beside it, not three), so it keeps its seats on the rail and the table fits
 * around them. Stable objects: the table recomputes its geometry when they change.
 */
export function tableSeating(seatCount: number): TableSeating {
  return seatCount <= 4 ? FELT_SEATING : RAIL_SEATING;
}
