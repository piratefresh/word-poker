import { COACH_GAP, COACH_GUTTER, COACH_MAX_WIDTH, coachCardWidth, placeCoachCard } from "./placement";

const PHONE = { width: 402, height: 874 };

describe("placeCoachCard", () => {
  it("sits above a target near the bottom, centered on it, with the arrow on its center", () => {
    const target = { x: 150, y: 820, width: 100, height: 40 };
    const placed = placeCoachCard({ target, container: PHONE, cardHeight: 150 });

    expect(placed.side).toBe("top");
    expect(placed.top).toBe(820 - COACH_GAP - 150);
    expect(placed.width).toBe(coachCardWidth(PHONE.width));
    expect(placed.left + (placed.arrowX ?? 0)).toBe(200);
  });

  it("flips below when the preferred side has no room", () => {
    const target = { x: 20, y: 40, width: 360, height: 60 };
    const placed = placeCoachCard({ target, container: PHONE, cardHeight: 150, side: "top" });

    expect(placed.side).toBe("bottom");
    expect(placed.top).toBe(40 + 60 + COACH_GAP);
  });

  it("keeps the card inside the gutters and the arrow off its corners near an edge", () => {
    const target = { x: 0, y: 500, width: 30, height: 30 };
    const placed = placeCoachCard({ target, container: PHONE, cardHeight: 150 });

    expect(placed.left).toBe(COACH_GUTTER);
    expect(placed.arrowX).toBeGreaterThanOrEqual(18);
    const right = placeCoachCard({ target: { ...target, x: PHONE.width - 30 }, container: PHONE, cardHeight: 150 });
    expect(right.left + right.width).toBe(PHONE.width - COACH_GUTTER);
    expect(right.arrowX).toBeLessThanOrEqual(right.width - 18);
  });

  it("clamps a card too tall for either side inside the container", () => {
    const target = { x: 0, y: 300, width: 400, height: 300 };
    const placed = placeCoachCard({ target, container: PHONE, cardHeight: 400 });

    expect(placed.top).toBeGreaterThanOrEqual(COACH_GUTTER);
    expect(placed.top + 400).toBeLessThanOrEqual(PHONE.height - COACH_GUTTER);
  });

  it("centers an untargeted card with no arrow, and caps its width on a wide screen", () => {
    const placed = placeCoachCard({ target: null, container: { width: 1200, height: 800 }, cardHeight: 200 });

    expect(placed).toEqual({ top: 300, left: (1200 - COACH_MAX_WIDTH) / 2, width: COACH_MAX_WIDTH, side: null, arrowX: null });
  });
});
