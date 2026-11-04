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

**The power draft.** After each hand (not the bonus or the boss), the run offers up to 3 powers
from the chapter's pool that it does not already hold, drawn evenly. The player keeps one or
skips. The run holds up to 3 drafted powers for the whole chapter; at 3, a new pick replaces a held
one. The offers wait in the save until they are picked or skipped.

**Powers in a hand.** A hand opens on §44's Power Draw, but only the hero draws, and it is
offered exactly the drafted powers; it keeps one and uses it at most once that hand, as §44
says. A drafted power is not spent by use: it is offered again next hand. With nothing drafted
the hand is Classic. Bots hold no powers.

**The final chapter** has no hands to draft from: the player picks up to 2 different powers from
its pool before the boss hand.
