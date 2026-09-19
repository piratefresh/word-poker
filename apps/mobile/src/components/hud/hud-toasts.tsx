/**
 * hud-toasts.tsx — the action toasts, and the hook that owns their queue.
 *
 * The policy (what a toast is, how long it holds, which one falls off the back)
 * lives in `toast-queue.ts`. This file is only the React layer: one timer armed at
 * the soonest deadline, and the panel the player reads. A toast reports something
 * that just happened, so it is brief — except errors, which wait to be dismissed.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";

import {
  border,
  colors,
  duration,
  fonts,
  fontSize,
  layout,
  radius,
  spacing,
} from "@/constants/theme";

import {
  dismissToast,
  EMPTY_TOAST_QUEUE,
  expireToasts,
  nextExpiryMs,
  pushToast,
  TOAST_MAX_VISIBLE,
  type Toast,
  type ToastInput,
  type ToastQueueState,
  type ToastSeverity,
} from "./toast-queue";
import { useReduceMotion } from "./use-reduce-motion";

/** Panel fill from the sketch. The alpha is the point, so no token carries it. */
const PANEL_BG = "rgba(2,10,7,0.94)";

/** The severity word the screen reader gets, ahead of the message itself. */
const SEVERITY_WORD: Record<ToastSeverity, string> = {
  info: "Information",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

/**
 * Leading mark per severity: the second cue beside the strip, for anyone who does
 * not read colour. Plain ASCII — no emoji — and letters rather than shapes so the
 * four stay distinct at 11pt on both platforms.
 */
const SEVERITY_GLYPH = {
  info: "i",
  success: "+",
  warning: "!",
  error: "X",
} as const satisfies Record<ToastSeverity, string>;

const SEVERITY_COLOR: Record<ToastSeverity, string> = {
  info: colors.info,
  success: colors.success,
  warning: colors.warning,
  error: colors.danger,
};

/** Severity first: it is the part that has to land even if the message is long. */
function toastAccessibilityLabel(toast: Toast): string {
  return `${SEVERITY_WORD[toast.severity]}: ${toast.message}`;
}

export interface ToastQueue {
  toasts: readonly Toast[];
  /** Add or replace a toast. A repeat of a live key replaces rather than stacks. */
  push: (input: ToastInput) => void;
  dismiss: (key: string) => void;
}

/**
 * Owns the queue and the single timer that expires it. Pass `now` only in tests;
 * it defaults to the wall clock.
 */
export function useToastQueue(options?: { now?: () => number }): ToastQueue {
  const [state, setState] = useState<ToastQueueState>(EMPTY_TOAST_QUEUE);
  const clock = options?.now;
  // Behind a ref so `push` keeps its identity even when a caller writes `now` as
  // an inline lambda, which is how a component reaches for it.
  const clockRef = useRef(clock);
  const readNow = useCallback(() => clockRef.current?.() ?? Date.now(), []);

  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  const push = useCallback(
    (input: ToastInput) => {
      setState((current) => pushToast(current, input, readNow()));
    },
    [readNow],
  );

  const dismiss = useCallback((key: string) => {
    setState((current) => dismissToast(current, key));
  }, []);

  const expiryMs = nextExpiryMs(state);

  useEffect(() => {
    if (expiryMs === null) return;
    // One timer for the soonest hold, re-armed when that deadline moves. It expires
    // against the deadline it was armed for rather than a fresh reading of the
    // clock: a wake-up a hair early would otherwise leave a toast live with
    // nothing scheduled to try again.
    const timer = setTimeout(() => {
      setState((current) => expireToasts(current, expiryMs));
    }, Math.max(0, expiryMs - readNow()));
    return () => clearTimeout(timer);
  }, [expiryMs, readNow]);

  return { toasts: state.toasts, push, dismiss };
}

export interface HudToastsProps {
  toasts: readonly Toast[];
  onDismiss?: (key: string) => void;
  /** Overrides the OS reduced-motion value; the tests use it. */
  reduceMotion?: boolean;
  testID?: string;
}

export function HudToasts({
  toasts,
  onDismiss,
  reduceMotion,
  testID,
}: HudToastsProps): ReactElement {
  const systemReduce = useReduceMotion();
  const reduce = reduceMotion ?? systemReduce;
  // The queue policy caps its own length, but this prop is public: cap again rather
  // than let a caller paint a stack taller than the table.
  const visible = toasts.slice(0, TOAST_MAX_VISIBLE);
  const newest = visible[0];
  const liveMessage = newest ? toastAccessibilityLabel(newest) : "";

  useEffect(() => {
    // Android announces the live region below when its text changes. iOS has no
    // live region, so it gets one explicit announcement instead.
    if (!liveMessage || Platform.OS !== "ios") return;
    AccessibilityInfo.announceForAccessibility(liveMessage);
  }, [liveMessage]);

  if (visible.length === 0) return <></>;

  return (
    <View pointerEvents="box-none" style={styles.stack} testID={testID}>
      {/*
        The region follows the newest toast and nothing else, so a toast that merely
        sits there never re-announces itself.
      */}
      <Text accessibilityLiveRegion="polite" style={styles.liveRegion}>
        {liveMessage}
      </Text>
      {visible.map((toast) => (
        <ToastRow
          // Revision as well as key: a re-raised toast is a new message and replays
          // its entrance instead of sitting there looking unchanged.
          key={`${toast.key}:${toast.revision}`}
          onDismiss={onDismiss}
          reduce={reduce}
          toast={toast}
        />
      ))}
    </View>
  );
}

interface ToastRowProps {
  toast: Toast;
  onDismiss?: (key: string) => void;
  reduce: boolean;
}

function ToastRow({ toast, onDismiss, reduce }: ToastRowProps): ReactElement {
  const { key, severity, message, expiresAtMs } = toast;
  // A message on its way out needs no control. A persistent one has no other way
  // off the screen, so it always gets one — unless the caller has no handler, in
  // which case a button would be a lie.
  const dismissable = expiresAtMs === null && onDismiss !== undefined;

  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.duration(duration.base)}
      layout={reduce ? undefined : LinearTransition}
      style={styles.panel}
    >
      <View style={[styles.severityBar, { backgroundColor: SEVERITY_COLOR[severity] }]} />
      <View
        accessible
        accessibilityLabel={toastAccessibilityLabel(toast)}
        accessibilityRole="text"
        style={styles.body}
      >
        <Text style={[styles.glyph, { color: SEVERITY_COLOR[severity] }]}>
          {SEVERITY_GLYPH[severity]}
        </Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      {dismissable ? (
        <Pressable
          accessibilityLabel={`Dismiss message: ${message}`}
          accessibilityRole="button"
          hitSlop={layout.hitSlop}
          onPress={() => onDismiss(key)}
          style={styles.dismiss}
        >
          {/* Lowercase, so it never reads as the error severity mark. */}
          <Text style={styles.dismissGlyph}>x</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  liveRegion: {
    height: 1,
    opacity: 0,
    overflow: "hidden",
    position: "absolute",
    width: 1,
  },
  panel: {
    alignItems: "center",
    backgroundColor: PANEL_BG,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    flexDirection: "row",
    // Clips the severity bar to the panel's corners.
    overflow: "hidden",
  },
  severityBar: {
    alignSelf: "stretch",
    borderRadius: radius.pill,
    width: 3,
  },
  body: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  glyph: {
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
    // Fixed width so messages line up whatever the severity mark is.
    textAlign: "center",
    width: 10,
  },
  message: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    lineHeight: 18,
  },
  dismiss: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 28,
    justifyContent: "center",
    marginRight: spacing.xs,
    // 28pt visual plus the 8pt slop on each side is the 44pt target.
    width: 28,
  },
  dismissGlyph: {
    color: colors.textDim,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
  },
});
