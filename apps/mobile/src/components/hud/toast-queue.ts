/**
 * toast-queue.ts — pure policy for the in-hand action toasts.
 *
 * Toasts report what just happened (a validation error, a turn prompt, a result),
 * so the queue is deliberately lossy: a newer message outranks an older one
 * rather than stacking behind it, and a repeated key replaces its toast instead of
 * showing twice. Everything here is pure so the policy can be table-tested without
 * mounting anything or waiting on real timers.
 */

export type ToastSeverity = "info" | "success" | "warning" | "error";

export interface ToastInput {
  /** Stable identity. A repeat of a live key replaces that toast rather than stacking. */
  key: string;
  severity: ToastSeverity;
  message: string;
  /** Overrides the severity default. `0` or `Infinity` waits for a dismissal. */
  ttlMs?: number;
}

export interface Toast {
  key: string;
  severity: ToastSeverity;
  message: string;
  /** When the toast entered the queue. Drives the newest-first order. */
  enqueuedAtMs: number;
  /** When it leaves on its own, or `null` when it waits for a dismissal. */
  expiresAtMs: number | null;
  /** Bumped on every re-raise, so a consumer can restart its entrance animation. */
  revision: number;
}

export interface ToastQueueState {
  toasts: readonly Toast[];
}

export const EMPTY_TOAST_QUEUE: ToastQueueState = { toasts: [] };

/** How many toasts are ever on screen at once. Older ones fall off the back. */
export const TOAST_MAX_VISIBLE = 3;

/**
 * Hold time by severity. `error` persists: it reports something the player has to
 * act on, and a message that vanishes before it is read is a bug report waiting to
 * happen. `ttlMs` on the input overrides this.
 */
export const TOAST_TTL_MS: Record<ToastSeverity, number> = {
  info: 2400,
  success: 3000,
  warning: 3600,
  error: 0,
};

/** `0` and `Infinity` both mean "until dismissed". */
function resolveExpiry(input: ToastInput, nowMs: number): number | null {
  const ttl = input.ttlMs ?? TOAST_TTL_MS[input.severity];
  return ttl > 0 && Number.isFinite(ttl) ? nowMs + ttl : null;
}

/**
 * Add a toast, or replace the live toast with the same key. The new toast sits at
 * the front and its hold restarts from `nowMs`; the displaced tail falls off once
 * the queue is full.
 */
export function pushToast(
  state: ToastQueueState,
  input: ToastInput,
  nowMs: number,
): ToastQueueState {
  const replaced = state.toasts.find((toast) => toast.key === input.key);
  const toast: Toast = {
    key: input.key,
    severity: input.severity,
    message: input.message,
    enqueuedAtMs: nowMs,
    expiresAtMs: resolveExpiry(input, nowMs),
    revision: (replaced?.revision ?? 0) + 1,
  };
  return {
    toasts: [toast, ...state.toasts.filter((live) => live.key !== input.key)].slice(
      0,
      TOAST_MAX_VISIBLE,
    ),
  };
}

/**
 * Drop every toast whose hold has run out. Persistent toasts survive. The same
 * state object is returned when nothing changed, so a caller can use it as a
 * re-render guard.
 */
export function expireToasts(state: ToastQueueState, nowMs: number): ToastQueueState {
  const toasts = state.toasts.filter(
    (toast) => toast.expiresAtMs === null || toast.expiresAtMs > nowMs,
  );
  return toasts.length === state.toasts.length ? state : { toasts };
}

/** Drop one toast by key, whatever its hold time. */
export function dismissToast(state: ToastQueueState, key: string): ToastQueueState {
  const toasts = state.toasts.filter((toast) => toast.key !== key);
  return toasts.length === state.toasts.length ? state : { toasts };
}

/**
 * The instant the queue next needs attention, or `null` when every live toast is
 * persistent — the caller uses it to schedule exactly one timer instead of polling.
 */
export function nextExpiryMs(state: ToastQueueState): number | null {
  let soonest: number | null = null;
  for (const toast of state.toasts) {
    if (toast.expiresAtMs === null) continue;
    if (soonest === null || toast.expiresAtMs < soonest) soonest = toast.expiresAtMs;
  }
  return soonest;
}
