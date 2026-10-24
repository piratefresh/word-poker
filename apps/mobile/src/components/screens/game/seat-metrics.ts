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
import { ROOM_GUTTER } from "@/components/table/room-fit";

/** The avatar at a felt `REFERENCE_TABLE_WIDTH` wide. */
const REFERENCE_AVATAR = 64;
const REFERENCE_TABLE_WIDTH = 640;
const BASE_GAP = 6;
/** The smallest avatar a seat draws, and the size every base measure below is drawn for. */
export const MIN_AVATAR = 38;

/** The seat at `MIN_AVATAR`, in points. Every one of them scales with the avatar. */
const BASE = {
  /** The seat's column, also used to place labels beside the avatar. */
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
  /** The compact name-and-stack plate sits just below the avatar. */
  nameGap: 2,
  platePadX: 7,
  platePadY: 2,
  plateRadius: 5,
  stackSize: 10,
  stackLine: 0,
  coin: 8,
  /** The opponent rack's wood box (`opponent-rack-3-tight`): the plate tucks over its top by
   *  `rackTuck`, the standing tiles' feet sit `rackFeet` above its bottom, and the lip re-draws
   *  the bottom `rackLip` of it over those feet. Ratios from the approved STO-538 gallery. */
  rackW: 75,
  rackH: 28,
  rackTuck: 2.4,
  rackFeet: 4.3,
  rackLip: 6,
  pillGap: 3,
  pillPadX: 8,
  pillPadY: 1.5,
  pillRadius: 8,
  pillBorder: 1,
  statusSize: 7,
  statusLine: 9,
  statusTracking: 0.8,
  chip: 30,
  chipBorder: 1.5,
  chipText: 10,
  emptyLabelTracking: 1,
  /** A winner's glow radius; `highlightBleed` is how far past the avatar the fit keeps clear. */
  glow: 16,
  /** How far the turn beam's light spreads past the avatar's edge. */
  beamGlow: 7,
  highlightBleed: 8,
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

/**
 * The tabletop room's seat, at a 400-point-wide room: the reference draws a big avatar and rack
 * with readable nameplates, so these replace `BASE`'s avatar-led proportions.
 */
const TABLETOP = {
  avatar: 68,
  width: 92,
  nameGap: 2,
  badge: 18,
  badgeText: 7,
  nameSize: 11,
  nameLine: 13,
  platePadX: 8,
  platePadY: 3,
  plateRadius: 7,
  stackSize: 12,
  stackLine: 0,
  coin: 10,
  rackW: 88,
  // The trimmed opponent-rack-5 artwork is 1280 by 723; its lower rail covers the tile feet.
  rackH: 88 * (723 / 1280),
  rackTuck: 88 * (2.4 / 75),
  rackFeet: 88 * (152 / 1280),
  rackLip: 88 * (176 / 1280),
  pillPadX: 9,
  pillPadY: 2,
  // Negative: the status pill tucks against the rack's bottom rail instead of floating below it.
  pillGap: -5,
  statusSize: 9,
  statusLine: 12,
  statusTracking: 0.2,
  chip: 22,
} as const;
const TABLETOP_ROOM_WIDTH = 400;
/** The nameplate and status tag: what `labelScale` grows while the avatar and rack keep their size. */
const LABEL_KEYS = new Set<string>([
  "width",
  "badge",
  "badgeText",
  "nameSize",
  "nameLine",
  "platePadX",
  "platePadY",
  "plateRadius",
  "stackSize",
  "coin",
  "pillPadX",
  "pillPadY",
  "statusSize",
  "statusLine",
]);
/** How far a wide window grows the tabletop seat. */
const TABLETOP_MAX_SCALE = 1.8;

/** The tabletop room's community row center, as a fraction of the room's height. */
const TABLETOP_COMMUNITY_Y = 0.46;

/**
 * The tabletop community row's own height, before the tabletop scale: the band across the room's
 * middle that a seat above it has to stay clear of (`placeSeatsInRoom` only reserves the seat
 * chrome, so the seating's own row has to fit above this).
 */
export const COMMUNITY_ROW_HEIGHT = 80;

/**
 * Whether a tabletop room `roomHeight` tall can hang `topChrome` points of header over its top
 * band: with it, the opponents' row — avatars, racks and status pills — still ends above the
 * community row. A room too short for the two keeps the header's tag in the header's corner
 * instead of crowding the felt.
 *
 * The row's own reaches are the ones drawn for `appearanceWidth`; a fuller table is seated no
 * further down than this, so it fits wherever this does.
 */
export function tabletopFitsTopChrome(
  roomHeight: number,
  appearanceWidth: number,
  topChrome: number,
): boolean {
  const m = seatMetrics(appearanceWidth, true);
  // The row's whole reach below the room's top: the badge over the avatar, the avatar, the rack
  // and the status pill under them (`playerSeatBounds`' own top and bottom, joined at the avatar).
  const rowBottom = ROOM_GUTTER + topChrome + (m.avatar - m.badgeTop) + labelDrop(m);
  const communityTop =
    TABLETOP_COMMUNITY_Y * roomHeight - (COMMUNITY_ROW_HEIGHT / 2) * m.scale;
  return rowBottom <= communityTop;
}

/** Every measure of a seat at a felt `tableWidth` wide — or, `tabletop`, in a room that wide. */
export function seatMetrics(tableWidth: number, tabletop = false, labelScale = 1): SeatMetrics {
  if (tabletop) {
    const scale = Math.min(TABLETOP_MAX_SCALE, Math.max(0.6, tableWidth / TABLETOP_ROOM_WIDTH));
    const scaled = {} as BaseMetrics;
    for (const key of Object.keys(BASE) as (keyof typeof BASE)[]) {
      scaled[key] =
        (key in TABLETOP ? TABLETOP[key as keyof typeof TABLETOP] : BASE[key]) *
        scale *
        (LABEL_KEYS.has(key) ? labelScale : 1);
    }
    // The avatar grows with the labels; it may spill past the seat's bounds.
    return { ...scaled, avatar: Math.round(TABLETOP.avatar * scale * labelScale), scale };
  }
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

/**
 * The label stack's height: the nameplate (name over stack), the rack, the status badge. The rack
 * is reserved on every seat — the hero's and an undealt one too — so dealing never moves a seat.
 */
export function labelBlock(m: SeatMetrics): number {
  return (
    m.platePadY * 2 +
    m.scale * 2 +
    m.nameLine +
    m.stackLine +
    m.rackH -
    m.rackTuck +
    m.pillGap +
    m.pillBorder * 2 +
    m.pillPadY * 2 +
    m.statusLine
  );
}

/** How far the label stack reaches below the avatar's bottom edge, when it hangs under it. */
export function labelDrop(m: SeatMetrics): number {
  return m.nameGap + labelBlock(m);
}

/**
 * A seat's fullest reach around its anchor (the avatar's centre) for a felt `tableWidth` wide:
 * the labels under or beside the avatar, the role badges above it, and the bet chip across. It is
 * the same for every state the seat can be in, so a bet, a badge or a turn lighting up never
 * moves a seat. A winner's glow is soft light, not chrome, and is left free to spill.
 *
 * `core` is the avatar: the part of the seat that stays on the felt.
 */
export function playerSeatBounds(
  anchor: SeatAnchor,
  tableWidth: number,
  seatCount = 4,
  tabletop = false,
): SeatExtents {
  const m = seatMetrics(tableWidth, tabletop);
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
    bottom: radius + labelDrop(m) - (tabletop && anchor.index === 0 ? m.rackH - m.rackTuck : 0),
    core: radius,
  };
}

/** `playerSeatBounds` for the tabletop room's larger seat. */
export function tabletopSeatBounds(anchor: SeatAnchor, tableWidth: number, seatCount = 4): SeatExtents {
  return playerSeatBounds(anchor, tableWidth, seatCount, true);
}

/** How a felt seats its players, as `PokerTable` props. */
export interface TableSeating {
  seatPlacement: "felt" | "rail" | "room";
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
export function tableSeating(seatCount: number, tabletop = false): TableSeating {
  if (tabletop) return tabletopSeating(seatCount);
  return seatCount <= 4 ? FELT_SEATING : RAIL_SEATING;
}

/**
 * The tabletop room: the hero at the bottom and every opponent along an arc across the top, so
 * the community row and pot have the middle to themselves (the even ring would park a 4-seat
 * table's opponents halfway down the sides, on top of the row). The arc is only as deep as the
 * room's seating: up to four players the seating flattens it into a row (`seatRows`), and a
 * fuller table spreads its opponents down the sides instead.
 */
export function tabletopSeatAngles(seatCount: number): number[] {
  const opponents = seatCount - 1;
  const crowded = opponents > 3;
  const arcStart = (crowded ? 1.1 : 1.3) * Math.PI;
  const arcSpan = (crowded ? 0.8 : 0.4) * Math.PI;
  return [
    Math.PI / 2,
    ...Array.from({ length: opponents }, (_, i) =>
      opponents === 1 ? 1.5 * Math.PI : arcStart + (arcSpan * i) / (opponents - 1),
    ),
  ];
}

const TABLETOP_SEATING = new Map<number, TableSeating>();
function tabletopSeating(seatCount: number): TableSeating {
  let seating = TABLETOP_SEATING.get(seatCount);
  if (!seating) {
    seating = {
      seatPlacement: "room",
      layoutConfig: {
        seatAngles: tabletopSeatAngles(seatCount),
        seatRadius: { x: 1.05, y: 0.86 },
        // Up to four players the opponents sit in one line across the top: the arc's own
        // depth would float the middle one above its neighbours. A fuller table keeps the
        // fan, because that many seats only fit spread down the arc's sides.
        seatRows: seatCount <= 4,
        communityY: TABLETOP_COMMUNITY_Y,
        potY: 0.63,
      },
    };
    TABLETOP_SEATING.set(seatCount, seating);
  }
  return seating;
}
