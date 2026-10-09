import { Fit, RiveView, useRiveFile, useViewModelInstance } from "@rive-app/react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ChipPile } from "@/components/chip/chip-pile";

import { type PotBowlDriver, usePotBowl } from "./pot-bowl-motion";

const RIVE_FILE = require("../../../../../assets/images/ui/v2/ambient/the-pot-chips-stack.riv");

/** The Rive pot chip stacks (360 × 220 artboard), with the drawn chip pile while it loads or if it fails. */
export function PotBowl({ amount, scale }: { amount: number; scale: number }) {
  const { error, riveFile } = useRiveFile(RIVE_FILE);
  const { instance, error: bindingError } = useViewModelInstance(riveFile, {
    async: true,
    viewModelName: "PotBowl",
    instanceName: "Default",
  });
  const [failed, setFailed] = useState(false);
  const driver = useMemo<PotBowlDriver | null>(() => instance ? {
    number: (name, value) => instance.numberProperty(name)?.set(value),
    boolean: (name, value) => instance.booleanProperty(name)?.set(value),
    fire: (name) => instance.triggerProperty(name)?.trigger(),
  } : null, [instance]);
  usePotBowl(driver);

  const size = { width: 120 * scale, height: 73 * scale };
  if (!riveFile || !instance || error || bindingError || failed) {
    return <View style={[size, styles.fallback]}><ChipPile amount={amount} scale={scale} /></View>;
  }
  return (
    <RiveView
      artboardName="PotStacks"
      autoPlay
      dataBind={instance}
      file={riveFile}
      fit={Fit.Contain}
      onError={() => setFailed(true)}
      stateMachineName="PotStacksMachine"
      style={size}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "flex-end" },
});
