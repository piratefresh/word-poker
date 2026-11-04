import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette, type } from "@/constants/theme";
import type { MapNode } from "@/features/story/kitchen-table-map";
import { useDictionary } from "@/features/table/use-dictionary";

import { StoryTable } from "./components/story-table";

/**
 * One story hand (STO-973): the offline table at a map node, opened on a Power Draw of the run's
 * drafted powers, then the run's verdict — the node's stars, the draft a hand opens, and a lost
 * boss hand dealt again. Every rule here is game-rules' `chapter-run.ts`; this screen plays the
 * hand and saves what the run says.
 */
export function StoryHandScreen({ node, onLeave }: { node: MapNode; onLeave: () => void }): ReactElement {
  const dictionary = useDictionary();
  return (
    <View style={styles.screen}>
      {dictionary === null ? (
        <View style={styles.center}>
          <Text style={type.bodyDim}>Setting the table…</Text>
        </View>
      ) : (
        <StoryTable dictionary={dictionary} node={node} onLeave={onLeave} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: palette.felt800, flex: 1 },
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
});
