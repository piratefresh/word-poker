import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import { chapterRecord } from "@wordpoker/game-rules";

import { ChapterMapScreen } from "@/components/screens/story/chapter-map-screen";
import { nodeState, previewProgress, type ChapterProgress } from "@/features/story/kitchen-table-map";
import { useStoryProgress } from "@/features/story/story-progress";

/**
 * Story mode's Chapter 1 map (STO-861), drawn from the saved run (STO-973); in development
 * `/story?progress=0…5` previews each stage instead. An open node plays its hand.
 */
export default function StoryRoute() {
  const params = useLocalSearchParams<{ progress?: string }>();
  const saved = useStoryProgress();
  const progress = useMemo<ChapterProgress>(
    () =>
      __DEV__ && params.progress !== undefined
        ? previewProgress(Number(params.progress))
        : chapterRecord(saved, "kitchen-table").stars,
    [params.progress, saved],
  );

  return (
    <ChapterMapScreen
      progress={progress}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onPlay={(node) => {
        if (nodeState(node, progress) !== "locked") router.push({ pathname: "/story-hand", params: { node: node.id } });
      }}
    />
  );
}
