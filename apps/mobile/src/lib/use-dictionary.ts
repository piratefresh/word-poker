/**
 * use-dictionary.ts — the table's vocabulary, loaded once for the screens that need it.
 *
 * §11 of `docs/rules/tiles.md` puts the dictionary on screen before play, and a hand cannot be
 * judged without one, so the screens that deal (offline, and the tutorial) ask for it here and
 * hold their table back until it arrives. `loadDictionary` does the actual work — it caches per
 * id, so two screens asking cost one load — and this hook only turns it into render state.
 *
 * The engine never loads anything itself (AGENTS.md): the list arrives as injected data, and
 * this is the app-side seam that loads it.
 */

import { useEffect, useState } from "react";

import { loadDictionary, type Dictionary } from "@wordpoker/game-rules";

/** The shipped dictionary, or `null` until it has loaded. */
export function useDictionary(): Dictionary | null {
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);

  useEffect(() => {
    let live = true;

    void loadDictionary().then((loaded) => {
      // A screen that unmounts while the list is loading must not set state on the way out.
      if (live) {
        setDictionary(loaded);
      }
    });

    return () => {
      live = false;
    };
  }, []);

  return dictionary;
}
