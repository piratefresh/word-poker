/** The 2a night lobby: headliner, filters, live room list, details, and create. */

import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeInDown, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BUY_IN_PRESETS, type RoomSummary } from "@wordpoker/contracts";

import { GoldButton } from "@/components/ui/gold-button";
import { HomeNavRack, type HomeNavDestination } from "@/components/screens/home/home-nav-rack";
import { artPoint, STREETS } from "@/components/screens/home/street-art";
import { border, colors, fonts, fontSize, nightLobby, radius, spacing } from "@/constants/theme";
import { authClient } from "@/auth/client/auth-client";
import { useQuests } from "@/lib/quests/quests-provider";
import { filterLobbyRooms, LOBBY_FILTERS, type LobbyFilter } from "@/features/online/lobby-view";
import { joinTable, useActiveRoomId, useHostedRoomIds } from "@/features/online/room-session";
import { useLobby } from "@/features/online/use-lobby";
import { CreateTableForm } from "./create-table-form";
import { FeaturedTableCard } from "./featured-table";
import { GuestPanel, OutOfCoinsPanel } from "./lobby-panel";
import { NightLobbyButton } from "./night-lobby-button";
import { ParlorBackground } from "./parlor-background";
import { ParlorNav } from "./parlor-nav";
import { tableThatFits } from "./parlor-view";
import { RoomDetailsSheet } from "./room-details-sheet";
import { RoomRow } from "./room-row";
import { useCoinsBack, type CashOut } from "./use-coins-back";

const NAV_ROUTES: Record<HomeNavDestination, Href> = {
  home: "/",
  friends: "/friends",
  history: "/history",
  store: "/store",
};
const TABLE_ENTRY_MS = 900;
const TABLE_ENTRY_ZOOM = 3.4;
const CHEAPEST_BUY_IN = Math.min(...BUY_IN_PRESETS);
/** The coins-back toast rises 30px as it fades in. */
const TOAST_ENTRY = FadeInDown.duration(800).withInitialValues({ opacity: 0, transform: [{ translateY: 30 }] });

