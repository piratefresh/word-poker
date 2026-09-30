/**
 * power-draw.ts — §44's Power Draw (`docs/rules/power-ups.md`): the window at the start of the
 * pre-flop where every seat in the hand is offered 3 powers and keeps 1.
 *
 * Like §19's word window (`word-window.ts`), the draw owns its own rules and nothing else: one
 * clock for every seat, one slot per drawing seat, and a one-way pick — a slot is offered, then
 * it keeps a power, never back. It decides *when* it closes: the moment every slot has picked,
 * or when the clock runs out, in which case a slot keeps its first offer. What a close costs —
 * arming pre-flop's first betting turn — belongs to the hand that opened it (`offline.ts`).
 *
 * The offers come from a stream of their own, `mixSeed(dealSeed, seat, "offer")`, never from the
 * deal's generator, so a hand deals the same tiles with power-ups on or off. Nothing here reads a
 * clock: the caller passes `nowMs`.
 */

import {
  POWER_DRAW_MS,
  POWER_DRAW_OFFER_COUNT,
  POWER_UP_IDS,
  POWER_UPS,
  type PlayerId,
  type PowerUpId,
} from "@wordpoker/contracts";

import { OfflineActionError, PowerRejectionError } from "./errors";
import { createRng, mixSeed } from "./rng";
import { weightedSampleWithoutReplacement } from "./sample";

/** One seat's place in the draw: what it was offered, and what it kept. */
export interface DrawSlot {
  /** The seat's index in the hand's `seats`. */
  readonly seat: number;
  readonly playerId: PlayerId;
  /** In the order drawn; the first is what the seat keeps if the clock runs out. */
  readonly offers: readonly PowerUpId[];
  /** The power the seat kept; `null` until it picks, or until the clock picks for it. */
  readonly picked: PowerUpId | null;
}

/**
 * §44's Power Draw. The closed draw stays in the hand's state: it is the record of what each seat
 * was offered and kept.
 */
export interface PowerDraw {
  readonly status: "open" | "closed";
  /** When the shared clock runs out, on the caller's timeline. */
  readonly endsAtMs: number;
  /** One slot per drawing seat, in seat order. */
  readonly slots: readonly DrawSlot[];
}

/** A seat the draw offers powers to, as the hand names it. */
export interface DrawSeat {
  readonly seat: number;
  readonly playerId: PlayerId;
}

/**
 * The power a seat holds for this hand (§44, The Held Power): kept at the draw, used at most
 * once, and gone when the hand ends.
 */
export interface HeldPower {
  readonly id: PowerUpId;
  readonly used: boolean;
}

/**
 * The powers one seat is offered: `POWER_DRAW_OFFER_COUNT` of the catalog, drawn by weight
 * without replacement from the seat's own stream. The same deal seed and seat always give the
 * same offers.
 *
 * @param dealSeed The seed the hand was dealt from.
 * @param seat The seat's index at the table.
 */
export function drawOffers(dealSeed: number, seat: number): readonly PowerUpId[] {
  return weightedSampleWithoutReplacement(
    POWER_UP_IDS,
    (id) => POWER_UPS[id].weight,
    POWER_DRAW_OFFER_COUNT,
    createRng(mixSeed(dealSeed, seat, "offer")),
  );
}

/**
 * Opens the Power Draw: one slot per seat handed in, each with its offers, on one clock that
 * starts at `nowMs`. The caller decides who draws — a seat sitting the hand out does not, and in
 * v1 neither does a CPU seat.
 */
export function openDraw(drawing: readonly DrawSeat[], dealSeed: number, nowMs: number): PowerDraw {
  return {
    status: "open",
    endsAtMs: nowMs + POWER_DRAW_MS,
    slots: drawing.map(({ seat, playerId }) => ({
      seat,
      playerId,
      offers: drawOffers(dealSeed, seat),
      picked: null,
    })),
  };
}

/**
 * One seat keeps one of its offers. The draw closes the moment every slot has picked — the clock
 * is a deadline, not a stay.
 *
 * @throws {PowerRejectionError} `draw-closed` when the draw has closed or its clock has run out,
 *   `not-in-draw` for a seat with no slot, `already-picked` for a second pick, and `not-offered`
 *   for a power the seat was not offered.
 */
export function pickPower(
  draw: PowerDraw,
  playerId: PlayerId,
  powerUpId: PowerUpId,
  nowMs: number,
): PowerDraw {
  if (draw.status === "closed" || nowMs >= draw.endsAtMs) {
    throw new PowerRejectionError("draw-closed");
  }

  const index = draw.slots.findIndex((slot) => slot.playerId === playerId);
  const slot = draw.slots[index];
  if (slot === undefined) throw new PowerRejectionError("not-in-draw");
  if (slot.picked !== null) throw new PowerRejectionError("already-picked");
  if (!slot.offers.includes(powerUpId)) throw new PowerRejectionError("not-offered");

  const slots = [...draw.slots];
  slots[index] = { ...slot, picked: powerUpId };

  const status = slots.every((candidate) => candidate.picked !== null) ? "closed" : "open";
  return { ...draw, status, slots };
}

/**
 * The draw's clock running out: every seat that has not picked keeps its **first** offer — a
 * fixed rule rather than another roll. Only legal at or after the deadline.
 *
 * @throws {PowerRejectionError} `draw-closed` when the draw has already closed.
 * @throws {OfflineActionError} Before the deadline, while the seats may still pick.
 */
export function timeoutDraw(draw: PowerDraw, nowMs: number): PowerDraw {
  if (draw.status === "closed") throw new PowerRejectionError("draw-closed");
  if (nowMs < draw.endsAtMs) {
    throw new OfflineActionError(
      `the Power Draw still has ${draw.endsAtMs - nowMs}ms to run, so the seats may still pick`,
    );
  }

  return {
    ...draw,
    status: "closed",
    slots: draw.slots.map((slot) => ({ ...slot, picked: slot.picked ?? slot.offers[0] ?? null })),
  };
}

/** What each seat holds once it has picked: its kept power, not yet used. */
export function heldPowers(draw: PowerDraw): Readonly<Record<PlayerId, HeldPower>> {
  const held: Record<PlayerId, HeldPower> = {};
  for (const slot of draw.slots) {
    if (slot.picked !== null) held[slot.playerId] = { id: slot.picked, used: false };
  }
  return held;
}
