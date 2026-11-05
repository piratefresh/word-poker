# Story Mode

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 46. The Chapter Run

Story mode is a single-player campaign of five chapters played at the offline table against
bots, under the ordinary rules of §1–§44. The chapters, their nodes, thresholds, power pools and
rewards are config (`packages/game-rules/src/story/chapters.ts`), to tune after playtesting.

**Chapters.** Kitchen Table (The Professor, 15), The Local (Vowel Vinny, 24), The Back Room (The
Hustler, 30), The High Roller Lounge (Lady Q, 38), The Dealer's Table (The Dealer, 45). The
number is the chapter's **threshold**: a word score. The first chapter is open from the start;
each later one opens when the boss before it is beaten.

**Nodes.** A chapter is 3 hands, then an optional bonus hand, then the boss; the final chapter is
its boss alone. The hands open one after another. The bonus and the boss both open once every hand
has been played.

**Stars.** A node earns 0–3 stars from its one hand, against the node's threshold (the
chapter's unless the node sets its own):

| Stars | The hand |
| ----- | -------- |
| 0 | Lost the pot |
| 1 | Won the pot (a share of a split pot counts) |
| 2 | Won, with a word score at or over the threshold |
| 3 | Won, with a word score of the threshold plus 25% or more |

A node keeps its best stars and best score. A lost regular hand still records 0 stars, so the
path stays open; it can be replayed any time.

**The boss.** The boss hand counts only when the hero takes the pot **and** scores at or over the
threshold. Anything else records nothing and deals the boss hand again, with the drafted powers
kept. After 2 boss losses in a row the coach offers a hint about the boss's tell. The first win
pays the chapter's coins and XP; later wins pay stars only.

**The power draft.** After each hand won (not a lost hand, the bonus or the boss), the run offers up to 3 powers
from the chapter's pool that it does not already hold, drawn evenly. The player takes one: the draft is the
hand's reward, so the screen asks for a pick (the engine still lets a draft be skipped). The run holds up to 3 drafted powers for the whole chapter; at 3, a new pick replaces a held
one. The offers wait in the save until they are picked or skipped.

**Powers in a hand.** A hand opens on §44's Power Draw, but only the hero draws, and it is
offered exactly the drafted powers; it keeps one and uses it at most once that hand, as §44
says. A drafted power is not spent by use: it is offered again next hand. With nothing drafted
the hand is Classic. Bots hold no powers.

**Pools.** Each chapter's draft offers from its own pool, and the coach introduces each power the
first time a draft shows it:

| Chapter | Pool |
| ------- | ---- |
| Kitchen Table | Blank Tile, Wild Tile |
| The Local | adds Vowel Magnet, Pickpocket |
| The Back Room | adds Tile Lock |
| The High Roller Lounge | Vowel Magnet out; adds Multiplier, High Value Tile |
| The Dealer's Table | the same as The High Roller Lounge |

**Story powers.** Four powers are story mode's alone; a Wild table never deals them. Each is used
in §44's window, at most once a hand, like any other.

- **Pickpocket** names one of the hero's private tiles and one opponent still in the hand. The
  named tile goes to the opponent, and one of the opponent's private tiles, drawn at random (the
  hero cannot see them), comes back in its place. Both tiles move as they are, bonus and all, and
  leave their old owner's draft. Refused for an opponent that has confirmed its word.
- **Tile Lock** names one face-up community tile and one opponent still in the hand: that opponent
  cannot build from the tile for the rest of the hand, and it leaves its draft. Every other seat
  keeps it. Not before the flop; refused for an opponent that has confirmed its word.
- **Multiplier** names one of the hero's private tiles without a bonus: it scores double (a Double
  Letter, §9) this hand.
- **High Value Tile** is a swap (§44) whose new letter is X, Z or Q, each equally likely.

**The final chapter** has no hands to draft from: the player picks up to 2 different powers from
its pool before the boss hand.

**Bosses.** A boss is a bot with a play style and one visible **tell**. It holds no powers and sees
no more than any bot does: its own tiles and the public table. Its tell reads those same tiles,
which is what makes it a tell. The numbers are config (`packages/game-rules/src/bot/boss.ts`).

| Boss | Play style | Tell |
| ---- | ---------- | ---- |
| The Professor | Plays the longest word it can. Never folds until his pressure bar is full, then folds anything short of a strong hand. | The pressure bar: one step each time the most an opponent has put in doubles, full at 16 big blinds. |
| Vowel Vinny | Plays the most vowel-heavy word. Bets small and rarely raises. | The vowel jar: how many of his two tiles are vowels. |
| The Hustler | Raises the hand open on his first pre-flop action, every hand. | The chip stack: neat on a premium hand, messier as his hand gets weaker. |
| Lady Q | Plays the word with the most Q, Z, J and X. Bets harder while she holds one. | Her tiles glint while she holds a Q, Z, J or X. |
| The Dealer | Plays one of the four styles each hand, drawn from the hand's seed. | That style's tell. |

At the start of a boss hand the coach points at the tell. After 2 boss losses in a row, the coach
gives a hint about how to read it.
