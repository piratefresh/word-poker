import {
  Fit,
  RiveView,
  useRive,
  useRiveFile,
  useViewModelInstance,
} from "@rive-app/react-native";
import { useEffect, useState, type ReactElement } from "react";
import { StyleSheet } from "react-native";

import type { ResultsSnapshot } from "./results-types";
import { getSimpleWinBindings } from "./simple-win-bindings";

const RIVE_FILE = require("../../../../assets/rive/simplewinscreen.riv");

export function SimpleWinResultRive({
  snapshot,
  reducedMotion,
}: {
  snapshot: ResultsSnapshot;
  reducedMotion: boolean;
}): ReactElement | null {
  const { error, riveFile } = useRiveFile(RIVE_FILE);
  const { instance, error: bindingError } = useViewModelInstance(riveFile, {
    async: true,
    viewModelName: "SimpleWin",
    instanceName: "SevenLetters",
    onInit: (model) => {
      const data = getSimpleWinBindings(snapshot, reducedMotion);
      for (const [name, value] of Object.entries(data.strings))
        model.stringProperty(name)?.set(value);
      for (const [name, value] of Object.entries(data.numbers))
        model.numberProperty(name)?.set(value);
      model.booleanProperty("reduceMotion")?.set(data.reduceMotion);
    },
  });
  const { riveViewRef, setHybridRef } = useRive();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!instance || !riveViewRef) return;
    riveViewRef.playIfNeeded();
    // Advance bindings on the still state before pausing the native render loop.
    let frame = 0;
    if (reducedMotion)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          void riveViewRef.pause();
        });
      });
    return () => cancelAnimationFrame(frame);
  }, [instance, riveViewRef, reducedMotion]);

  if (!riveFile || !instance || error || bindingError || failed) return null;
  return (
    <RiveView
      artboardName="SimpleWinResult"
      autoPlay={false}
      dataBind={instance}
      file={riveFile}
      fit={Fit.Contain}
      hybridRef={setHybridRef}
      onError={() => setFailed(true)}
      stateMachineName="Result"
      style={StyleSheet.absoluteFill}
    />
  );
}
