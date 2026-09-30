import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  POWER_DRAW_MS,
  POWER_DRAW_OFFER_COUNT,
  POWER_UP_IDS,
  type PowerRejectionReason,
  type PowerUpId,
} from "@wordpoker/contracts";

import { OfflineActionError, PowerRejectionError } from "../src/errors";
import {
  drawOffers,
  heldPowers,
  openDraw,
  pickPower,
  timeoutDraw,
  type DrawSeat,
  type PowerDraw,
} from "../src/power-draw";

/**
 * §44's Power Draw on its own: seats and a clock go in, and nothing else. The offers are read off
 * the draw rather than written down, because they are the seeded stream's to decide — what is
 * pinned here is that the stream is stable and the draw's rules hold whatever it offers.
 */

const NOW = 1_000_000;
const SEED = 20260919;
const ENDS_AT = NOW + POWER_DRAW_MS;

const SEATS: readonly DrawSeat[] = [
  { seat: 0, playerId: "hero" },
  { seat: 1, playerId: "ellis" },
];

function offersOf(draw: PowerDraw, playerId: string): readonly PowerUpId[] {
  const slot = draw.slots.find((candidate) => candidate.playerId === playerId);
  assert.ok(slot, `${playerId} has a slot`);
  return slot.offers;
}

function refusal(reason: PowerRejectionReason): (error: unknown) => boolean {
  return (error) => error instanceof PowerRejectionError && error.reason === reason;
}

describe("drawOffers", () => {
  it("offers distinct catalog powers, as many as the draw deals", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const offers = drawOffers(seed, seed % 6);
      assert.equal(offers.length, POWER_DRAW_OFFER_COUNT);
      assert.equal(new Set(offers).size, offers.length, "never the same power twice");
      for (const id of offers) assert.ok(POWER_UP_IDS.includes(id));
    }
  });

  it("offers the same powers for the same seed and seat", () => {
    assert.deepEqual(drawOffers(SEED, 2), drawOffers(SEED, 2));
  });

  it("orders the offers differently across seats and across hands", () => {
    // The v1 pool is exactly three powers, so every seat is offered all three: what the stream
    // decides is the order, and with it the power a timed-out seat keeps.
    const bySeat = new Set([0, 1, 2, 3, 4, 5].map((seat) => drawOffers(SEED, seat).join()));
    const byHand = new Set([0, 1, 2, 3, 4, 5].map((hand) => drawOffers(SEED + hand, 0).join()));
    assert.ok(bySeat.size > 1, "seats at one hand are not all offered the same order");
    assert.ok(byHand.size > 1, "one seat is not offered the same order every hand");
  });
});

describe("the Power Draw", () => {
  it("opens one slot per drawing seat on one shared clock", () => {
    const draw = openDraw(SEATS, SEED, NOW);

    assert.equal(draw.status, "open");
    assert.equal(draw.endsAtMs, ENDS_AT);
    assert.deepEqual(
      draw.slots.map(({ seat, playerId, picked }) => ({ seat, playerId, picked })),
      [
        { seat: 0, playerId: "hero", picked: null },
        { seat: 1, playerId: "ellis", picked: null },
      ],
    );
    assert.deepEqual(offersOf(draw, "ellis"), drawOffers(SEED, 1));
  });

  it("stays open until every seat has picked, then closes early", () => {
    const draw = openDraw(SEATS, SEED, NOW);
    const heroPick = offersOf(draw, "hero")[1];
    const ellisPick = offersOf(draw, "ellis")[2];
    assert.ok(heroPick && ellisPick);

    const once = pickPower(draw, "hero", heroPick, NOW + 1);
    assert.equal(once.status, "open");

    const twice = pickPower(once, "ellis", ellisPick, NOW + 2);
    assert.equal(twice.status, "closed");
    assert.deepEqual(heldPowers(twice), {
      hero: { id: heroPick, used: false },
      ellis: { id: ellisPick, used: false },
    });
  });

  it("gives a seat that never picked its first offer when the clock runs out", () => {
    const draw = openDraw(SEATS, SEED, NOW);
    const heroPick = offersOf(draw, "hero")[2];
    assert.ok(heroPick);

    const closed = timeoutDraw(pickPower(draw, "hero", heroPick, NOW + 1), ENDS_AT);

    assert.equal(closed.status, "closed");
    assert.deepEqual(heldPowers(closed), {
      hero: { id: heroPick, used: false },
      ellis: { id: offersOf(draw, "ellis")[0], used: false },
    });
  });

  it("refuses a second pick", () => {
    const draw = openDraw(SEATS, SEED, NOW);
    const [first, second] = offersOf(draw, "hero");
    assert.ok(first && second);
    const picked = pickPower(draw, "hero", first, NOW + 1);

    assert.throws(() => pickPower(picked, "hero", second, NOW + 2), refusal("already-picked"));
  });

  it("refuses a power the seat was not offered, and a seat with no slot", () => {
    const draw = openDraw(SEATS, SEED, NOW);
    const offered = { ...draw, slots: draw.slots.map((slot) => ({ ...slot, offers: ["mulligan" as const] })) };

    assert.throws(() => pickPower(offered, "hero", "random_wild", NOW + 1), refusal("not-offered"));
    assert.throws(() => pickPower(draw, "jay", "mulligan", NOW + 1), refusal("not-in-draw"));
  });

  it("refuses a pick at the deadline or after the draw has closed", () => {
    const draw = openDraw(SEATS, SEED, NOW);
    const first = offersOf(draw, "hero")[0];
    assert.ok(first);

    assert.throws(() => pickPower(draw, "hero", first, ENDS_AT), refusal("draw-closed"));
    const closed = timeoutDraw(draw, ENDS_AT);
    assert.throws(() => pickPower(closed, "hero", first, NOW + 1), refusal("draw-closed"));
    assert.throws(() => timeoutDraw(closed, ENDS_AT), refusal("draw-closed"));
  });

  it("refuses to time out while the clock is still running", () => {
    const draw = openDraw(SEATS, SEED, NOW);
    assert.throws(() => timeoutDraw(draw, ENDS_AT - 1), OfflineActionError);
  });
});
