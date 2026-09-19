# WORD POKER

## Complete Game Specification

This is the canonical rules spec for Word Poker. It has been split into focused files
under [`docs/rules/`](rules/). Each file below owns a contiguous range of the original
numbered sections, so the numbering stays continuous across the set.

## Rules Index

| File | Sections | Covers |
| ---- | -------- | ------ |
| [Balances, Buy-Ins & Joining](rules/balances-and-tables.md) | 1–5 | Wallet vs. Table Stack, fixed buy-ins, table browser, joining flow, table setup & dealer |
| [Letter Values, Scoring & Multipliers](rules/scoring.md) | 6–9 | Letter values, tile bag distribution, word score calculation, MONSTER example, multiplier tiles |
| [Two-Letter Tiles, Word Validation & Length](rules/tiles.md) | 10–12 | Two-letter / choice tiles, word validation, word length |
| [Hand Structure & Phases](rules/hand-flow.md) | 13–20 | Hand phases, the deal, betting rounds, flop/turn/river, word building, showdown |
| [Betting, Pots & Tie-Breakers](rules/betting-and-pots.md) | 21–26 | Tie-breakers, betting & stack rules, current bet, winning chips, side pots, winning without showdown |
| [Re-Buy, Leaving & Disconnects](rules/table-lifecycle.md) | 27–29 | Re-buy conditions, leaving the table, disconnect handling |
| [Seated Interface & Betting Controls](rules/interface-and-controls.md) | 30–31 | Seated table UI, betting control requirements |
| [Edge Cases, Acceptance Criteria & Hand Summary](rules/edge-cases-and-acceptance.md) | 32–34 | Gameplay edge cases, acceptance criteria, complete hand summary |
