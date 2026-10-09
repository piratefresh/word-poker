import { Fit, RiveView, useRiveFile, useViewModelInstance } from "@rive-app/react-native";
import { useEffect, useState } from "react";
import { Image } from "react-native";

const WAGER_RIVE = require("../../../../../assets/images/ui/v2/button/raise_button-2.riv");
/** The same button as a still, drawn while the Rive file loads or if it fails. */
const WAGER_STILL = require("../../../../../assets/images/ui/v2/button/raise-button-4.png");

/**
 * The wager button's Rive housing (`raise-button-2`, 1254 square). `pressed` drives the file's
 * own press; the button's lettering is drawn over it, so the file's `amount` text is blanked.
 */
export function WagerArt({ size, pressed }: { size: number; pressed: boolean }) {
  const { error, riveFile } = useRiveFile(WAGER_RIVE);
  const { instance, error: bindingError } = useViewModelInstance(riveFile, {
    async: true,
    viewModelName: "RaiseButton",
    instanceName: "Default",
  });
  const [failed, setFailed] = useState(false);
  useEffect(() => instance?.stringProperty("amount")?.set(""), [instance]);
  useEffect(() => instance?.booleanProperty("pressed")?.set(pressed), [instance, pressed]);

  const box = { width: size, height: size };
  if (!riveFile || !instance || error || bindingError || failed) {
    return <Image source={WAGER_STILL} resizeMode="contain" style={box} />;
  }
  return (
    <RiveView
      artboardName="raise-button-2"
      autoPlay
      dataBind={instance}
      file={riveFile}
      fit={Fit.Contain}
      onError={() => setFailed(true)}
      stateMachineName="State Machine 1"
      style={box}
    />
  );
}
