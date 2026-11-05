# Word Poker English

`en_US-large.json` is generated from [ESDB (formerly SCOWL)](https://github.com/en-wl/wordlist),
revision `1e5b7d3a72f47a71da5d28686c1dd4b397178485`. The legacy filename and dictionary
id remain stable for stored hands and wire compatibility; the displayed label is
**Word Poker English (ESDB 60)** and the source SHA-256 pins the vocabulary.
Replay verification rejects hands recorded with the previous dictionary fingerprint;
this change does not bundle the old vocabulary. Deploy clients and servers together
so newly recorded hands use the same artifact for verification.

Policy: size 60, American spelling, variant level 1, without abbreviations or special
categories (Roman numerals and hacker vocabulary). Preparation accepts only entirely
lowercase ASCII entries of two or more letters, then uppercases, deduplicates, and
sorts. Capitalized names/acronyms, punctuation, and accented spellings are excluded.
Words longer than seven letters remain in the dictionary; the engine enforces the
submission length separately. This is a general English vocabulary, not a tournament
Scrabble list; rare game words such as `AA` and `QI` are absent at this size.

To reproduce (Python 3, SQLite, make, and the workspace dependencies are required):

```bash
git clone https://github.com/en-wl/wordlist.git /tmp/word-poker-esdb
git -C /tmp/word-poker-esdb checkout 1e5b7d3a72f47a71da5d28686c1dd4b397178485
make -C /tmp/word-poker-esdb
cd /tmp/word-poker-esdb
./scowl word-list 60 A 1 --wo-poses=abbr --categories= > /tmp/esdb-en-us-60.txt
```

Then, from the Word Poker repository root:

```bash
pnpm --filter @wordpoker/game-rules dictionary:prepare /tmp/esdb-en-us-60.txt
pnpm --filter @wordpoker/game-rules test
```

The prepared dictionary has 78,656 entries. The raw export has 108,339 lines and SHA-256
`b50d11e4b493376f3e4f562c5c420560e0735af8e4fb1b20badd86c6c0b43e89`.
The artifact records these values and includes the ESDB copyright notice, also kept
in [ESDB-COPYRIGHT.txt](ESDB-COPYRIGHT.txt). Keep that notice with distributed copies.
When updating the source or policy, review the vocabulary changes and update the
pinned values in `test/dictionary.test.ts`.
