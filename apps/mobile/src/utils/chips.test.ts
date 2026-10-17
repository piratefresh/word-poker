import { colors } from "@/constants/theme";
import { chipColor, signedChips } from "./chips";

test("formats chip signs, zero and thousands consistently", () => {
  expect([0, -0, -40, 1050, -1050].map(signedChips)).toEqual(["+0", "+0", "−40", "+1,050", "−1,050"]);
  expect(chipColor(0, "card")).toBe(colors.chipUpOnTile);
  expect(chipColor(-40, "card")).toBe(colors.chipDownOnTile);
  expect(chipColor(1050, "felt")).toBe(colors.chipUp);
  expect(chipColor(-40, "felt")).toBe(colors.danger);
});
