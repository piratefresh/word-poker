/**
 * coach.tsx — coach marks: a card that points at a real control on the felt.
 *
 * The MVP's tour (four-in-a-row `wordPokerTours`) ran on nextstepjs, which finds its targets by
 * DOM selector and only runs on the web. Here a control opts in by being wrapped in a
 * `CoachTarget` with an id, and a `CoachProvider` around the screen measures it and lays the card
 * beside it. `@expo/ui`'s Popover is iOS-only and must own its trigger, while a coach mark points
 * at controls it does not own, on every platform — so this is plain React Native.
 *
 * The overlay dims the screen around the target but lets every touch through, like the MVP's
 * click-through overlay: the lesson teaches by having the player press the real control, and the
 * script (not the overlay) decides whether the press was the one it asked for.
 *
 * Controlled: the caller owns the tour — which step, and what Next, Previous and Close do. A step
 * whose `advance` is `action` withholds Next; the caller moves on when the player has acted.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { duration, palette } from "@/constants/theme";

import { CoachCard, type CoachKind } from "./coach-card";
import { placeCoachCard, type CoachSide, type Rect, type Size } from "./placement";

/** One step of a tour. */
export interface CoachStep {
  /** Stable identity: the card re-enters when it changes. */
  id: string;
  /** The badge's letter or number. */
  icon?: string;
  title: string;
  body: ReactNode;
  /** The `CoachTarget` the card points at; absent, the card is centered with no arrow. */
  target?: string;
  /** The side the card prefers; it flips when that side has no room. Defaults to `top`. */
  side?: CoachSide;
  /** `next` shows Next; `action` waits for the player to do what the step teaches. */
  advance: "next" | "action";
}

/** The tour on screen, or `null` for none. */
export interface CoachTour {
  kind: CoachKind;
  steps: readonly CoachStep[];
  /** 0-based index into `steps`. */
  index: number;
  onNext?: () => void;
  onPrevious?: () => void;
  onClose?: () => void;
}

/**
 * A tour the player steps through on their own — Next, Previous, and Close or Finish to leave —
 * for tours that wait on nothing but the player's reading, like the felt's "How to play".
 * `tour` is `null` while it is closed; `open` starts it from the first step.
 */
export function useCoachTour(
  kind: CoachKind,
  steps: readonly CoachStep[],
): { tour: CoachTour | null; open: () => void; close: () => void } {
  const [index, setIndex] = useState<number | null>(null);
  const open = useCallback(() => setIndex(0), []);
  const close = useCallback(() => setIndex(null), []);

  const tour = useMemo<CoachTour | null>(
    () =>
      index === null
        ? null
        : {
            kind,
            steps,
            index,
            onNext: () => setIndex(index + 1 < steps.length ? index + 1 : null),
            onPrevious: () => setIndex(Math.max(0, index - 1)),
            onClose: close,
          },
    [close, index, kind, steps],
  );

  return { tour, open, close };
}

interface CoachRegistry {
  register: (id: string, view: View | null) => void;
  /** A target laid out again: re-measure the card's anchor. */
  moved: () => void;
}

const CoachContext = createContext<CoachRegistry | null>(null);

/** How far the dimmed cut-out reaches past the target's own edges. */
const SPOTLIGHT_PAD = 6;
const SHADE = "rgba(7,36,25,0.65)";
const ARROW = 12;

/**
 * Wraps the screen a tour runs over. Renders its children unchanged; the card and the shade sit
 * on top of them, filling the provider's own box.
 */
