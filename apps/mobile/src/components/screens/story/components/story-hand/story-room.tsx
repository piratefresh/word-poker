import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactElement } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { MAP_HEIGHT, MAP_WIDTH, ROOMS, ROOM_ZOOM, type RoomId } from "@/features/story/kitchen-table-map";

const MAP_ART = require("@/assets/images/story/kitchen-table-map.jpg");

/**
 * The room a story hand is played in: the map's own art zoomed to `ROOM_ZOOM` and cropped to the
 * node's room, so the map and the table stay one picture. The top and bottom are darkened so the
 * header and the buttons stay readable. It sits behind the stitched felt mat.
 */
export function StoryRoom({ room }: { room: RoomId }): ReactElement {
  const { width, height } = useWindowDimensions();
  const unit = (width / MAP_WIDTH) * ROOM_ZOOM;
  // A tall window must not read past the map's foot.
  const top = Math.min(ROOMS[room].y, MAP_HEIGHT - height / unit);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`story-room-${room}`}>
      <Image
        accessible={false}
        contentFit="fill"
        source={MAP_ART}
        style={{ height: MAP_HEIGHT * unit, left: -ROOMS[room].x * unit, position: "absolute", top: -Math.max(0, top) * unit, width: MAP_WIDTH * unit }}
      />
      <LinearGradient
        colors={["rgba(10,6,4,0.35)", "rgba(10,6,4,0)", "rgba(10,6,4,0)", "rgba(10,6,4,0.45)"]}
        locations={[0, 0.22, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
