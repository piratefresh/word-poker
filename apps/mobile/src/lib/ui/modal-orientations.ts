import type { ModalProps } from "react-native";

/**
 * Every orientation the app allows. An iOS `Modal` supports portrait only unless told otherwise,
 * so a dialog opened from a landscape table would present in portrait and misplace its touches.
 */
export const MODAL_ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = [
  "portrait",
  "portrait-upside-down",
  "landscape",
  "landscape-left",
  "landscape-right",
];
