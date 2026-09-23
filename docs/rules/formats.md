# Formats: Rooms, Tournaments & Cash Games

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 40. Room Variations

Rooms may vary the rules along the lines below. Each is a table setting, so the platform can
A/B test formats to find the most popular way to play.

| Setting | Options | Default |
| ------- | ------- | ------- |
| Word window | 30 seconds or 60 seconds | 60 seconds |
| Betting structure | No Limit, Pot Limit, Fixed Limit | No Limit |
| Choice-tile frequency | 0–1 or 2–3 per hand | 2–3 (§10) |
| Bonus structure | Variations on the Full Rack Bonus and multiplier chances (§7, §9) | The rules as written |
| Word submission on timeout | Confirm before the clock runs out, or auto-submit the draft | Confirm (§19) |

## Betting Structures

- **No Limit**: a bet or raise may be any amount from the minimum (§22) up to the player's
  whole Table Stack.
- **Pot Limit**: a bet or raise may be at most the size of the pot after the player's call.
- **Fixed Limit**: bets and raises come in fixed amounts — one big blind pre-flop and on the
  flop, two big blinds on the turn and river — with at most four bets per betting round.

The room's settings are shown in the table browser and before joining.

---

# 41. Tournaments

## Types

| Type | Players | Length |
| ---- | ------: | ------ |
| Sit & Go (SNG) | 4–6 | 15–30 minutes |
| Multi-Table Tournament (MTT) | 50–500 | 1–3 hours |

## Buy-In Tiers

| Tier | Buy-in |
| ---- | -----: |
| Freeroll | $0 |
| Micro | $1–$5 |
| Low | $10–$50 |
| Mid | $100–$500 |
| High Roller | $1K+ |

The top of a tier is its Buy-In Cap (§2): the most a player can put into that tournament,
across re-entries and top-ups. To play for more, the player enters a higher tier.

## Open Questions

- Whether tournament buy-ins are real money or Coins. The product spec prices them in dollars.
- The blind schedule: how often blinds rise, and by how much.
- The payout structure: how many places are paid, and what share each gets.
- How MTT tables are balanced and merged as players are knocked out.

---

# 42. Cash Games

## Stakes

Cash-game stakes are named by their blinds:

| Stakes | Blinds (SB / BB) |
| ------ | ---------------: |
| Micro | $0.25 / $0.50 |
| Low | $1 / $2 |
| Mid | $5 / $10 |
| High | $25 / $50 and up |

A cash-game table is a stake tier (§2): it has a buy-in range, its top is the Buy-In Cap,
and a player cannot bring more than the cap, even across re-buys and top-ups (§27).

## Open Questions

- Whether cash games are real money or Coins. The Coin tables of §2 are today's cash games.
- The buy-in range for each dollar stake. §2 derives blinds from the cap (1% / 2%), which
  puts the cap at 50 big blinds; the product spec does not give the ranges.
