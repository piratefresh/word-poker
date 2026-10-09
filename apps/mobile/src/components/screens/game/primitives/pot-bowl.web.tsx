import { Fit, Layout, Rive } from "@rive-app/canvas";
import { Asset } from "expo-asset";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ChipPile } from "@/components/chip/chip-pile";

import { type PotBowlDriver, usePotBowl } from "./pot-bowl-motion";

const RIVE_FILE = require("../../../../../assets/images/ui/v2/ambient/the-pot-chips-stack.riv");

/** The Rive pot chip stacks (360 × 220 artboard), with the drawn chip pile while it loads or if it fails. */
export function PotBowl({ amount, scale }: { amount: number; scale: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [driver, setDriver] = useState<PotBowlDriver | null>(null);
  usePotBowl(driver);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false;
    const rive = new Rive({
      canvas: element,
      src: Asset.fromModule(RIVE_FILE).uri,
      artboard: "PotStacks",
      stateMachines: "PotStacksMachine",
      autoplay: true,
      autoBind: true,
      layout: new Layout({ fit: Fit.Contain }),
      onLoad: () => {
        const model = rive.viewModelInstance;
        if (disposed || !model) return;
        rive.resizeDrawingSurfaceToCanvas();
        setDriver({
          number: (name, value) => { const property = model.number(name); if (property) property.value = value; },
          boolean: (name, value) => { const property = model.boolean(name); if (property) property.value = value; },
          fire: (name) => model.trigger(name)?.trigger(),
        });
      },
    });
    const observer = new ResizeObserver(() => rive.resizeDrawingSurfaceToCanvas());
    observer.observe(element);
    return () => {
      disposed = true;
      observer.disconnect();
      setDriver(null);
      rive.cleanup();
    };
  }, []);

  return (
    <View style={{ width: 120 * scale, height: 73 * scale }}>
      {driver ? null : <View style={[StyleSheet.absoluteFill, styles.fallback]}><ChipPile amount={amount} scale={scale} /></View>}
      <canvas aria-hidden ref={canvas} style={{ width: "100%", height: "100%", opacity: driver ? 1 : 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "flex-end" },
});
