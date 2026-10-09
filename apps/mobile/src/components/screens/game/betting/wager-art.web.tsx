import { Fit, Layout, Rive, type ViewModelInstance } from "@rive-app/canvas";
import { Asset } from "expo-asset";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

const WAGER_RIVE = require("../../../../../assets/images/ui/v2/button/raise_button-2.riv");
const WAGER_STILL = require("../../../../../assets/images/ui/v2/button/raise-button-4.png");

/** The web's wager housing: the same Rive file through @rive-app/canvas (see `wager-art.tsx`). */
export function WagerArt({ size, pressed }: { size: number; pressed: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<ViewModelInstance | null>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false;
    const rive = new Rive({
      canvas: element,
      src: Asset.fromModule(WAGER_RIVE).uri,
      artboard: "raise-button-2",
      stateMachines: "State Machine 1",
      autoplay: true,
      autoBind: true,
      layout: new Layout({ fit: Fit.Contain }),
      onLoad: () => {
        const instance = rive.viewModelInstance;
        if (disposed || !instance) return;
        rive.resizeDrawingSurfaceToCanvas();
        const amount = instance.string("amount");
        if (amount) amount.value = "";
        setModel(instance);
      },
    });
    const observer = new ResizeObserver(() => rive.resizeDrawingSurfaceToCanvas());
    observer.observe(element);
    return () => {
      disposed = true;
      observer.disconnect();
      setModel(null);
      rive.cleanup();
    };
  }, []);

  useEffect(() => {
    const property = model?.boolean("pressed");
    if (property) property.value = pressed;
  }, [model, pressed]);

  return (
    <View style={{ width: size, height: size }}>
      {model ? null : <Image source={WAGER_STILL} resizeMode="contain" style={StyleSheet.absoluteFill} />}
      <canvas aria-hidden ref={canvas} style={{ width: "100%", height: "100%", opacity: model ? 1 : 0 }} />
    </View>
  );
}
