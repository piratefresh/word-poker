import { Fit, Layout, Rive } from "@rive-app/canvas";
import { Asset } from "expo-asset";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useDrinkFill } from "./drink-motion";

const RIVE_FILE = require("../../../../../assets/images/ui/v2/ambient/drink-rive-assets/drink-ambient-2.riv");

export function Drink() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Rive | null>(null);
  const [loaded, setLoaded] = useState(false);
  const freeze = useRef(false);
  const apply = useCallback(
    (fill: number, sip: boolean, reducedMotion: boolean) => {
      const rive = runtime.current;
      if (!rive?.viewModelInstance) return;
      const level = rive.viewModelInstance.number("fillLevel");
      if (level) level.value = fill;
      if (sip) rive.viewModelInstance.trigger("sip")?.trigger();
      freeze.current = reducedMotion;
      // onAdvance pauses after applying bindings, so a reduced-motion drink still drains.
      rive.play("DrinkMachine");
    },
    [],
  );
  useDrinkFill(loaded ? apply : null);

  useEffect(() => {
    if (!canvas.current) return;
    let disposed = false;
    const rive = new Rive({
      canvas: canvas.current,
      src: Asset.fromModule(RIVE_FILE).uri,
      artboard: "DrinkGlass",
      stateMachines: "DrinkMachine",
      autoplay: false,
      autoBind: false,
      layout: new Layout({ fit: Fit.Contain }),
      onLoad: () => {
        if (disposed) return;
        const instance = rive.viewModelByName("Drink")?.defaultInstance();
        if (!instance) return;
        rive.bindViewModelInstance(instance);
        rive.resizeDrawingSurfaceToCanvas();
        setLoaded(true);
      },
      onAdvance: () => {
        if (freeze.current) rive.pause("DrinkMachine");
      },
      onLoadError: () => {
        if (!disposed) setLoaded(false);
      },
    });
    runtime.current = rive;
    const observer = new ResizeObserver(() =>
      rive.resizeDrawingSurfaceToCanvas(),
    );
    observer.observe(canvas.current);
    return () => {
      disposed = true;
      observer.disconnect();
      runtime.current = null;
      rive.cleanup();
    };
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <canvas
        aria-hidden
        ref={canvas}
        style={{ width: "100%", height: "100%", opacity: loaded ? 1 : 0 }}
      />
    </View>
  );
}
