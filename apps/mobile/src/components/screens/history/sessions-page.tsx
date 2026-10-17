import { useEffect, useMemo, useRef, useState } from "react";

import { Pressable, StyleSheet, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import { colors, fonts, ledger } from "@/constants/theme";
import { useHistory } from "@/lib/history/history-provider";
import { type HistorySession, sessionName, sessionStatus } from "@/lib/history/history-store";
import { useHistorySessions } from "@/lib/history/use-history-pages";
import { clock, dayLabel } from "@/utils/date";

import { DealIn } from "./ledger/deal-in";
import { LedgerCard } from "./ledger/ledger-card";
import { LedgerList } from "./ledger/ledger-page";
import { MiniTile } from "./ledger/mini-tile";
import { StatusPill } from "./ledger/status-pill";
import { UnrankedLabel } from "./ledger/unranked-label";

/** Collapsed session card plus its bottom gap; LegendList measures the real heights. */
const ROW_HEIGHT = 90;

export function offlineBanner(waiting: number): string {
  return (
    "You're offline. Saved hands are still here." +
    (waiting > 0
      ? ` ${waiting} session${waiting === 1 ? "" : "s"} will upload when you reconnect.`
      : "")
  );
}

export function syncLabel(
  offline: boolean,
  syncing: boolean,
  failed: boolean,
  lastSyncedAt: number | null,
  now = Date.now(),
): string {
  if (offline) return "Offline. Saved hands are still here.";
  if (syncing) return "Syncing saved hands.";
  if (failed) return "Last sync failed. Double tap to retry.";
  const minutes =
    lastSyncedAt === null ? null : Math.max(0, Math.floor((now - lastSyncedAt) / 60_000));
  return (
    (minutes === null
      ? "Not synced yet."
      : minutes === 0
        ? "Synced just now."
        : `Synced ${minutes} minute${minutes === 1 ? "" : "s"} ago.`) + " Double tap to sync."
  );
}

export function SessionsPage({
  active,
  openSession,
}: {
  active: boolean;
  openSession: (id: string) => void;
}) {
  const sessions = useHistorySessions();
  const history = useHistory();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [entrance, setEntrance] = useState({
    active,
    entered: active,
    returning: false,
  });
  if (active !== entrance.active)
    setEntrance({
      active,
      entered: entrance.entered || active,
      returning: entrance.returning || (!active && entrance.entered),
    });
  const baseDelay = entrance.returning ? 90 : 520;
  const extraData = useMemo(
    () => ({ active, expanded, uploading: history.uploadingSessionId }),
    [active, expanded, history.uploadingSessionId],
  );
  return (
    <LedgerList
      accessibilityLabel="Hand Ledger sessions"
      data={sessions.items}
      extraData={extraData}
      keyExtractor={(session) => session.sessionId}
      estimatedItemSize={ROW_HEIGHT}
      onEndReached={sessions.loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.heading}>
            <View accessible accessibilityLabel="History" style={styles.tiles}>
              {(["H", "I", "S", "T", "O", "R", "Y"] as const).map((letter, i) => (
                <TitleTile
                  key={i}
                  letter={letter}
                  index={i}
                  active={active && !entrance.returning}
                />
              ))}
            </View>
            <SyncPill />
          </View>
          {history.offline ? (
            <Text style={styles.banner}>{offlineBanner(history.pendingSessions)}</Text>
          ) : null}
          {history.error && !history.offline ? (
            <Text style={styles.banner}>{history.error}</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        sessions.loading ? (
          <View style={styles.loading} accessibilityLabel="Opening saved hands">
            {[0, 1, 2].map((i) => (
              <View key={i} testID="session-placeholder" style={styles.placeholder} />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <LedgerCard>
              <View style={styles.emptyContent}>
                <Text style={styles.emptyTitle}>No hands yet</Text>
                <Text style={styles.emptyCopy}>
                  Every hand you finish lands here, grouped by session, with your word, score and
                  chips won or lost.
                </Text>
                <Text style={styles.emptyCopy}>
                  Offline hands save to this phone and upload when you reconnect. They stay
                  unranked.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Play offline"
                  onPress={() => router.navigate({ pathname: "/", params: { offline: "1" } })}
                >
                  <LinearGradient colors={ledger.goldButton} style={styles.play}>
                    <Text style={styles.playText}>PLAY OFFLINE</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </LedgerCard>
          </View>
        )
      }
      renderItem={({ item, index }) => {
        const card = (
          <View style={styles.cardGap}>
            <SessionCard
              session={item}
              uploadingSessionId={history.uploadingSessionId}
              expanded={expanded.has(item.sessionId)}
              open={() => openSession(item.sessionId)}
              toggle={() =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(item.sessionId)) next.delete(item.sessionId);
                  else next.add(item.sessionId);
                  return next;
                })
              }
            />
          </View>
        );
        return index < 10 ? (
          <DealIn index={index} baseDelay={baseDelay} active={active}>
            {card}
          </DealIn>
        ) : (
          card
        );
      }}
    />
  );
}

export function SessionCard({
  session,
  uploadingSessionId,
  expanded,
  open,
  toggle,
}: {
  session: HistorySession;
  uploadingSessionId: string | null;
  expanded: boolean;
  open: () => void;
  toggle: () => void;
}) {
  const offline = session.latest.hand.mode === "offline";
  const name = sessionName(session);
  return (
    <LedgerCard>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View session ${name}`}
        onPress={open}
        style={styles.cardRow}
      >
        <View style={styles.mode}>
          <Text style={styles.modeLetter}>{offline ? "B" : "O"}</Text>
        </View>
        <View style={styles.description}>
          <Text style={styles.name}>{name}</Text>
          <Text
            style={styles.meta}
          >{`${dayLabel(session.startedAtMs)} · ${clock(session.startedAtMs)} · ${session.hands} ${session.hands === 1 ? "hand" : "hands"}`}</Text>
        </View>
        <View style={styles.status}>
          <StatusPill variant={sessionStatus(session, uploadingSessionId)} />
          {offline ? <UnrankedLabel /> : null}
        </View>
      </Pressable>
      {session.rejected.length ? (
        <View style={styles.rejected}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            style={styles.detailsTarget}
            onPress={toggle}
          >
            <Text style={styles.details}>
              {expanded
                ? "Hide details"
                : `${session.rejected.length} ${session.rejected.length === 1 ? "hand" : "hands"} rejected · Details`}
            </Text>
          </Pressable>
          {expanded ? (
            <View style={styles.errorBox}>
              {session.rejected.map((hand) => (
                <Text
                  key={hand.handNo}
                  style={styles.errorText}
                >{`Hand #${hand.handNo}: ${hand.reason}`}</Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </LedgerCard>
  );
}

function TitleTile({
  letter,
  index,
  active,
}: {
  letter: "H" | "I" | "S" | "T" | "O" | "R" | "Y";
  index: number;
  active: boolean;
}) {
  const reduced = useReduceMotion();
  const progress = useSharedValue(0);
  const dealt = useRef(false);
  useEffect(() => {
    // Hidden until the first pop, like DealIn; reduce motion skips straight to rest.
    if (!active && !reduced && !dealt.current) return;
    dealt.current = true;
    progress.value = 1;
    if (active && !reduced) {
      progress.value = 0;
      progress.value = withDelay(
        300 + index * 45,
        withTiming(1, {
          duration: 450,
          easing: Easing.bezier(0.3, 1.6, 0.5, 1),
        }),
      );
    }
    return () => cancelAnimation(progress);
  }, [active, reduced, index, progress]);
  const motion = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value),
    transform: [
      { translateY: -18 * (1 - progress.value) },
      { scale: 0.6 + 0.4 * progress.value },
      { rotate: `${(((index * 37) % 7) - 3) * 1.6}deg` },
    ],
  }));
  return (
    <Animated.View style={motion}>
      <MiniTile letter={letter} size="lg" />
    </Animated.View>
  );
}

