import { Platform, type ViewStyle } from "react-native";

import { fonts } from "@/constants/theme";

/** The scene's own palette: warm parchment and lamp gold on a dusk-blue night. */
export const ink = {
  night: "#0b1130",
  parchment: "#fff6e2",
  cream: "#f7e7b5",
  gold: "#ffd34d",
  goldDeep: "#8a4e10",
  plum: "#2a1a3a",
  slate: "#7d8398",
  slateLight: "#c9cedd",
  scrim: "rgba(10,8,24,0.8)",
  amber: "#e0974a",
};

export const lilita = fonts.arcade;

/** Width of a node's column on the map: its disc, labels, and pulse centre in it. */
export const NODE_COLUMN = 140;

/** A CSS gradient as a style: native reads `experimental_backgroundImage`, web the plain key. */
export const gradient = (image: string): ViewStyle =>
  (Platform.OS === "web" ? { backgroundImage: image } : { experimental_backgroundImage: image }) as ViewStyle;
