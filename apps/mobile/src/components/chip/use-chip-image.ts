import { useEffect, useState } from "react";
import { PixelRatio } from "react-native";

import type { ChipTone } from "@/constants/theme";

import { skiaReady } from "../game/tile-texture/skia-ready";
import { generateChip } from "./generate";

/**
 * How many worn variants of each chip are painted. A flight or a stack picks one by its seed,
 * so chips differ from their neighbours without a fresh image for every chip id.
 */
export const CHIP_VARIANTS = 4;

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

export interface ChipImageOptions {
  tone: ChipTone;
  /** Diameter in points. */
  size: number;
  /** Radians away from face on (see `generateChip`). */
  tilt?: number;
  seed?: number;
}

function chipKey(
  tone: ChipTone,
  size: number,
  tilt: number,
  variant: number,
  dpr: number,
) {
  return `${tone}:${size}:${tilt.toFixed(2)}:${variant}:${dpr}`;
}

function loadChip(
  key: string,
  tone: ChipTone,
  size: number,
  tilt: number,
  variant: number,
  dpr: number,
) {
  let job = pending.get(key);
  if (!job) {
    job = skiaReady()
      .then(() => import("./paint"))
      .then(({ paintChipImage }) =>
        paintChipImage(generateChip(variant + 1, size, tilt), tone, dpr),
      )
      .catch(() => null)
      .then((uri) => {
        cache.set(key, uri);
        pending.delete(key);
        return uri;
      });
    pending.set(key, job);
  }
  return job;
}

/**
 * The painted chip as a PNG uri, or null until it has been painted (or if it cannot be) — the
 * caller keeps its flat disc for null. Painted once per tone, size, tilt, variant and pixel ratio.
 */
export function useChipImage({
  tone,
  size,
  tilt = 0,
  seed = 0,
}: ChipImageOptions): string | null {
  const dpr = PixelRatio.get();
  const variant = (seed >>> 0) % CHIP_VARIANTS;
  const key = chipKey(tone, size, tilt, variant, dpr);
  const [loaded, setLoaded] = useState<{
    key: string;
    uri: string | null;
  } | null>(null);
  const cached = cache.get(key);

  useEffect(() => {
    if (cache.has(key)) return;
    let live = true;
    void loadChip(key, tone, size, tilt, variant, dpr).then((uri) => {
      if (live) setLoaded({ key, uri });
    });
    return () => {
      live = false;
    };
  }, [dpr, key, size, tilt, tone, variant]);

  if (cached !== undefined) return cached;
  return loaded?.key === key ? loaded.uri : null;
}
