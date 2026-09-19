import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";

import { HudToasts, useToastQueue, type ToastQueue } from "./hud-toasts";
import {
  TOAST_MAX_VISIBLE,
  TOAST_TTL_MS,
  type Toast,
  type ToastInput,
  type ToastSeverity,
} from "./toast-queue";

const T0 = 1_700_000_000_000;

let nowMs = T0;
/** Injected clock, so the queue reads the same timeline the fake timers advance. */
const now = () => nowMs;

let queue: ToastQueue | null = null;

/** Published from an effect, so the test's hold on the live queue is not a render side effect. */
const capture = (live: ToastQueue) => {
  queue = live;
};

function Harness({ reduceMotion }: { reduceMotion?: boolean }) {
  const live = useToastQueue({ now });
  useEffect(() => capture(live));
  return (
    <HudToasts
      onDismiss={live.dismiss}
      reduceMotion={reduceMotion}
      toasts={live.toasts}
    />
  );
}

/**
 * Every step is an *async* act: under React 19 a state update raised from inside a
 * synchronous act is applied but not flushed to the query tree.
 */
async function step(mutate: () => void): Promise<void> {
  await act(async () => {
    mutate();
  });
}

async function push(input: ToastInput): Promise<void> {
  const live = queue;
  if (!live) throw new Error("Render <Harness /> before pushing a toast.");
  await step(() => live.push(input));
}

async function advance(ms: number): Promise<void> {
  nowMs += ms;
  await step(() => jest.advanceTimersByTime(ms));
}

async function press(label: string): Promise<void> {
  await step(() => fireEvent.press(screen.getByLabelText(label)));
}

function toast(key: string): Toast {
  return {
    key,
    severity: "info",
    message: `${key} happened`,
    enqueuedAtMs: T0,
    expiresAtMs: null,
    revision: 1,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  nowMs = T0;
  queue = null;
});

afterEach(() => {
  jest.useRealTimers();
});

test("holds a toast for its own time and not a millisecond longer", async () => {
  await render(<Harness />);
  await push({ key: "chips", severity: "info", message: "Chips changed" });

  await advance(TOAST_TTL_MS.info - 1);
  expect(screen.getByText("Chips changed")).toBeTruthy();

  await advance(1);
  expect(screen.queryByText("Chips changed")).toBeNull();
});

test("keeps an error on screen past every default hold until it is dismissed", async () => {
  await render(<Harness />);
  await push({ key: "buyin", severity: "error", message: "Not enough chips" });

  await advance(TOAST_TTL_MS.warning + TOAST_TTL_MS.success + 60_000);
  expect(screen.getByText("Not enough chips")).toBeTruthy();

  await press("Dismiss message: Not enough chips");
  expect(screen.queryByText("Not enough chips")).toBeNull();
});

test("replaces a repeated key and restarts its hold", async () => {
  await render(<Harness />);
  await push({ key: "turn", severity: "info", message: "Your turn" });
  await advance(TOAST_TTL_MS.info - 100);
  await push({ key: "turn", severity: "info", message: "Still your turn" });

  expect(screen.queryByText("Your turn")).toBeNull();

  await advance(TOAST_TTL_MS.info - 1);
  expect(screen.getByText("Still your turn")).toBeTruthy();

  await advance(1);
  expect(screen.queryByText("Still your turn")).toBeNull();
});

test("renders the newest toast first", async () => {
  await render(<Harness />);
  await push({ key: "one", severity: "info", message: "First" });
  await push({ key: "two", severity: "success", message: "Second" });

  const rendered = screen
    .getAllByLabelText(/^(Information|Success): /)
    .map((node) => node.props.accessibilityLabel);
  expect(rendered).toEqual(["Success: Second", "Information: First"]);
});

