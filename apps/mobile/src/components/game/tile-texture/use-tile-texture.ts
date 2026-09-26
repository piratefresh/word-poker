import { useEffect, useState } from "react";
import { PixelRatio } from "react-native";

import { generateTileTexture, hashTileId } from "./generate";
import { skiaReady } from "./skia-ready";

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function textureKey(id: string, width: number, height: number, dpr: number) {
  return `${id}:${width}x${height}:${dpr}`;
}

/**
 * Renders a tile's texture once per id, size and pixel ratio. `paint` loads only after Skia is
 * ready, since on the web its module needs CanvasKit in place.
 */
function loadTexture(key: string, id: string, width: number, height: number, dpr: number) {
  let job = pending.get(key);
  if (!job) {
    job = skiaReady()
      .then(() => import("./paint"))
      .then(({ paintTileTexture }) =>
        paintTileTexture(generateTileTexture(hashTileId(id), { width, height }), dpr),
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
 * The face texture for a tile as a PNG uri, or null until it has been painted (or if it
 * cannot be) — the caller keeps its gradient face for null.
 */
export function useTileTexture(id: string, width: number, height: number): string | null {
  const dpr = PixelRatio.get();
  const key = textureKey(id, width, height, dpr);
  const [loaded, setLoaded] = useState<{ key: string; uri: string | null } | null>(null);
  const cached = cache.get(key);

  useEffect(() => {
    if (cache.has(key)) return;
    let live = true;
    void loadTexture(key, id, width, height, dpr).then((uri) => {
      if (live) setLoaded({ key, uri });
    });
    return () => {
      live = false;
    };
  }, [dpr, height, id, key, width]);

  if (cached !== undefined) return cached;
  return loaded?.key === key ? loaded.uri : null;
}