export function SyncPill() {
  const { offline, syncing, refresh, lastSyncedAt, error } = useHistory();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const failed = error !== null;
  const reduced = useReduceMotion();
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = 0;
    if (syncing && !offline && !reduced)
      rotation.value = withRepeat(
        withTiming(720, {
          duration: 1400,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        }),
        -1,
      );
    return () => cancelAnimation(rotation);
  }, [syncing, offline, reduced, rotation]);
  const motion = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const disabled = offline || syncing;
  return (
    <Pressable
      testID="history-sync"
      accessibilityRole="button"
      accessibilityLabel={syncLabel(offline, syncing, failed, lastSyncedAt, now)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={refresh}
      style={[styles.syncTarget, disabled && { opacity: 0.45 }]}
    >
      <View style={styles.syncFace}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor: offline ? ledger.offline : syncing ? ledger.syncing : ledger.synced,
            },
          ]}
        />
        <Text style={styles.syncText}>{offline ? "OFFLINE" : syncing ? "SYNCING…" : failed ? "RETRY" : lastSyncedAt === null ? "NOT SYNCED" : "SYNCED"}</Text>
        <Animated.Text style={[styles.syncArrow, motion]}>↻</Animated.Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 10, paddingBottom: 10, gap: 10 },
  heading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  tiles: { flexDirection: "row", gap: 3 },
  syncTarget: { minHeight: 44, justifyContent: "center" },
  syncFace: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: ledger.goldEdge,
    backgroundColor: colors.surface,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  syncText: {
    fontFamily: fonts.arcade,
    fontSize: 12,
    letterSpacing: 0.48,
    color: ledger.parchment,
  },
  syncArrow: { fontFamily: fonts.rubikSemiBold, fontSize: 14, color: ledger.goldText },
  banner: {
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    fontFamily: fonts.rubikMedium,
    fontSize: 11.5,
    lineHeight: 16.1,
    color: ledger.onFelt,
  },
  cardGap: { paddingBottom: 10 },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  mode: {
    width: 34,
    height: 38,
    borderRadius: 6,
    backgroundColor: ledger.modeTile,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0px 3px 0px ${ledger.modeTileEdge}`,
  },
  modeLetter: { fontFamily: fonts.arcade, fontSize: 22, color: ledger.parchment },
  description: { flex: 1, gap: 4 },
  name: {
    fontFamily: fonts.arcade,
    fontSize: 17,
    lineHeight: 18,
    color: ledger.ink,
  },
  meta: { fontFamily: fonts.rubikMedium, fontSize: 11.5, color: ledger.inkSoft },
  status: { alignItems: "flex-end", gap: 4 },
  rejected: { marginLeft: 44, gap: 6 },
  detailsTarget: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  details: {
    fontFamily: fonts.rubikSemiBold,
    fontSize: 11,
    color: ledger.rejectedLink,
    textDecorationLine: "underline",
  },
  errorBox: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
    backgroundColor: ledger.rejectedBg,
  },
  errorText: {
    fontFamily: fonts.rubikMedium,
    fontSize: 11.5,
    lineHeight: 16.1,
    color: ledger.rejectedInk,
  },
  loading: { gap: 10 },
  placeholder: {
    height: 90,
    backgroundColor: ledger.parchment,
    opacity: 0.5,
    borderRadius: 12,
  },
  empty: { marginTop: 30 },
  emptyContent: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: { fontFamily: fonts.arcade, fontSize: 26, color: ledger.ink },
  emptyCopy: {
    fontFamily: fonts.rubik,
    fontSize: 13,
    lineHeight: 19.5,
    textAlign: "center",
    color: ledger.inkBody,
  },
  play: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 999,
    boxShadow: `0px 4px 0px ${ledger.goldButtonEdge}`,
  },
  playText: {
    fontFamily: fonts.arcade,
    fontSize: 18,
    letterSpacing: 0.72,
    color: ledger.ink,
  },
});