export function CoachProvider({
  tour,
  children,
  style,
}: {
  tour: CoachTour | null;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  const root = useRef<View>(null);
  const targets = useRef(new Map<string, View>());
  const [tick, moved] = useReducer((count: number) => count + 1, 0);
  const window = useWindowDimensions();
  const [container, setContainer] = useState<Size | null>(null);
  const [anchor, setAnchor] = useState<{ id: string; rect: Rect } | null>(null);
  const [cardHeight, setCardHeight] = useState<number | null>(null);

  const register = useCallback((id: string, view: View | null) => {
    if (view === null) targets.current.delete(id);
    else targets.current.set(id, view);
  }, []);
  const registry = useMemo(() => ({ register, moved }), [register]);

  const step = tour === null ? undefined : tour.steps[tour.index];
  const targetId = step?.target;

  // Measured in window coordinates and taken relative to the provider, so the card lands on the
  // target whatever sits between them. Re-run when the step changes, a target lays out again, or
  // the window resizes or rotates.
  useEffect(() => {
    if (targetId === undefined) return;
    const target = targets.current.get(targetId);
    const host = root.current;
    if (target === undefined || host === null) return;
    host.measureInWindow((rootX, rootY) => {
      target.measureInWindow((x, y, width, height) => {
        setAnchor({ id: targetId, rect: { x: x - rootX, y: y - rootY, width, height } });
      });
    });
  }, [targetId, tick, window.width, window.height]);

  const rect = targetId !== undefined && anchor?.id === targetId ? anchor.rect : null;
  const waiting = targetId !== undefined && rect === null;
  const placement =
    step !== undefined && container !== null && cardHeight !== null && !waiting
      ? placeCoachCard({ target: rect, container, cardHeight, side: step.side ?? "top" })
      : null;

  return (
    <CoachContext.Provider value={registry}>
      <View
        collapsable={false}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setContainer({ width, height });
          moved();
        }}
        ref={root}
        style={[styles.root, style]}
      >
        {children}
        {tour !== null && step !== undefined ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {rect !== null && container !== null ? <Shade container={container} rect={rect} /> : null}
            <Animated.View
              entering={FadeIn.duration(duration.base)}
              key={step.id}
              onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
              style={[
                styles.card,
                placement === null
                  ? { opacity: 0, width: container === null ? undefined : Math.min(340, container.width - 32) }
                  : { left: placement.left, top: placement.top, width: placement.width },
              ]}
            >
              <CoachCard
                advance={step.advance}
                body={step.body}
                index={tour.index}
                kind={tour.kind}
                title={step.title}
                total={tour.steps.length}
                {...(step.icon === undefined ? {} : { icon: step.icon })}
                {...(tour.onNext === undefined ? {} : { onNext: tour.onNext })}
                {...(tour.onPrevious === undefined ? {} : { onPrevious: tour.onPrevious })}
                {...(tour.onClose === undefined ? {} : { onClose: tour.onClose })}
              />
              {placement?.arrowX != null && placement.side !== null ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.arrow,
                    { left: placement.arrowX - ARROW / 2 },
                    placement.side === "top" ? styles.arrowBelow : styles.arrowAbove,
                  ]}
                />
              ) : null}
            </Animated.View>
          </View>
        ) : null}
      </View>
    </CoachContext.Provider>
  );
}

/**
 * Marks a control a tour can point at. Renders a plain `View` with the style it is given, so it
 * can take the place of a container that is already there; outside a `CoachProvider` it is just
 * that view.
 */
export function CoachTarget({
  id,
  children,
  style,
  testID,
}: {
  id: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): ReactElement {
  const registry = useContext(CoachContext);
  const register = registry?.register;

  const ref = useCallback(
    (view: View | null) => register?.(id, view),
    [id, register],
  );

  return (
    <View
      collapsable={false}
      onLayout={registry?.moved}
      ref={ref}
      style={style}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </View>
  );
}

/** The dimmed screen around the target, in four bands; every touch passes through. */
function Shade({ container, rect }: { container: Size; rect: Rect }): ReactElement {
  const top = Math.max(0, rect.y - SPOTLIGHT_PAD);
  const bottom = Math.min(container.height, rect.y + rect.height + SPOTLIGHT_PAD);
  const left = Math.max(0, rect.x - SPOTLIGHT_PAD);
  const right = Math.min(container.width, rect.x + rect.width + SPOTLIGHT_PAD);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="coach-shade">
      <View style={[styles.shade, { left: 0, right: 0, top: 0, height: top }]} />
      <View style={[styles.shade, { left: 0, right: 0, top: bottom, bottom: 0 }]} />
      <View style={[styles.shade, { left: 0, width: left, top, height: bottom - top }]} />
      <View style={[styles.shade, { left: right, right: 0, top, height: bottom - top }]} />
      <View
        style={[
          styles.ring,
          { left, top, width: right - left, height: bottom - top },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  card: {
    position: "absolute",
  },
  arrow: {
    backgroundColor: palette.cream100,
    height: ARROW,
    position: "absolute",
    transform: [{ rotate: "45deg" }],
    width: ARROW,
  },
  // The card's heel is a 3pt gold border, so the arrow under it tucks in by that much.
  arrowBelow: {
    bottom: -(ARROW / 2) - 1,
    backgroundColor: palette.gold400,
  },
  arrowAbove: {
    top: -(ARROW / 2),
  },
  shade: {
    backgroundColor: SHADE,
    position: "absolute",
  },
  ring: {
    borderColor: palette.gold300,
    borderRadius: 8,
    borderWidth: 1.5,
    position: "absolute",
  },
});

