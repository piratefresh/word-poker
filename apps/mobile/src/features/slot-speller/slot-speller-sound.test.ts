import { createAudioPlayer } from "expo-audio";

import { chimeRate, pickTake, playSlotSound, setSlotSoundOn, startSpinLoop } from "./slot-speller-sound";

const mockKv = new Map<string, string>();
jest.mock("@/lib/storage/claim-store", () => ({
  readItem: (key: string) => mockKv.get(key) ?? null,
  writeItem: (key: string, value: string) => void mockKv.set(key, value),
}));

describe("pickTake", () => {
  it("never picks the same take twice in a row", () => {
    let last: number | undefined;
    for (let i = 0; i < 200; i += 1) {
      const next = pickTake(4, last, () => (i * 0.37) % 1);
      expect(next).not.toBe(last);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(4);
      last = next;
    }
  });

  it("repeats a lone take", () => {
    expect(pickTake(1, 0, () => 0.9)).toBe(0);
  });
});

describe("chimeRate", () => {
  it("climbs a major scale, an octave per seven words, capped at 19 semitones", () => {
    const semitones = [0, 1, 2, 6, 7, 8, 9, 20].map((i) => Math.round(12 * Math.log2(chimeRate(i))));
    expect(semitones).toEqual([0, 2, 4, 11, 12, 14, 16, 19]);
  });
});

describe("sound off", () => {
  it("plays nothing", () => {
    jest.mocked(createAudioPlayer).mockClear();
    setSlotSoundOn(false);
    playSlotSound("chime", { rate: 2 });
    startSpinLoop();
    expect(createAudioPlayer).not.toHaveBeenCalled();
    expect(mockKv.get("slot-speller-sound")).toBe("off");

    setSlotSoundOn(true);
    playSlotSound("buy");
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });
});
