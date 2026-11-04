import { Redirect, router, useLocalSearchParams } from "expo-router";

import { StoryHandScreen } from "@/components/screens/story/story-hand-screen";
import { KITCHEN_TABLE } from "@/features/story/kitchen-table-map";

/** One story hand at a Kitchen Table node (STO-973): `/story-hand?node=first-hand`. */
export default function StoryHandRoute() {
  const params = useLocalSearchParams<{ node?: string }>();
  const node = KITCHEN_TABLE.nodes.find((candidate) => candidate.id === params.node);
  if (node === undefined) return <Redirect href="/story" />;
  return <StoryHandScreen key={node.id} node={node} onLeave={() => (router.canGoBack() ? router.back() : router.replace("/story"))} />;
}
