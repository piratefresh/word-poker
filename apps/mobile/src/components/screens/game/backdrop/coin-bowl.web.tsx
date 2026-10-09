import { Fit, Layout, Rive } from "@rive-app/canvas";
import { Asset } from "expo-asset";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { CoinBowlArtwork } from "./coin-bowl-art";
import { type BowlShake, useCoinBowlShake } from "./coin-bowl-motion";

const RIVE_FILE = require("../../../../../assets/images/ui/v2/ambient/coin-bowl-rive-assets/coin-bowl.riv");

export function CoinBowl() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Rive | null>(null);
  const [loaded, setLoaded] = useState(false);
  const play = useCallback((shake: BowlShake) => {
    const rive = runtime.current;
    if (!loaded || !rive) return;
    rive.stop();
    rive.play(shake === "big" ? "BigShake" : "SmallShake");
  }, [loaded]);
  useCoinBowlShake(play);

  useEffect(() => {
    if (!canvas.current) return;
    let disposed = false;
    const rive = new Rive({
      canvas: canvas.current,
      src: Asset.fromModule(RIVE_FILE).uri,
      artboard: "CoinBowl",
      animations: "Idle",
      autoplay: true,
      autoBind: false,
      layout: new Layout({ fit: Fit.Contain }),
      onLoad: () => {
        if (disposed) return;
        rive.resizeDrawingSurfaceToCanvas();
        setLoaded(true);
      },
      onLoadError: () => { if (!disposed) setLoaded(false); },
    });
    runtime.current = rive;
    const observer = new ResizeObserver(() => rive.resizeDrawingSurfaceToCanvas());
    observer.observe(canvas.current);
    return () => {
      disposed = true;
      observer.disconnect();
      runtime.current = null;
      rive.cleanup();
    };
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      {!loaded && <CoinBowlArtwork />}
      <canvas aria-hidden ref={canvas} style={{ width: "100%", height: "100%", opacity: loaded ? 1 : 0 }} />
    </View>
  );
}
