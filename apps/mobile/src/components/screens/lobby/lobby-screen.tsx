/** The 2a night lobby: headliner, filters, live room list, details, and create. */

import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { RoomSummary } from "@wordpoker/contracts";

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
import { NightLobbyButton } from "./night-lobby-button";
import { ParlorBackground } from "./parlor-background";
import { ParlorNav } from "./parlor-nav";
import { RoomDetailsSheet } from "./room-details-sheet";
import { RoomRow } from "./room-row";

const NAV_ROUTES: Record<HomeNavDestination, Href> = {
  home: "/",
  friends: "/friends",
  history: "/history",
  store: "/store",
};
const TABLE_ENTRY_MS = 900;
const TABLE_ENTRY_ZOOM = 3.4;

export function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { status, rooms, headliner, listRooms, readout, refreshing, error, refresh } = useLobby();
  const activeRoomId = useActiveRoomId();
  const hostedRoomIds = useHostedRoomIds();
  const { data: session } = authClient.useSession();
  const { coins, state: questState } = useQuests();
  const [joining, setJoining] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [filter, setFilter] = useState<LobbyFilter>("All");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const { create } = useLocalSearchParams<{ create?: string }>();
  const [creating, setCreating] = useState(create === "1");
  const travel = useSharedValue(0);
  const travelStarted = useRef(false);

  useFocusEffect(
    useCallback(() => {
      travelStarted.current = false;
      travel.set(0);
    }, [travel]),
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

  const selectedRoom = rooms.find((room) => room.roomId === selectedRoomId) ?? null;
  const filteredRooms = filterLobbyRooms(listRooms, filter);
  const joiningRoom = joining === null ? undefined : rooms.find((room) => room.roomId === joining);
  const banner = refusal ?? (joiningRoom === undefined ? null : `Taking a seat at ${joiningRoom.metadata.name}…`);
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

  const openTable = (room: RoomSummary) => {
    if (room.roomId === activeRoomId) {
      setSelectedRoomId(null);
      travelToTable(room.roomId);
      return;
    }

    setRefusal(null);
    setJoining(room.roomId);
    void joinTable(room.roomId)
      .then(() => {
        setSelectedRoomId(null);
        travelToTable(room.roomId);
      })
      .catch((failure: unknown) => {
        setRefusal(failure instanceof Error ? failure.message : "That table could not be joined.");
        refresh();
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
          <RefreshControl colors={[colors.gold]} onRefresh={refresh} refreshing={refreshing} tintColor={nightLobby.gold.light} />
        }
        testID="lobby-scroll"
      >
        <ParlorNav
          coins={coins}
          level={questState?.level}
          me={session?.user.isAnonymous ? "Guest" : session?.user.name?.trim() || session?.user.email}
          onBack={back}
          readout={currentReadout}
        />

        {headliner ? (
          <FeaturedTableCard
            joining={joining === headliner.roomId}
            onDetails={() => setSelectedRoomId(headliner.roomId)}
            onJoin={() => openTable(headliner)}
            room={headliner}
            yours={headliner.roomId === activeRoomId}
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
              disabled={joining !== null}
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
              {filter === "All" && headliner ? "No other tables yet." : "No rooms match this filter."}
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

      {banner === null ? null : (
        <Text
          style={[styles.banner, joiningRoom === undefined ? styles.bannerRefusal : styles.bannerNotice, { bottom: insets.bottom + 158 }]}
          testID={joiningRoom === undefined ? "lobby-refusal" : "lobby-joining"}
        >
          {banner}
        </Text>
      )}

      <HomeNavRack active="home" onNavigate={(destination) => router.push(NAV_ROUTES[destination])} />

      <CreateTableForm visible={creating} onClose={() => setCreating(false)} onCreated={travelToTable} />
      <RoomDetailsSheet
        hosted={selectedRoom !== null && hostedRoomIds.has(selectedRoom.roomId)}
        joining={selectedRoom !== null && joining === selectedRoom.roomId}
        onClose={() => setSelectedRoomId(null)}
        onJoin={() => selectedRoom && openTable(selectedRoom)}
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
  banner: { borderRadius: radius.md, fontFamily: fonts.rubikMedium, fontSize: fontSize.small, left: spacing.gutter, overflow: "hidden", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, position: "absolute", right: spacing.gutter, textAlign: "center" },
  bannerNotice: { backgroundColor: "rgba(10,16,40,0.95)", color: nightLobby.text.cream },
  bannerRefusal: { backgroundColor: "#351a29", color: "#ffb3a7" },
});
