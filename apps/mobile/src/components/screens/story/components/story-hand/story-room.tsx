import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactElement } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { MAP_WIDTH, ROOM_ZOOM, type ChapterMap } from "@/features/story/chapter-map";

/**
 * The room a story hand is played in: the map's own art zoomed to `ROOM_ZOOM` and cropped to the
 * node's room, so the map and the table stay one picture. The top and bottom are darkened so the
 * header and the buttons stay readable. It sits behind the stitched felt mat. A map without art
 * yet (or a node without a room) is the map's tint instead.
 */
export function StoryRoom({ map, room }: { map: ChapterMap; room: string | undefined }): ReactElement {
  const { width, height } = useWindowDimensions();
  const crop = room === undefined ? undefined : map.rooms[room];
  const unit = (width / MAP_WIDTH) * ROOM_ZOOM;
  // A tall window must not read past the map's foot.
  const top = crop === undefined ? 0 : Math.min(crop.y, map.height - height / unit);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`story-room-${room ?? map.chapter.id}`}>
      {map.art === null || crop === undefined ? (
        <LinearGradient colors={map.tint} style={StyleSheet.absoluteFill} />
      ) : (
        <Image
          accessible={false}
          contentFit="fill"
          source={map.art}
          style={{ height: map.height * unit, left: -crop.x * unit, position: "absolute", top: -Math.max(0, top) * unit, width: MAP_WIDTH * unit }}
        />
      )}
      <LinearGradient
        colors={["rgba(10,6,4,0.35)", "rgba(10,6,4,0)", "rgba(10,6,4,0)", "rgba(10,6,4,0.45)"]}
        locations={[0, 0.22, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
