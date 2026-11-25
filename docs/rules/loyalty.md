# Loyalty: VIP Points & Tiers

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 47. VIP Points and Lifetime Tiers

Players earn VIP Points for playing longer, building bigger words and betting hard, and for buying
coins. Points never reset and a tier is never lost. Tiers pay in ordinary Wallet coins. The tables
are config in `packages/game-rules/src/vip.ts`; the product spec is the PDF on STO-1170.

## 47.1 Earning

Every award is judged on the server from a replayed hand, never from a client's report: the online
room replays each settled hand, and an offline hand earns when its history record is uploaded and
verified (`POST /api/history/hands`). Each award carries a token, so a retry adds nothing twice.

**Play longer** (play points, capped at **600 per UTC day**):

| Action | Points |
| -- | -- |
| Complete a hand (stay to showdown, or fold after the river) | 10 |
| Every 10th completed hand at one table | +50 |
| Finish a match: leave an online table after 10+ completed hands, or reach the end of an offline game | 40 |
| Login streak, days 2–7 | 20 × the streak day (+40 … +140), not capped |

**Bigger words** (the word at showdown, not capped): 4 letters 2, 5 letters 5, 6 letters 10,
7 letters 20, 8+ letters 40; +15 for using every hole and community tile; +10 for the best word at
the table.

**Bet hard** (online tables, hands that reach showdown, not capped daily): 1 point per 10 coins
committed to the pot, +20 for winning a pot all-in, at most 50 a hand. Offline hands never earn
betting points.

**Purchases**: 100 coins → 100, 1,000 coins → 750, 10,000 coins → 2,500. Pro subscription points
wait for the subscription itself.

The tier multiplier scales play, word and bet points before the play cap is applied; streak and
purchase points are never multiplied.

## 47.2 Tiers

| Tier | Points | Tier-up coins | Daily bonus | Purchase bonus | Multiplier |
| -- | -- | -- | -- | -- | -- |
| Rookie | 0 | — | 25 | 0% | 1.0× |
| Speller | 1,500 | 100 | 40 | 5% | 1.05× |
| Wordsmith | 7,500 | 300 | 60 | 10% | 1.1× |
| Grinder | 30,000 | 750 | 100 | 15% | 1.2× |
| Card Shark | 90,000 | 2,000 | 150 | 20% | 1.3× |
| High Roller | 225,000 | 5,000 | 250 | 30% | 1.4× |
| Royal Flush | 600,000 | 15,000 | 400 | 40% | 1.5× |

- Crossing into a tier pays its coins once (`vip_tier`, ref `tier-N`); a jump across several pays each.
- The daily bonus is paid on top of the login streak's coins, once per UTC day (`vip_daily`).
- A coin-pack purchase pays the buyer's tier bonus once per RevenueCat event (`vip_purchase_bonus`).

## 47.3 Decisions that differ from the spec

- **The day resets at 00:00 UTC**, not local midnight, matching the streak, daily bonus and ad cap.
- **Offline hands earn**, from the verified history upload rather than from the client.
- Perks (gold name tag, free Swap, card back and felt, VIP tournament, priority support) and Pro
  subscription points are later tickets.
