/**
 * settlement-recorder.ts — STO-455: a settled hand is durable before the room moves on.
 *
 * The observer hands every settlement over here, the moment the settling action was accepted:
 * the record is built synchronously (no async gap where a crash could take the accepted log),
 * then written. While a write is in flight or failing, `pending` stays true, and the room's
 * advancement points — the next deal, the return to the waiting room that clears the engine,
 * the room's own disposal — hold until `idle()` resolves.
 *
 * A write that fails is retried, on the room's tick, with capped backoff: the hand stays
 * undurable and the room stays put rather than playing on over a settlement history has lost.
 * A record that cannot even be built or validated is a bug, not an outage: it blocks the room
 * the same way, logged once, because writing a malformed record is worse than holding.
 *
 * `"duplicate"` is a success: the write committed but its answer never came back, and the
 * retry found the identical payload already stored — exactly one record exists either way.
 */

import { isHandRecord, type HandRecord } from "@wordpoker/contracts";

import type { SettledHand } from "../rooms/AuthoritativeGame.js";
import type { HistoryWriter } from "./history-service.js";

export interface SettlementRecorderOptions {
  /** Builds the record for one settled hand; runs synchronously inside `observe`. */
  readonly build: (settled: SettledHand) => HandRecord;
  /** The durable write. `null` when history is not configured: nothing is recorded or held. */
  readonly write: HistoryWriter | null;
  /** The room's clock, for retry backoff. */
  readonly now: () => number;
  /** Failure logging; the room's `console.error` by default. */
  readonly log?: (message: string, error?: unknown) => void;
  /** How long to wait before retry `attempt` (1-based); capped exponential by default. */
  readonly retryDelayMs?: (attempt: number) => number;
}

export class SettlementRecorder {
  private readonly queue: HandRecord[] = [];
  private writeInFlight = false;
  /** The record a failed write is still owed, when the last attempt threw. */
  private failing: HandRecord | null = null;
  /** A record that can never be written (a build/validation bug): held, never retried. */
  private unwritable = false;
  private attempt = 0;
  private retryAtMs = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(private readonly options: SettlementRecorderOptions) {}

  /** Whether a settlement is undurable: the room must not advance past it. */
  get pending(): boolean {
    return this.unwritable || this.failing !== null || this.writeInFlight || this.queue.length > 0;
  }

  /** Resolves once every captured settlement is durable; a room holding a settlement stays held. */
  idle(): Promise<void> {
    if (!this.pending) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** The settlement observer's target: capture now, durably, before the room can move on. */
  observe(settled: SettledHand): void {
    if (this.options.write === null) {
      // History is not configured (dev without a database): the room said so at creation.
      return;
    }

    let record: HandRecord;
    try {
      record = this.options.build(settled);
    } catch (error) {
      this.holdUnwritable("a settled hand could not be turned into a record", error);
      return;
    }
    if (!isHandRecord(record)) {
      this.holdUnwritable("a settled hand produced a malformed record");
      return;
    }

    this.queue.push(record);
    // No await before staging: a kill after publication must leave a recoverable record.
    try {
      this.options.write.stageHand?.(record);
    } catch (error) {
      this.failed(record, error);
      return;
    }
    if (this.failing === null) void this.drain();
  }

  /** The room's tick: retry a failed write once its backoff has elapsed. */
  tick(): void {
    if (this.failing === null || this.writeInFlight) return;
    if (this.options.now() < this.retryAtMs) return;

    void this.drain();
  }

  /** A settlement the room can never make durable: held forever, loudly, rather than dropped. */
  private holdUnwritable(reason: string, error?: unknown): void {
    this.unwritable = true;
    this.options.log?.(`history: ${reason}; the room holds the settlement and will not advance`, error);
  }

  /** Writes queued records one at a time; a failure schedules the next attempt on the tick. */
  private async drain(): Promise<void> {
    const writer = this.options.write;
    if (writer === null || this.writeInFlight) return;

    const record = this.queue[0];
    if (record === undefined) return;

    this.writeInFlight = true;
    try {
      if (this.failing === record) writer.stageHand?.(record);
      await writer.recordHand(record);
      this.queue.shift();
      this.attempt = 0;
      this.failing = null;
    } catch (error) {
      this.failed(record, error);
    } finally {
      this.writeInFlight = false;
    }

    if (this.queue.length > 0 && this.failing === null) {
      await this.drain();
      return;
    }
    if (!this.pending) this.resolveWaiters();
  }

  private failed(record: HandRecord, error: unknown): void {
    this.attempt += 1;
    this.failing = record;
    this.retryAtMs = this.options.now() + this.retryDelay(this.attempt);
    this.options.log?.(
      `history: recording hand ${record.handNo} failed (attempt ${this.attempt}); will retry`, error,
    );
  }

  private retryDelay(attempt: number): number {
    return this.options.retryDelayMs?.(attempt) ?? Math.min(500 * 2 ** (attempt - 1), 10_000);
  }

  private resolveWaiters(): void {
    const waiters = [...this.waiters];
    this.waiters.length = 0;
    for (const resolve of waiters) resolve();
  }
}
