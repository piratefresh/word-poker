# Two-Letter Tiles, Word Validation & Length

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 10. Two-Letter Tiles

## What Is a Two-Letter Tile?

A two-letter tile contains two letters on one physical tile.

Examples:

- TH
- ER
- IN
- ED

Both letters are displayed together.

The tile counts as one physical tile but provides two letters when building a word.

## Two-Letter Tile Rules

- Both letters must be used together.
- The letters cannot be separated.
- The order printed on the tile must be preserved.
- Each letter scores independently.
- The tile counts as one tile for the Full Rack Bonus.
- A two-letter tile may appear as a private tile or community tile.
- Three-letter and four-letter tiles are not allowed.

### Example

A TH tile contributes:

- T = 2 points
- H = 5 points

Total value:

2 + 5 = **7 points**

If the TH tile has a Double Letter multiplier:

(2 + 5) × 2 = **14 points**

## Two-Letter Tile Frequency

A hand may contain a maximum of three two-letter tiles across:

- All private tiles dealt to players
- All five community tiles

Recommended distribution:

- Usually one private two-letter tile
- Usually one community two-letter tile
- Occasionally a third two-letter tile
- Never more than three total

The exact placement is controlled by the game system and may vary each hand.

## Example Choice Tiles

### Vowel Choices

- A/E
- E/I
- O/U
- A/I

### Consonant Choices

- T/S
- R/N
- D/T
- S/L

### High-Value Choices

- Q/K
- Z/X
- J/H

Choice tiles and fixed two-letter sequence tiles should be treated as separate tile types.

A fixed sequence tile such as TH must use both letters in that order.

A choice tile such as A/E allows the player to choose either A or E when submitting the word. It does not provide both letters.

The UI must clearly distinguish between:

- Fixed two-letter sequence tiles
- Either-or choice tiles

---

# 11. Word Validation

A submitted word must:

- Contain at least 2 letters
- Use only letters provided by the selected tiles
- Respect the printed order of fixed two-letter tiles
- Use each physical tile no more than once
- Appear in the configured dictionary
- Be submitted before the reveal timer expires

Supported dictionaries may include:

- TWL
- SOWPODS

The dictionary used by a table or game mode must be displayed before joining.

## Invalid Submissions

The player receives 0 points when:

- The word is not in the selected dictionary
- The word uses unavailable letters
- A two-letter tile is split
- A fixed sequence is reversed
- A tile is used more than once
- The player submits after the timer expires
- The player submits no word

A player with an invalid word may still lose chips already committed to the pot.

---

# 12. Word Length

A word must contain at least 2 letters.

The normal maximum is determined by the available tiles:

- Seven single-letter tiles can create up to a seven-letter word.
- Two-letter tiles may allow a word to contain more than seven letters.
- The player may never use more physical tiles than are available.

For example, seven physical tiles containing two two-letter tiles could create a nine-letter word.

The Full Rack Bonus is based on using all seven physical tiles, not on the number of letters in the final word.
