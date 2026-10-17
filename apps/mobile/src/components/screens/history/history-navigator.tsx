import { router, StackRouter, unstable_createStandardRouterNavigator, useFocusEffect, type NavigatorContentProps } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import { HistoryScreen } from "./history-screen";
import { PAGE_REVEAL_MS, PAGE_TURN_MS } from "./ledger/page-stack";

// Cold detail links need both ancestors for hardware back and swipe to pop one page.
export const ledgerRouter: typeof StackRouter = (options) => {
  const stack = StackRouter(options);
  return {
    ...stack,
    getRehydratedState(state, config) {
      if (state.stale === false) return stack.getRehydratedState(state, config);
      const current = state.routes[state.index ?? state.routes.length - 1];
      const routes = current ? ledgerStack(state.routes, current, (name, params) => ({ name, params })) : [{ name: "index" }];
      return stack.getRehydratedState({ ...state, routes, index: routes.length - 1 }, config);
    },
    getStateForAction(state, action, config) {
      const next = stack.getStateForAction(state, action, config);
      if (!next || next.stale !== false) return next;
      const current = next.routes[next.index];
      if (current.name === "index") return next;
      const routes = ledgerStack(next.routes, current, (name, params) =>
        ({ key: `${current.key}-${name === "index" ? "sessions" : "hands"}`, name, params }));
      return { ...next, routes, index: routes.length - 1 };
    },
  };
};

/** Sessions, then the open session's hands, then `current`: reusing routes already on the stack. */
function ledgerStack<R extends { name: string; params?: object }>(
  routes: readonly R[],
  current: R,
  missing: (name: "index" | "[sessionId]", params?: { sessionId?: string }) => R,
): R[] {
  if (current.name === "index") return [current];
  const stack = [routes.find((route) => route.name === "index") ?? missing("index")];
  if (current.name === "[sessionId]/[handId]") {
    const sessionId = stringParam(current.params, "sessionId");
    stack.push(routes.find((route) => route.name === "[sessionId]" && stringParam(route.params, "sessionId") === sessionId)
      ?? missing("[sessionId]", { sessionId }));
  }
  return [...stack, current];
}

function stringParam(params: object | undefined, key: string): string | undefined {
  if (!params || !(key in params)) return undefined;
  const value: unknown = Reflect.get(params, key);
  return typeof value === "string" ? value : undefined;
}

type ContentProps = NavigatorContentProps<object, Record<string, never>, object>;

function HistoryContent({ state, actions }: ContentProps) {
  const route = state.routes[state.index];
  const level = route.name === "[sessionId]/[handId]" ? 2 : route.name === "[sessionId]" ? 1 : 0;
  const reduced = useReduceMotion();
  const session = stringParam(route.params, "sessionId");
  const hand = stringParam(route.params, "handId");
  const [selection, setSelection] = useState({ sessionId: session, handId: hand });
  if ((session && session !== selection.sessionId) || (hand && hand !== selection.handId)) {
    setSelection({ sessionId: session ?? selection.sessionId, handId: hand ?? (session === selection.sessionId ? selection.handId : undefined) });
  }
  const [revealedRoute, setRevealedRoute] = useState(route.key);
  const lastRoute = useRef(route.key);
  const locked = useRef(false);
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const releaseAfterTurn = useCallback(() => {
    clearTimeout(release.current);
    release.current = setTimeout(() => { locked.current = false; }, reduced ? 0 : PAGE_TURN_MS);
  }, [reduced]);
  const claimTurn = useCallback(() => {
    if (locked.current) return false;
    // Lock synchronously, before Expo Router processes the push, including Reduce Motion.
    locked.current = true;
    releaseAfterTurn();
    return true;
  }, [releaseAfterTurn]);
  useEffect(() => () => clearTimeout(release.current), []);
  useEffect(() => {
    if (reduced) locked.current = false;
    if (lastRoute.current === route.key) return;
    lastRoute.current = route.key;
    locked.current = !reduced;
    const reveal = setTimeout(() => setRevealedRoute(route.key), reduced ? 0 : PAGE_REVEAL_MS);
    releaseAfterTurn();
    return () => clearTimeout(reveal);
  }, [route.key, reduced, releaseAfterTurn]);
  const back = useCallback(() => {
    if (locked.current) return;
    if (level > 0) {
      if (claimTurn()) actions.back();
    }
    else router.navigate("/");
  }, [actions, level, claimTurn]);
  useFocusEffect(useCallback(() => {
    if (Platform.OS === "web") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { back(); return true; });
    return () => subscription.remove();
  }, [back]));
  return <View style={styles.fill}>
    <HistoryScreen level={level} sessionId={session ?? selection.sessionId} handId={hand ?? selection.handId}
      revealed={reduced || revealedRoute === route.key} back={back}
      openSession={(id) => {
        if (level === 0 && claimTurn()) router.push({ pathname: "/history/[sessionId]", params: { sessionId: id } });
      }}
      openHand={(id) => {
        if (level === 1 && session && claimTurn()) router.push({ pathname: "/history/[sessionId]/[handId]", params: { sessionId: session, handId: id } });
      }} />
    {Platform.OS === "ios" ? <EdgeBack onBack={back} /> : null}
  </View>;
}

// The book supplies its own transition, including an iOS edge swipe to turn back.
function EdgeBack({ onBack }: { onBack: () => void }) {
  const swipe = Gesture.Pan().activeOffsetX(20).failOffsetY([-20, 20]).runOnJS(true)
    .onEnd((event) => { if (event.translationX > 60 || event.velocityX > 500) onBack(); });
  return <GestureDetector gesture={swipe}><View style={styles.edge} /></GestureDetector>;
}

const LedgerNavigator = unstable_createStandardRouterNavigator(HistoryContent, ledgerRouter);

export function HistoryNavigator() {
  return <LedgerNavigator initialRouteName="index" />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  edge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 24 },
});
