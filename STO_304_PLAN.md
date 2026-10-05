# Tutorial: personalized word + engine wiring (STO-304)

## Context

STO-304 (Backlog, High) wires the tutorial's build-your-word step to the shared `packages/game-rules` engine instead of bespoke logic. Today `apps/mobile/src/components/screens/tutorial/tutorial-screen.tsx` is a held-round placeholder: manual Deal/Reset/Continue over the static `FOUR_PLAYER_FLOP_FIXTURE`, static private tiles with Reveal/Hide, no word step at all. This plan adds the personalized step the owner asked for: the lesson opens by asking the player to **pick or type a word to spell**, deals tiles that can spell it, and judges the built word through the real engine (`resolveSubmission` live, `evaluateWord` at confirm) — the same one that guards real play.

Surface decision (owner): the word prompt is a `@expo/ui/swift-ui` `Popover` on iOS (iOS-only in SDK 57.0.18 — verified: `Popover` exists only under `node_modules/@expo/ui/src/swift-ui/`, absent from the universal set) and **poppo** (`expo install poppo`, native popups on Android via Balloon, Base UI on web) on Android and web, so web Maestro E2E and the Android `e2e-test` build keep a real surface.

Product decisions (owner): suggestions + free typing; the chosen word is the goal headline while **any** engine-valid word is confirmable (STO-304 AC keeps the engine the sole judge); matching the chosen word triggers the lesson-complete moment.

## Approach

Order is a dependency tree: 1→2→3→4→5→6. Steps 2 and 3 are independently testable pure/hook units.

### 1. Install poppo

- In `apps/mobile`: `npx expo install poppo` (Android/iOS native module, autolinked, SDK 53+ needs no config) and `pnpm add @base-ui/react` (web peer). Reanimated/GestureHandler peers already satisfied (`GestureHandlerRootView` is the root in `src/app/_layout.tsx`).
- Contingency: if jest cannot parse poppo/`@base-ui` ESM, append `|poppo|@base-ui.*` to `transformIgnorePatterns` in `apps/mobile/package.json`.

### 2. `apps/mobile/src/components/screens/tutorial/lesson-words.ts` (new, pure)

No engine equivalent constructs tiles from a word (engine deals *from* seeds; bots pick words *from* tiles), so this is new code, client-side, mirroring the fixture role of `game-fixtures.ts`:

