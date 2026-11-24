import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import { chapterRecord } from "@wordpoker/game-rules";

import { ChapterMapScreen } from "@/components/screens/story/chapter-map-screen";
import { nodeState, previewProgress, type ChapterProgress } from "@/features/story/chapter-map";
import { chapterMap, nextChapterMap, openChapter } from "@/features/story/chapter-maps";
import { useStoryProgress } from "@/features/story/story-progress";

/**
 * Story mode's chapter map (STO-861, STO-1120): `/story?chapter=the-local`, Chapter 1 without one,
 * drawn from the saved run (STO-973). A locked chapter falls back to Chapter 1. In development
 * `/story?progress=0…5` previews each stage instead, locked or not. An open node plays its hand.
 */
export default function StoryRoute() {
  const params = useLocalSearchParams<{ chapter?: string; progress?: string }>();
  const saved = useStoryProgress();
  const preview = __DEV__ && params.progress !== undefined;
  const map = preview ? chapterMap(params.chapter) : openChapter(params.chapter, saved);
  const progress = useMemo<ChapterProgress>(
    () => (map === null ? {} : preview ? previewProgress(map, Number(params.progress)) : chapterRecord(saved, map.chapter.id).stars),
    [map, preview, params.progress, saved],
  );
  if (map === null) return <Redirect href="/story" />;
  const next = nextChapterMap(map);

  return (
    <ChapterMapScreen
      key={map.chapter.id}
      map={map}
      progress={progress}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onPlay={(node) => {
        if (nodeState(map, node, progress) !== "locked") {
          router.push({ pathname: "/story-hand", params: { chapter: map.chapter.id, node: node.id } });
        }
      }}
      onNextChapter={next === null ? undefined : () => router.push({ pathname: "/story", params: { chapter: next.chapter.id } })}
    />
  );
}
