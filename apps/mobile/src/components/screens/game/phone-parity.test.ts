/**
 * A phone-sized window renders the game screen as it did before the desktop scale: every helper
 * that grows with the window must hand back the phone's own numbers at 390×844 and 844×390.
 */
import { bannerLayout, CONTROL_ROW_HEIGHT, hudBarHeight } from "@/components/hud/top-bar/banner";
import { RACK, rackFor } from "@/components/word-builder/strip";

import { screenScale, stageMaxWidth } from "./screen-scale";

const PHONES = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];

describe.each(PHONES)("a phone window %j", (window) => {
  test("has no scale and no stage", () => {
    expect(screenScale(window)).toBe(1);
    expect(stageMaxWidth(window)).toBeUndefined();
  });

  test("keeps the phone's HUD and banner", () => {
    expect(hudBarHeight(window)).toBe(HUD_BAR);
    const banner = bannerLayout(window);
    expect(banner.bar.height).toBe(CONTROL_ROW_HEIGHT);
    expect(banner.frame.width).toBeCloseTo(2030 * Math.min(0.11, (window.width - 32) / 2030));
  });

  test("keeps the phone's rack", () => {
    const rack = rackFor(window);
    expect(rack).toBe(RACK.phone);
    expect(rack.itemWidth).toBe(44);
    expect(rack.scale).toBe(1);
  });
});

const HUD_BAR = hudBarHeight({ width: 390, height: 844 });
