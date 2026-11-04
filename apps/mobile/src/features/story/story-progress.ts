/**
 * story-progress.ts — the device's story save (STO-973): the engine's `StoryProgress`, stored as
 * it is in the same durable slot as the quest claims. One copy lives in memory, so the map and the
 * table read the same save without a reload.
 */

import { useSyncExternalStore } from "react";

import { EMPTY_STORY_PROGRESS, type StoryProgress } from "@wordpoker/game-rules";

import { readItem, writeItem } from "@/lib/storage/claim-store";

const KEY = "story-progress";

let current: StoryProgress | null = null;
const listeners = new Set<() => void>();

/** A save that no longer parses starts the campaign over rather than crashing the map. */
function load(): StoryProgress {
  try {
    const parsed: unknown = JSON.parse(readItem(KEY) ?? "null");
    if (typeof parsed === "object" && parsed !== null && "chapters" in parsed) return parsed as StoryProgress;
  } catch {
    // fall through
  }
  return EMPTY_STORY_PROGRESS;
}

export function storyProgress(): StoryProgress {
  current ??= load();
  return current;
}

export function saveStoryProgress(next: StoryProgress): void {
  current = next;
  writeItem(KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStoryProgress(): StoryProgress {
  return useSyncExternalStore(subscribe, storyProgress, storyProgress);
}
