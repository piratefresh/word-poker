import { Fit, RiveView, useRive, useRiveFile, useViewModelInstance } from "@rive-app/react-native";
import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";

import { useDrinkFill } from "./drink-motion";

const RIVE_FILE = require("../../../../../assets/images/ui/v2/ambient/drink-rive-assets/drink-ambient-2.riv");

export function Drink() {
  const { error, riveFile } = useRiveFile(RIVE_FILE);
  const { instance, error: bindingError } = useViewModelInstance(riveFile, {
    async: true,
    viewModelName: "Drink",
  });
  const { riveViewRef, setHybridRef } = useRive();
  const [failed, setFailed] = useState(false);
  const apply = useCallback((fill: number, sip: boolean, reducedMotion: boolean) => {
    if (!instance || !riveViewRef) return;
    instance.numberProperty("fillLevel")?.set(fill);
    if (sip) instance.triggerProperty("sip")?.trigger();
    riveViewRef.playIfNeeded();
    // The native API has no advance(0): let the binding render, then freeze ambient motion.
    let frame = 0;
    if (reducedMotion) {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { void riveViewRef.pause(); });
      });
    }
    return () => cancelAnimationFrame(frame);
  }, [instance, riveViewRef]);
  useDrinkFill(instance && riveViewRef && !failed ? apply : null);

  if (!riveFile || !instance || error || bindingError || failed) return null;
  return (
    <RiveView
      artboardName="DrinkGlass"
      autoPlay={false}
      dataBind={instance}
      file={riveFile}
      fit={Fit.Contain}
      hybridRef={setHybridRef}
      onError={() => setFailed(true)}
      stateMachineName="DrinkMachine"
      style={StyleSheet.absoluteFill}
    />
  );
}
