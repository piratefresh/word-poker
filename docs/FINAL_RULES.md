# WORD POKER

## Complete Game Specification

This is the canonical rules spec for Word Poker. It is derived from the product owner's
[product spec](PRODUCT_SPEC.md) and split into focused files under [`docs/rules/`](rules/).
Each file below owns a contiguous range of numbered sections, so the numbering stays
continuous across the set. Code and tests cite these numbers (`§19`, `§21`, …), so a section
keeps its number for life: new material is appended as a new number, never slotted in.

## Rules Index

| File | Sections | Covers |
| ---- | -------- | ------ |
| [Balances, Buy-Ins & Joining](rules/balances-and-tables.md) | 1–5 | Wallet vs. Table Stack, stake tiers and the Buy-In Cap, table browser, joining flow, table setup, blinds & dealer |
| [Letter Values, Scoring & Multipliers](rules/scoring.md) | 6–9 | Letter values, tile bag distribution, word score calculation, MONSTER example, multiplier tiles |
| [Choice Tiles, Word Validation & Length](rules/tiles.md) | 10–12 | Two-letter choice tiles, word validation, word length |
| [Hand Structure & Phases](rules/hand-flow.md) | 13–20 | Hand phases, blinds & the deal, betting rounds, flop/turn/river, word building, showdown |
| [Betting, Pots & Tie-Breakers](rules/betting-and-pots.md) | 21–26 | Tie-breakers, betting & stack rules, current bet, winning chips, side pots, winning without showdown |
| [Re-Buy, Leaving & Disconnects](rules/table-lifecycle.md) | 27–29 | Re-buys and top-ups, leaving the table, disconnects, idle removal, table closing |
| [Seated Interface & Betting Controls](rules/interface-and-controls.md) | 30–31 | Seated table UI, betting control requirements |
| [Edge Cases, Acceptance Criteria & Hand Summary](rules/edge-cases-and-acceptance.md) | 32–34 | Gameplay edge cases, acceptance criteria, complete hand summary |
| [Table Features](rules/table-features.md) | 35–38, 43 | Shuffle, pre-selected actions, anonymity, chip and winner motion, Word Checker |
| [Accessibility](rules/accessibility.md) | 39 | Text-to-speech, visual settings, audio and motion settings |
| [Formats: Rooms, Tournaments & Cash Games](rules/formats.md) | 40–42 | Room variations, tournaments, cash-game stakes |
| [Power-Ups](rules/power-ups.md) | 44 | The Power Draw, the held power, activation windows, the v1 powers, swapping a tile, visibility |

## Reading the Product Spec

The product spec is short and informal in places. Where it is ambiguous or contradicts
itself, the rules take the reading below. Each one is a decision; the ADR records why.

| Product spec says | The rules read it as | Where |
| ----------------- | -------------------- | ----- |
| "Small blind and big blind post forced bets" (no amounts) | Small blind 1% and big blind 2% of the table's Buy-In Cap; the big blind is also the minimum bet | §5, §15, [ADR 0004](adr/0004-blinds.md) |
| Two-letter tiles: "choose ONE of the two letters", but Phase 6 says "must be used together (cannot split)" | Every two-letter tile is a **choice** tile: exactly one face is played. There are no fixed-sequence tiles; words are 2–7 letters | §10–§12, [ADR 0005](adr/0005-choice-tiles-only.md) |
| "Maximum 2-3 two-letter tiles total across all 7 tiles" | At most three two-letter tiles among the seven any one seat can play; the deal aims for two | §10 |
| Tie-break draw: "Discard tiles draw, repeat if still tied" and "they get a second letter" (A + Z = 11) | A tie on the draw gives the still-tied seats another tile that **adds** to their draw total | §21 |
| Betting timeout: "auto-fold", idle or disconnected | Every expired betting turn folds, even when the seat owed nothing; a disconnected seat gets the same turn clock before it folds | §15, §29, [ADR 0006](adr/0006-betting-timeout-folds.md) |
| "Buy-In as Bet Cap": a tier's top buy-in caps what a player can bring, "even across rebuys or top-ups" | A table's Buy-In Cap limits the Wallet Coins a player moves onto that table in one table session. Winnings are not capped | §2, §27, [ADR 0007](adr/0007-buy-in-cap.md) |
| Double Letter "favors high-value letters (5+ points)" | A tile whose best face is worth 5 or more rolls its Double Letter at a higher chance | §9 |
| MONSTER quick example: "21 points" | 28 points — the spec's own step-by-step breakdown | §8 |
| "4-6 players at table" (Setup) | A table seats 2 to 6: the spec's 4 is the recommended fill, and §5 spells out heads-up blinds and turn order for a table of two | §5, [ADR 0004](adr/0004-blinds.md) |

## Not Yet in Code

The rules above run ahead of the engine in these places; until each lands, the code is
behind the spec, not the other way round:

- Blinds (§5, §15) — the engine still opens every round on checks (ADR 0001's model).
- Choice-only two-letter tiles (§10) — the engine still deals fixed-sequence tiles and holds
  A/E and T/S in the bag.
- The §21 draw: the ladder without the highest-letter step, the additive repeat draw, and the
  single-letter pool it draws from.
- Timeout folds when nothing is owed (§15) and the disconnected seat's turn clock (§29).
- The stake-tier buy-in range and Buy-In Cap (§2–§4, §27), and top-ups.
- Idle removal and the last-player countdown (§29).
- §36, §37 and §39–§42: pre-selected actions, anonymity, the accessibility settings, and
  every format beyond the default No Limit table. §35's shuffle and §38's winner highlight
  already ship.