- `export const LESSON_SUGGESTIONS: readonly string[] = ["STRONG", "POKER", "LUCKY", "WORD"]` — STRONG first so STO-251's scripted walkthrough stays one tap away.
- `const LESSON_FILLER_LETTERS = "JQXZV"` — low-playability fillers so the dealt board doesn't hand the player a better word than theirs.
- `export function lessonTiles(word: string): { privateTiles: LetterTile[]; community: LetterTile[] }`:
  - Input contract: normalized uppercase A–Z, 2–7 letters (§12 bounds from `packages/game-rules/src/words/building.ts`). Throw `Error` on anything else (defensive; callers pre-validate via the dictionary).
  - First two letters → `privateTiles` (ids `lesson-private-0/1`), remaining letters fill `community` slots in order (ids `lesson-community-0..4`), leftover community slots take `LESSON_FILLER_LETTERS` in order. A 7-letter word fills everything (no filler); a 2-letter word gets all five fillers.
  - Points from `LETTER_VALUES` (`@wordpoker/game-rules`) so §7 scoring is real. No choice tiles.
  - Same word → same tiles, always (this replaces STO-304's scripted-seed wording: determinism is per chosen word; the default suggestion path is fixed).

### 3. `apps/mobile/src/components/screens/tutorial/use-tutorial-lesson.ts` (new hook, the tutorial's WordDraft adapter)

Mirrors `wordsOf` in `apps/mobile/src/features/table/hero-view.ts:421-456` and `setDraft` in `src/features/offline/use-offline-game.ts:408-417` — do not duplicate those files, copy their judging composition:

- State: `chosenWord: string | null`, `draft: readonly TilePlay[]`, `confirmed: boolean`, `evaluation: WordEvaluation | null`.
- `chooseWord(word: string)`: accept only if `dictionary.isWord(word)` (Dictionary injected as a hook arg, like `useOfflineGame`); set `chosenWord` (normalized), reset draft/confirmed. Returns nothing; the prompt disables its action button for non-words so this never sees one.
- Available tiles = `[...privateTiles, ...communityRevealed]` (community passed in already sliced to `dealtCount` by the screen, mirroring the builder's `community: (Tile|null)[]` contract — nulls bring no tile).
- Live preview per edit: `resolveSubmission` → `word: spellSubmission(...)`, `score: resolution.ok ? scoreWord(resolution.tiles) : null`, `reason`: null while ok or too-short-in-progress (same `previewReason` semantics as hero-view.ts:448-456).
- `confirmable`: `!confirmed && dealtCount === 5 && resolution.ok` (the §19-window analog: the lesson's word step opens once the board is complete).
- `confirmWord()`: `evaluateWord({ available, submission, dictionary })` — the authoritative engine call STO-304 names. Valid → `confirmed = true`, store `evaluation`; invalid → keep the draft open, surface `evaluation.reason` as the draft `reason` (same engine that guards real play rejects it).
- Returns `{ chosenWord, words, privateTiles, community, chooseWord, setDraft, confirmWord }` where `words: WordDraft` (contract at `apps/mobile/src/components/word-builder/word-builder.tsx:36-53`; `open: !confirmed`, `confirmable` as above).

### 4. Word prompt components (new, `apps/mobile/src/components/screens/tutorial/`)

- `word-prompt-content.tsx` — the shared inner surface, plain RN views + theme (`@/constants/theme`), used by both platform files:
  - Suggestion chips: `GameButton` (`@/components/ui/game-button`) compact, one per `LESSON_SUGGESTIONS`, testID `tutorial-word-suggestion-{WORD}`.
  - Free text: `TextInput` from `@expo/ui` (universal — has `.ios/.android/.web` variants, satisfies the AGENTS.md preference), auto-capitalize characters, 7-char cap, normalize to A–Z on change, testID `tutorial-word-input`.
  - Live validation line: `"Not in the dictionary — try another"` when non-empty and `!dictionary.isWord(input)`; silent while empty.
  - Dictionary provenance line: `dictionary.label` (STO-304's "show the configured dictionary name").
  - Primary `GameButton` "Deal this word" (gold, testID `tutorial-word-deal`), disabled unless current input/suggestion `dictionary.isWord`; onPress → `chooseWord` + close.
- `word-prompt.tsx` (base → Android + web): poppo controlled `Popover.Root open onOpenChange` → `Popover.Trigger` wrapping a gold `GameButton` "Choose your word" (testID `tutorial-word-prompt-trigger`) → `Popover.Portal` → `Popover.Positioner side="top" sideOffset={8}` → `Popover.Popup presetAnimation="fadeIn"` with `WordPromptContent` and a themed `Popover.Arrow`.
- `word-prompt.ios.tsx`: `Popover` from `@expo/ui/swift-ui` with `isPresented`/`onIsPresentedChange`, `attachmentAnchor="top"`, `arrowEdge="bottom"`; `Popover.Trigger` wraps an `@expo/ui` `Button` (label "Choose your word", variant "filled" — trigger must live inside the swift-ui tree; RN `GameButton` cannot be the anchor); `Popover.Content` → `RNHostView matchContents` → `WordPromptContent`. This file must not import poppo; the base file must not import `@expo/ui/swift-ui` (web/Android builds resolve the base).
- Presentation rule (both): auto-open when `chosenWord === null && !dismissed`; reopen via the trigger; once a word is dealt the trigger leaves the row (re-picking would re-deal a live lesson — out of scope).

### 5. Wire into `tutorial-screen.tsx`

- `useDictionary()` (`@/features/table/use-dictionary`) gates the step: while null, render the felt exactly as today minus the prompt/strip (the table is coming, not missing — same stance as `LoadingTable` in offline-game-screen.tsx).
- Opening state: empty board (existing `dealtCount = 0` presentation), hand dock hidden, prompt auto-open over the felt. `FOUR_PLAYER_FLOP_FIXTURE` keeps supplying seats/pot/blinds/seatCount only.
- After `chooseWord`: `lessonTiles(chosenWord)` supplies `privateTiles` (flip in with the existing `animation="flip"` path) and the 5 community tiles; the existing `dealCommunity`/`DEAL_STAGGER_MS`/`resetCommunity` machinery is kept as-is — it reveals slot order.
- Wrap `TutorialScreenBody`'s column in `<WordBuilder {...words} privateTiles={...} community={community.map(...)} onDraft={setDraft}>`; the `community` prop gets `null` for slots beyond `dealtCount` (builder contract: unrevealed = null).
- Hand dock: delete the static `handTiles` map + Reveal/Hide `Host` and `handSide` state (dead once the strip owns the hand); keep the heading copy, render `<WordPreview /><WordHand />` in the dock — the felt's rack pattern from offline-game-screen.tsx:208-215.
- Action row: keep Deal/Reset/Continue in the `@expo/ui` `Host` `Row`; add outside the `Host`, beside it: the `WordPrompt` trigger (until a word is chosen) and, once chosen, the confirm `GameButton` "Lock in word" (testID `tutorial-word-confirm`, gold) enabled iff `words.confirmable`, onPress `confirmWord()`. The word builder carries no buttons of its own (AGENTS.md) — these are the row's, exactly like the offline action row.
- Lesson-complete moment: when `confirmed` and `spellSubmission(...)` equals `chosenWord`, push the existing toast queue: `` `You spelled ${chosenWord} — ${score} pts` `` (key `"lesson-word"`). Any other valid confirmed word shows its own score toast without the "goal" wording.
- Delete the now-unused `COMMUNITY_TILES` constant (file-local; no other references — verified by grep).

### 6. Tests + E2E

- `lesson-words.test.ts`: determinism (same word twice → deep-equal tiles); every suggestion and the word's letters are all present in the dealt 7; 7-letter word → zero fillers; 2-letter word → five fillers; throws on lowercase/8-letter/non-alpha.
- `use-tutorial-lesson.test.ts` (follow the hook-test style of `use-offline-game.test.ts`): with the fixture dictionary from `@/test-support/dictionary-fixtures` — chooseWord ignores non-words; draft preview shows word/score via engine; confirmable false until river + valid resolution; confirm of a valid word sets confirmed + evaluation; confirm of a dictionary-miss (hand-built fixture case) leaves the draft open with the engine's reason.
- `word-prompt.test.tsx` + `tutorial-screen.test.tsx` (jest renders the base/poppo variant; none exists today for this screen): typing `"QQQQ"` disables Deal and shows the not-in-dictionary line; tapping the STRONG chip deals; the builder strip mounts after the choice; Lock-in disabled until river + valid draft; confirmed goal word pushes the toast.
- Real-artifact guard in `lesson-words.test.ts`: `await loadDictionary()` (the shipped `en_US-large`, same as `packages/game-rules/test/dictionary.test.ts` loads) and assert `isWord` for every `LESSON_SUGGESTIONS` entry. Contingency: if the artifact import misbehaves under mobile jest, drop to the fixture dictionary in-unit and run `pnpm --filter @wordpoker/mobile exec tsx -e "import('./src/components/screens/tutorial/lesson-words').then(async m => (await import('@wordpoker/game-rules').then(g => g.loadDictionary())).then(d => console.log(m.LESSON_SUGGESTIONS.map(d.isWord))))"` as the verification instead.
- New `.maestro/tutorial-word.yaml` (web flow, repo root `.maestro/`): conditional sign-in copied from `.maestro/offline-hand.yaml` (route is behind the auth guard — `Stack.Protected` in `src/app/_layout.tsx:70-76`), then `openLink` /tutorial, assert the prompt auto-opened, type `POKER` into `tutorial-word-input`, tap `tutorial-word-deal`, deal the board to river, tap the P/O/K/E/R tiles by testID (the strip's tile testIDs), assert `tutorial-word-confirm` becomes enabled, lock in, assert the toast. All ids via `webTestID`; match texts whole.

## Critical files & anchors

- `apps/mobile/src/components/screens/tutorial/tutorial-screen.tsx` — integration point: action row (lines ~236-257), hand dock (~307-340), `COMMUNITY_TILES` (37-43), `handSide` (149).
- `apps/mobile/src/features/table/hero-view.ts:412-456` — `wordsOf`/`previewReason`, the judging composition to mirror (read-only reference).
- `packages/game-rules/src/words/building.ts` — `evaluateWord`, `resolveSubmission`, `spellSubmission` signatures; §12 bounds 2–7.
- `apps/mobile/src/components/word-builder/word-builder.tsx:36-112` — `WordDraft`/`WordBuilderProps` contract the adapter must speak.
- `apps/mobile/src/components/screens/offline/offline-game-screen.tsx:146-228` — the composition pattern (WordBuilder wrapping the felt, rack slot, action row).

## Verification

Prereqs: pnpm install done; for the web flow, matching Chrome/chromedriver on PATH and the seeded E2E user (`node --env-file=apps/mobile/.env scripts/seed-test-user.mjs` if sign-in fails).

1. `pnpm --filter @wordpoker/mobile test -- tutorial lesson-words word-prompt use-tutorial-lesson` — all new tests green.
2. `pnpm --filter @wordpoker/mobile test` && `pnpm --filter @wordpoker/mobile typecheck` — no regressions.
3. New-behavior proof (engine wiring, STO-304 AC): in `use-tutorial-lesson.test.ts`, a hand-built dictionary-miss at confirm stays unconfirmed with the engine's reason — the same engine that guards real play rejects it; the real-artifact test proves suggestions are spellable words in the shipped list.
4. Determinism proof: `lesson-words.test.ts` asserts `lessonTiles("POKER")` deep-equals itself across calls and contains exactly P,O,K,E,R + two fillers.
5. Web E2E: `pnpm --filter @wordpoker/mobile web` in one terminal, then `maestro test --platform web .maestro/tutorial-word.yaml` — types POKER, deals, spells it via tile taps, locks in, sees the toast.
6. iOS popover (manual, visual limit of this environment): Expo Go / dev build → `/tutorial` → SwiftUI popover with arrow above the trigger; Android path is covered by the web/base jest tests plus the poppo-driven E2E on web — an Android `e2e-test` run (`eas build --platform android --profile e2e-test` + `maestro test --platform android`) exercises the same base component when available.

## Assumptions & contingencies

- poppo (193★, Expo SDK 53+ compatible, autolinked) works on SDK 57 web/Android as documented. If its Android native module breaks the `e2e-test` build, fall back to an RN `Modal`-based panel for Android only (Modal pattern already used in offline-game-screen.tsx), keeping web on poppo and iOS on `@expo/ui`.
- The iOS `@expo/ui` trigger renders as an `@expo/ui` Button (not `GameButton`) because `Popover.Trigger` must anchor a swift-ui child; web/Android keep the `GameButton` trigger. Accepted visual divergence on iOS.
- The lesson does not re-open the prompt after a deal; re-running the tutorial resets it (component state). No persistence of the chosen word.
- STO-251's raise-bar walkthrough and its finger animations are a separate ticket and are not part of this plan; STO-251's STRONG build-your-word script remains reachable as the first suggestion chip.
- Scoring display reuses `WordPreview`'s existing §7 line plus the confirm toast; no separate score-breakdown screen is added here.
