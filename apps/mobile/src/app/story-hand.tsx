import { Redirect, router, useLocalSearchParams } from "expo-router";

import { StoryHandScreen } from "@/components/screens/story/story-hand-screen";
import { openNode } from "@/features/story/chapter-maps";
import { storyProgress } from "@/features/story/story-progress";

/**
 * One story hand at a map node (STO-973, STO-1120): `/story-hand?chapter=the-local&node=hand-1`,
 * Chapter 1 without a chapter. A node that is not open goes back to its chapter's map.
 */
export default function StoryHandRoute() {
  const params = useLocalSearchParams<{ chapter?: string; node?: string }>();
  const open = openNode(params.chapter, params.node, storyProgress());
  if (open === null) return <Redirect href={{ pathname: "/story", params: params.chapter === undefined ? {} : { chapter: params.chapter } }} />;
  const { map, node } = open;
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: "/story", params: { chapter: map.chapter.id } }));
  return <StoryHandScreen key={`${map.chapter.id}/${node.id}`} map={map} node={node} onLeave={back} />;
}
