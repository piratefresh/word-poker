/** Shared street artwork and the door coordinates used by the home and lobby transitions. */

export const STREETS = {
  portrait: {
    source: require("@/assets/images/ui/v2/bgs/main-menu-bg.jpg"),
    width: 1152,
    height: 2048,
    door: { x: 762, y: 1440 },
    wallTop: 820,
    doorLeft: 600,
  },
  landscape: {
    source: require("@/assets/images/ui/v2/bgs/main-menu-bg-landscape.jpg"),
    width: 2048,
    height: 1152,
    door: { x: 1205, y: 826 },
    wallTop: 420,
    doorLeft: 1092,
  },
} as const;

export type Street = (typeof STREETS)[keyof typeof STREETS];

/** Where a point of the art lands in a box the art covers (centred and cropped to fill). */
export function artPoint(
  art: Street,
  box: { width: number; height: number },
  point: { x: number; y: number },
) {
  const scale = Math.max(box.width / art.width, box.height / art.height);
  return {
    x: point.x * scale - (art.width * scale - box.width) / 2,
    y: point.y * scale - (art.height * scale - box.height) / 2,
  };
}
