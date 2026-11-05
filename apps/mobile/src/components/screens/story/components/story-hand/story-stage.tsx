import { LinearGradient } from "expo-linear-gradient";
import type { ReactElement, ReactNode } from "react";
import { Modal, StyleSheet, View } from "react-native";

import { gradients } from "@/constants/theme";
import type { RoomId } from "@/features/story/kitchen-table-map";
import { MODAL_ORIENTATIONS } from "@/lib/ui/modal-orientations";

import { gradient } from "../chapter-map/chapter-map-ink";
import { StoryRoom } from "./story-room";

/** The full-screen page a hand ends on: the hand's room behind the felt, and the card laid on it. */
export function StoryStage({ room, dim = 0, children }: { room: RoomId; dim?: number; children: ReactNode }): ReactElement {
  return (
    <Modal supportedOrientations={MODAL_ORIENTATIONS} animationType="fade" statusBarTranslucent transparent visible>
      <View style={styles.page}>
        <StoryRoom room={room} />
        <View style={[styles.felt, gradient("radial-gradient(ellipse at 50% 38%, #3fa369, #27804f 55%, #1b5e3a)")]} />
        <LinearGradient {...gradients.felt} pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: dim }]} />
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#3b1d0e", flex: 1 },
  felt: { borderRadius: 30, bottom: 150, boxShadow: "inset 0px 0px 0px 2px rgba(255,255,255,0.12), 0px 10px 30px rgba(0,0,0,0.5)", left: 10, position: "absolute", right: 10, top: 96 },
});
