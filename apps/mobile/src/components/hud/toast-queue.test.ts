import {
  dismissToast,
  EMPTY_TOAST_QUEUE,
  expireToasts,
  nextExpiryMs,
  pushToast,
  TOAST_MAX_VISIBLE,
  TOAST_TTL_MS,
  type ToastInput,
  type ToastQueueState,
} from "./toast-queue";

const T0 = 1_700_000_000_000;

function input(key: string, overrides: Partial<ToastInput> = {}): ToastInput {
  return { key, severity: "info", message: `${key} happened`, ...overrides };
}

function push(state: ToastQueueState, toast: ToastInput, nowMs = T0): ToastQueueState {
  return pushToast(state, toast, nowMs);
}

describe("pushToast", () => {
  test("puts the newest toast first", () => {
    const state = push(push(EMPTY_TOAST_QUEUE, input("a")), input("b"));
    expect(state.toasts.map((toast) => toast.key)).toEqual(["b", "a"]);
  });

  test("drop the oldest toast once the queue is full", () => {
    let state = EMPTY_TOAST_QUEUE;
    for (const key of ["a", "b", "c", "d"]) state = push(state, input(key));

    expect(state.toasts).toHaveLength(TOAST_MAX_VISIBLE);
    expect(state.toasts.map((toast) => toast.key)).toEqual(["d", "c", "b"]);
  });

  test("replaces a live toast with the same key instead of stacking a duplicate", () => {
    const first = push(EMPTY_TOAST_QUEUE, input("turn", { message: "Your turn" }));
    const second = push(first, input("turn", { message: "Your turn again" }), T0 + 500);

    expect(second.toasts).toHaveLength(1);
    expect(second.toasts[0]).toMatchObject({
      message: "Your turn again",
      enqueuedAtMs: T0 + 500,
      // The revision is what lets a consumer replay the entrance animation for a
      // message it has already shown.
      revision: 2,
    });
  });

  test("restarts the hold when a toast is re-raised", () => {
    const first = push(EMPTY_TOAST_QUEUE, input("call", { severity: "warning", ttlMs: 1000 }));
    const second = push(first, input("call", { severity: "warning", ttlMs: 1000 }), T0 + 900);

    expect(first.toasts[0].expiresAtMs).toBe(T0 + 1000);
    expect(second.toasts[0].expiresAtMs).toBe(T0 + 1900);
  });

  test.each([
    // A per-severity default, an explicit override, and the two persistent forms.
    [input("a", { severity: "info" }), TOAST_TTL_MS.info],
    [input("a", { severity: "success" }), TOAST_TTL_MS.success],
    [input("a", { severity: "warning" }), TOAST_TTL_MS.warning],
    [input("a", { severity: "info", ttlMs: 500 }), 500],
    [input("a", { severity: "info", ttlMs: 0 }), null],
    [input("a", { severity: "info", ttlMs: Number.POSITIVE_INFINITY }), null],
  ])("resolves the hold for %p", (toast, ttl) => {
    const [live] = push(EMPTY_TOAST_QUEUE, toast).toasts;
    expect(live.expiresAtMs).toBe(ttl === null ? null : T0 + ttl);
  });

  test("keeps an error until it is dismissed", () => {
    const [live] = push(EMPTY_TOAST_QUEUE, input("invalid", { severity: "error" })).toasts;
    expect(live.expiresAtMs).toBeNull();
  });
});

describe("expireToasts", () => {
  test("drops a toast at its expiry instant and leaves the rest", () => {
    const state = push(
      push(EMPTY_TOAST_QUEUE, input("short", { ttlMs: 1000 })),
      input("long", { ttlMs: 5000 }),
    );

    const midway = expireToasts(state, T0 + 999);
    expect(midway.toasts.map((toast) => toast.key)).toEqual(["long", "short"]);

    const after = expireToasts(midway, T0 + 1000);
    expect(after.toasts.map((toast) => toast.key)).toEqual(["long"]);
  });

  test("never expires a persistent toast", () => {
    const state = push(EMPTY_TOAST_QUEUE, input("invalid", { severity: "error" }));
    expect(expireToasts(state, T0 + 60_000)).toBe(state);
  });

  test("returns the same state when nothing changed, so a caller can skip a render", () => {
    const state = push(EMPTY_TOAST_QUEUE, input("a", { ttlMs: 1000 }));
    expect(expireToasts(state, T0)).toBe(state);
    expect(expireToasts(EMPTY_TOAST_QUEUE, T0)).toBe(EMPTY_TOAST_QUEUE);
  });
});

describe("dismissToast", () => {
  test("removes the named toast and keeps the others", () => {
    const state = push(push(EMPTY_TOAST_QUEUE, input("a")), input("b"));
    expect(dismissToast(state, "a").toasts.map((toast) => toast.key)).toEqual(["b"]);
  });

  test("is a no-op for an unknown key", () => {
    const state = push(EMPTY_TOAST_QUEUE, input("a"));
    expect(dismissToast(state, "missing")).toBe(state);
  });
});

describe("nextExpiryMs", () => {
  test("reports the soonest hold and ignores persistent toasts", () => {
    const state = push(
      push(
        push(EMPTY_TOAST_QUEUE, input("invalid", { severity: "error" })),
        input("slow", { ttlMs: 5000 }),
      ),
      input("quick", { ttlMs: 1000 }),
    );
    expect(nextExpiryMs(state)).toBe(T0 + 1000);
  });

  test("is null when there is nothing to schedule", () => {
    expect(nextExpiryMs(EMPTY_TOAST_QUEUE)).toBeNull();
    expect(
      nextExpiryMs(push(EMPTY_TOAST_QUEUE, input("invalid", { severity: "error" }))),
    ).toBeNull();
  });
});