test("paints no more than the visible cap, even when handed more", async () => {
  await render(<HudToasts toasts={["a", "b", "c", "d"].map((key) => toast(key))} />);

  expect(screen.getAllByLabelText(/: [a-d] happened$/)).toHaveLength(TOAST_MAX_VISIBLE);
  expect(screen.queryByLabelText("Information: d happened")).toBeNull();
});

test("keeps a ttlMs 0 toast until it is dismissed", async () => {
  await render(<Harness />);
  await push({ key: "settled", severity: "success", message: "Hand settled", ttlMs: 0 });

  await advance(60_000);
  expect(screen.getByText("Hand settled")).toBeTruthy();

  await press("Dismiss message: Hand settled");
  expect(screen.queryByText("Hand settled")).toBeNull();
});

test("offers a dismiss control only for a toast that will not leave on its own", async () => {
  await render(<Harness />);
  await push({ key: "chips", severity: "info", message: "Chips changed" });
  expect(screen.queryByLabelText(/^Dismiss message:/)).toBeNull();

  await push({ key: "buyin", severity: "error", message: "Not enough chips" });
  expect(screen.getAllByLabelText(/^Dismiss message:/)).toHaveLength(1);
});

test("renders nothing at all while the queue is empty", async () => {
  const view = await render(<HudToasts toasts={[]} />);
  expect(view.toJSON()).toBeNull();
});

test("shows the same toasts, for the same time, under reduced motion", async () => {
  await render(<Harness reduceMotion />);
  await push({ key: "chips", severity: "warning", message: "Chips changed" });

  expect(screen.getByLabelText("Warning: Chips changed")).toBeTruthy();

  await advance(TOAST_TTL_MS.warning);
  expect(screen.queryByText("Chips changed")).toBeNull();
});

test("arms one timer, at the soonest deadline, and re-arms it as the queue moves", async () => {
  const arm = jest.spyOn(globalThis, "setTimeout");
  try {
    await render(<Harness />);
    await push({ key: "a", severity: "info", message: "A happened", ttlMs: 3_000 });
    await push({ key: "b", severity: "info", message: "B happened", ttlMs: 1_000 });
    await push({ key: "c", severity: "info", message: "C happened", ttlMs: 2_000 });

    const delays = () => arm.mock.calls.map(([, delay]) => delay);
    // Only live deadlines are ever armed: a timer per toast would also arm c's 2000,
    // and a poll would arm a cadence no toast ever asked for.
    expect(new Set(delays())).toEqual(new Set([3_000, 1_000]));

    // b goes at its own deadline; the one timer moves on to c, which then leaves on
    // its own rather than sitting there.
    await advance(1_000);
    expect(screen.getByText("C happened")).toBeTruthy();

    await advance(1_000);
    expect(screen.queryByText("C happened")).toBeNull();
  } finally {
    arm.mockRestore();
  }
});

test("clears its expiry timer on unmount", async () => {
  const view = await render(<Harness />);

  const arm = jest.spyOn(globalThis, "setTimeout");
  const disarm = jest.spyOn(globalThis, "clearTimeout");
  try {
    await push({ key: "hold", severity: "info", message: "Chips changed", ttlMs: 7_777 });

    // 7777 collides with nothing React or RNTL schedules, so this call is the queue's.
    const armed = arm.mock.calls.findIndex(([, delay]) => delay === 7_777);
    expect(armed).toBeGreaterThanOrEqual(0);
    const handle: unknown = arm.mock.results[armed].value;

    await act(async () => {
      await view.unmount();
    });
    expect(disarm).toHaveBeenCalledWith(handle);
  } finally {
    arm.mockRestore();
    disarm.mockRestore();
  }
});

test.each<[ToastSeverity, string]>([
  ["info", "Information"],
  ["success", "Success"],
  ["warning", "Warning"],
  ["error", "Error"],
])("names the %s severity in the toast's accessible label", async (severity, word) => {
  await render(<Harness />);
  await push({ key: severity, severity, message: "Something happened" });

  expect(screen.getByLabelText(`${word}: Something happened`)).toBeTruthy();
});
