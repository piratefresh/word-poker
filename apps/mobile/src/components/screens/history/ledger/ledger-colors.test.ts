import { colors, gradients } from "@/constants/theme";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function expectContrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
}

test("app theme colors used on ledger cards and pills have readable contrast", () => {
  const cardSurfaces = [gradients.tile.colors[0], gradients.tile.colors[1], colors.goldHi];
  for (const background of cardSurfaces) {
    expectContrast(colors.onTile, background);
    expectContrast(colors.chipUpOnTile, background);
    expectContrast(colors.chipDownOnTile, background);
  }

  const pillSurfaces = [colors.successHi, colors.goldHi, colors.danger, colors.info, colors.warning];
  for (const background of pillSurfaces) expectContrast(colors.onGold, background);
});

test("app theme text and chip colors remain readable on the table gradient", () => {
  for (const background of gradients.table.colors.slice(1)) {
    for (const foreground of [colors.text, colors.chipUp, colors.danger]) {
      expectContrast(foreground, background);
    }
  }
});
