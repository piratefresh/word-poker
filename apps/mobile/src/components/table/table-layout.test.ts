import { computeTableLayout, resolvePoint } from "./table-layout";

test("shares the compact landscape pot position with chip flight targets", () => {
  const layout = computeTableLayout({ seatCount: 4, potX: 0.73, potY: 0.5 });
  expect(resolvePoint(layout.pot, { width: 800, height: 160 })).toEqual({ x: 584, y: 80 });
  expect(computeTableLayout({ seatCount: 4 }).pot.x).toBe(0.5);
});
