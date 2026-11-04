import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import { ChapterMapScreen } from "@/components/screens/story/chapter-map-screen";
import { previewProgress, type ChapterProgress } from "@/features/story/kitchen-table-map";

/**
 * Story mode's Chapter 1 map (STO-861). Progress isn't saved yet (STO-973), so the map opens
 * fresh; in development `/story?progress=0…5` previews each stage. The two authored challenges
 * open on the development table until the chapter run engine plays them for real.
 */
export default function StoryRoute() {
  const params = useLocalSearchParams<{ progress?: string }>();
  const progress = useMemo<ChapterProgress>(
    () => (__DEV__ && params.progress !== undefined ? previewProgress(Number(params.progress)) : {}),
    [params.progress],
  );

  return (
    <ChapterMapScreen
      progress={progress}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onPlay={(node) => {
        if (__DEV__ && node.challengeId) router.push({ pathname: "/dev-challenge", params: { id: node.challengeId } });
      }}
    />
  );
}
