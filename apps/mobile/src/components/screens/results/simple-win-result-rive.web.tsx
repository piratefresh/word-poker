import { Fit, Layout, Rive } from "@rive-app/canvas";
import { Asset } from "expo-asset";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { StyleSheet, View } from "react-native";

import type { ResultsSnapshot } from "./results-types";
import { getSimpleWinBindings } from "./simple-win-bindings";

const RIVE_FILE = require("../../../../assets/rive/simplewinscreen.riv");

export function SimpleWinResultRive({
  snapshot,
  reducedMotion,
}: {
  snapshot: ResultsSnapshot;
  reducedMotion: boolean;
}): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Rive | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false;
    const rive = new Rive({
      canvas: element,
      src: Asset.fromModule(RIVE_FILE).uri,
      artboard: "SimpleWinResult",
      stateMachines: "Result",
      autoplay: false,
      autoBind: false,
      layout: new Layout({ fit: Fit.Contain }),
      onLoad: () => {
        if (disposed) return;
        const instance = rive
          .viewModelByName("SimpleWin")
          ?.instanceByName("SevenLetters");
        if (!instance) {
          setFailed(true);
          return;
        }
        const data = getSimpleWinBindings(snapshot, reducedMotion);
        for (const [name, value] of Object.entries(data.strings)) {
          const property = instance.string(name);
          if (property) property.value = value;
        }
        for (const [name, value] of Object.entries(data.numbers)) {
          const property = instance.number(name);
          if (property) property.value = value;
        }
        const reduceMotion = instance.boolean("reduceMotion");
        if (reduceMotion) reduceMotion.value = data.reduceMotion;
        rive.bindViewModelInstance(instance);
        rive.resizeDrawingSurfaceToCanvas();
        setLoaded(true);
        rive.play("Result");
      },
      onAdvance: () => {
        if (reducedMotion) rive.pause("Result");
      },
      onLoadError: () => {
        if (!disposed) setFailed(true);
      },
    });
    runtime.current = rive;
    const observer = new ResizeObserver(() =>
      rive.resizeDrawingSurfaceToCanvas(),
    );
    observer.observe(element);

    return () => {
      disposed = true;
      observer.disconnect();
      runtime.current = null;
      rive.cleanup();
    };
  }, [snapshot, reducedMotion]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <canvas
        aria-hidden
        ref={canvas}
        style={{
          width: "100%",
          height: "100%",
          opacity: loaded && !failed ? 1 : 0,
        }}
      />
    </View>
  );
}