export function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { status, rooms, headliner, listRooms, readout, refreshing, error, refresh } = useLobby();
  const activeRoomId = useActiveRoomId();
  const hostedRoomIds = useHostedRoomIds();
  const { data: session } = authClient.useSession();
  const { coins, refreshCoins, state: questState, levelUp, streakBanner } = useQuests();
  const [joining, setJoining] = useState<string | null>(null);
  /** A join the server turned down: its words, and the table RETRY asks for again. */
  const [refusal, setRefusal] = useState<{ roomId: string; message: string } | null>(null);
  const [filter, setFilter] = useState<LobbyFilter>("All");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  // `left`/`before`: the table a Leave came back from, and the Wallet read just before it (STO-954).
  const { create, left, before } = useLocalSearchParams<{ create?: string; left?: string; before?: string }>();
  const [creating, setCreating] = useState(create === "1");
  const [cashOut, setCashOut] = useState<CashOut | null>(null);
  const leftKey = left !== undefined && before !== undefined ? `${left}|${before}` : null;
  const [seenLeft, setSeenLeft] = useState<string | null>(null);
  if (leftKey !== seenLeft) {
    setSeenLeft(leftKey);
    if (leftKey !== null && Number.isFinite(Number(before))) setCashOut({ table: left!, before: Number(before) });
  }
  const travel = useSharedValue(0);
  const travelStarted = useRef(false);

  useFocusEffect(
    useCallback(() => {
      travelStarted.current = false;
      travel.set(0);
      // Back from the store or a table: the coins that gate Join may have moved.
      refreshCoins();
    }, [refreshCoins, travel]),
  );

  const street = width > height ? STREETS.landscape : STREETS.portrait;
  const door = artPoint(street, { width, height }, street.door);
  const streetReveal = useAnimatedStyle(() => ({
    opacity: interpolate(travel.get(), [0, 0.72, 1], [0, 1, 1], "clamp"),
  }));
  const sceneZoom = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(travel.get(), [0, 1], [1, TABLE_ENTRY_ZOOM]) }],
  }));

  useEffect(() => {
    if (create === "1") router.setParams({ create: undefined });
  }, [create]);

  useEffect(() => {
    if (leftKey !== null) router.setParams({ left: undefined, before: undefined });
  }, [leftKey]);

  const selectedRoom = rooms.find((room) => room.roomId === selectedRoomId) ?? null;
  const guest = session?.user.isAnonymous === true;
  const broke = !guest && coins !== null && coins < CHEAPEST_BUY_IN;
  const coinsBack = useCoinsBack(
    coins,
    CHEAPEST_BUY_IN,
    levelUp !== null ? `Level ${levelUp.level} reached.` : streakBanner !== null ? `Day ${streakBanner.day} streak reward.` : null,
    reduceMotion,
    cashOut,
    refreshCoins,
  );
  // Flow B: a panel takes the hero card's place, and its table joins the rows with the rest.
  const panel = guest ? <GuestPanel /> : broke ? <OutOfCoinsPanel cheapest={CHEAPEST_BUY_IN} /> : null;
  const featured = panel === null ? headliner : undefined;
  const listed = panel !== null && headliner !== undefined ? [headliner, ...listRooms] : listRooms;
  const selectElsewhere = (room: RoomSummary) => setSelectedRoomId(room.roomId);
  const filteredRooms = filterLobbyRooms(listed, filter);
  const elsewhere = (room: RoomSummary | null) => tableThatFits(rooms, coins, room?.roomId ?? null);
  const currentReadout = status === "loading" && rooms.length === 0 ? "Looking for tables…" : readout;

  const back = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  };

  const travelToTable = (roomId: string) => {
    if (travelStarted.current) return;
    travelStarted.current = true;
    const enter = () => router.push({ pathname: "/online/[roomId]", params: { roomId } });
    if (reduceMotion) {
      enter();
      return;
    }
    travel.set(withTiming(1, { duration: TABLE_ENTRY_MS, easing: Easing.in(Easing.cubic) }));
    setTimeout(enter, TABLE_ENTRY_MS);
  };

  const openTable = (roomId: string) => {
    if (roomId === activeRoomId) {
      setSelectedRoomId(null);
      travelToTable(roomId);
      return;
    }

    setRefusal(null);
    setJoining(roomId);
    void joinTable(roomId)
      .then(() => {
        setSelectedRoomId(null);
        travelToTable(roomId);
      })
      .catch((failure: unknown) => {
        setSelectedRoomId(null);
        setRefusal({ roomId, message: failure instanceof Error ? failure.message : "That table could not be joined." });
        refresh();
        // A refusal may have been the Wallet's: read it again so Join quotes the real balance.
        refreshCoins();
      })
      .finally(() => setJoining(null));
  };

  return (
    <View style={styles.screen} testID="lobby-screen">
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, streetReveal]}>
        <Image contentFit="cover" source={street.source} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.scene, { transformOrigin: [door.x, door.y, 0] }, sceneZoom]}>
      <ParlorBackground />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 180, paddingTop: insets.top + spacing.md }}
        refreshControl={
          <RefreshControl colors={[colors.gold]} onRefresh={() => {
            refresh();
            refreshCoins();
          }} refreshing={refreshing} tintColor={nightLobby.gold.light} />
        }
        testID="lobby-scroll"
      >
        <ParlorNav
          coins={coinsBack.shown}
          gained={coinsBack.gained}
          guest={guest}
          level={questState?.level}
          me={session?.user.isAnonymous ? "Guest" : session?.user.name?.trim() || session?.user.email}
          onBack={back}
          readout={currentReadout}
        />

        {panel}

        {featured ? (
          <FeaturedTableCard
            coins={coins}
            elsewhere={elsewhere(featured)}
            glow={coinsBack.glow}
            guest={guest}
            joining={joining === featured.roomId}
            onDetails={() => setSelectedRoomId(featured.roomId)}
            onElsewhere={selectElsewhere}
            onJoin={() => openTable(featured.roomId)}
            room={featured}
            yours={featured.roomId === activeRoomId}
          />
        ) : null}

        {status === "ready" && rooms.length === 0 ? (
          <View style={styles.empty} testID="lobby-empty">
            <Text style={styles.emptyTitle}>THE SKY IS QUIET</Text>
            <Text style={styles.emptyCopy}>Deal the first table and light it up.</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>ROOMS</Text>
            <Text style={styles.count}>{filteredRooms.length}</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {LOBBY_FILTERS.map((item) => {
              const selected = filter === item;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={item}
                  onPress={() => setFilter(item)}
                  style={({ pressed }) => [styles.filter, selected && styles.filterSelected, pressed && styles.filterPressed]}
                  testID={`lobby-filter-${item.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{item}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {filteredRooms.map((room) => (
            <RoomRow
              coins={coins}
              disabled={joining !== null}
              guest={guest}
              hosted={hostedRoomIds.has(room.roomId)}
              key={room.roomId}
              onPress={() => setSelectedRoomId(room.roomId)}
              room={room}
              yours={room.roomId === activeRoomId}
            />
          ))}

          {status === "loading" && rooms.length === 0 ? (
            <Text style={styles.note} testID="lobby-loading">Looking for tables…</Text>
          ) : null}

          {status === "ready" && rooms.length > 0 && filteredRooms.length === 0 ? (
            <Text style={styles.note} testID="lobby-no-filter-matches">
              {filter === "All" && featured ? "No other tables yet." : "No rooms match this filter."}
            </Text>
          ) : null}

          {status === "error" ? (
            <View style={styles.dropped}>
              <Text style={styles.refusal} testID="lobby-error">{error}</Text>
              <GoldButton label="TRY THE LIST AGAIN" onPress={refresh} testID="lobby-retry" />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.createDock, { bottom: insets.bottom + 88 }]}>
        <NightLobbyButton label="+ DEAL A NEW TABLE" onPress={() => setCreating(true)} testID="lobby-create" />
      </View>

      {refusal === null ? null : (
        <View accessibilityRole="alert" style={[styles.banner, { top: insets.top + spacing.sm }]} testID="lobby-refusal">
          <Text style={styles.bannerText}>{refusal.message}</Text>
          <Pressable
            accessibilityLabel="Retry joining the table"
            accessibilityRole="button"
            onPress={() => openTable(refusal.roomId)}
            style={({ pressed }) => [styles.bannerRetry, pressed && styles.filterPressed]}
            testID="lobby-refusal-retry"
          >
            <Text style={styles.bannerRetryText}>RETRY</Text>
          </Pressable>
        </View>
      )}

      {coinsBack.title === null ? null : (
        <Animated.View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          entering={TOAST_ENTRY}
          style={[styles.toast, { bottom: insets.bottom + 160 }]}
          testID="lobby-coins-back"
        >
          <View style={styles.toastCoin} />
          <View style={styles.toastCopy}>
            <Text style={styles.toastTitle}>{coinsBack.title}</Text>
            <Text style={styles.toastLine}>{coinsBack.line}</Text>
          </View>
        </Animated.View>
      )}

      <HomeNavRack active="home" onNavigate={(destination) => router.push(NAV_ROUTES[destination])} />

      <CreateTableForm visible={creating} onClose={() => setCreating(false)} onCreated={travelToTable} />
      <RoomDetailsSheet
        coins={coins}
        elsewhere={elsewhere(selectedRoom)}
        guest={guest}
        hosted={selectedRoom !== null && hostedRoomIds.has(selectedRoom.roomId)}
        joining={selectedRoom !== null && joining === selectedRoom.roomId}
        onClose={() => setSelectedRoomId(null)}
        onElsewhere={selectElsewhere}
        onJoin={() => selectedRoom && openTable(selectedRoom.roomId)}
        room={selectedRoom}
        yours={selectedRoom !== null && selectedRoom.roomId === activeRoomId}
      />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: nightLobby.sky[0], flex: 1 },
  scene: { flex: 1 },
  createDock: { position: "absolute", left: spacing.gutter, right: spacing.gutter },
  empty: { alignItems: "center", gap: spacing.xs, marginHorizontal: spacing.gutter, paddingHorizontal: spacing.md, paddingVertical: spacing.xl },
  emptyTitle: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.h3, letterSpacing: 1 },
  emptyCopy: { color: nightLobby.text.muted, fontFamily: fonts.rubik, fontSize: fontSize.body, textAlign: "center" },
  section: { gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingTop: spacing.lg },
  sectionHeading: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm, paddingTop: spacing.xs },
  sectionTitle: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.h3, letterSpacing: 1 },
  count: { color: nightLobby.text.muted, fontFamily: fonts.rubikMedium, fontSize: fontSize.small },
  filters: { gap: spacing.xs, paddingBottom: spacing.xs },
  filter: { backgroundColor: "rgba(14,22,48,0.88)", borderColor: "rgba(243,230,196,0.18)", borderRadius: radius.pill, borderWidth: border.thick, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterSelected: { backgroundColor: nightLobby.gold.button[0], borderColor: nightLobby.gold.buttonEdge },
  filterPressed: { opacity: 0.78 },
  filterText: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.small },
  filterTextSelected: { color: nightLobby.gold.buttonText },
  note: { color: nightLobby.text.muted, fontFamily: fonts.rubik, fontSize: fontSize.body, paddingHorizontal: spacing.sm, paddingVertical: spacing.lg },
  dropped: { gap: spacing.md, padding: spacing.md },
  refusal: { color: "#ff9387", fontFamily: fonts.rubikMedium, fontSize: fontSize.body, textAlign: "center" },
  banner: { alignItems: "center", backgroundColor: nightLobby.alert.background, borderColor: nightLobby.alert.border, borderRadius: radius.md, borderWidth: border.thick, flexDirection: "row", gap: spacing.sm, left: spacing.gutter, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, position: "absolute", right: spacing.gutter },
  bannerText: { color: nightLobby.alert.text, flex: 1, fontFamily: fonts.rubikMedium, fontSize: fontSize.small },
  bannerRetry: { borderColor: nightLobby.alert.border, borderRadius: radius.pill, borderWidth: border.thick, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  toast: { alignItems: "center", backgroundColor: nightLobby.cream.face, borderBottomColor: nightLobby.cream.edge, borderBottomWidth: 4, borderRadius: radius.md, flexDirection: "row", gap: spacing.sm, left: spacing.gutter, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, position: "absolute", right: spacing.gutter },
  toastCoin: { backgroundColor: nightLobby.coin.gradient[0], borderColor: nightLobby.coin.gradient[1], borderRadius: radius.pill, borderWidth: 2, height: 28, width: 28 },
  toastCopy: { flex: 1, gap: 2 },
  toastTitle: { color: nightLobby.gold.buttonText, fontFamily: fonts.arcade, fontSize: fontSize.bodyLg },
  toastLine: { color: nightLobby.gold.buttonText, fontFamily: fonts.rubikMedium, fontSize: fontSize.small },
  bannerRetryText: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.small, letterSpacing: 0.8 },
});
