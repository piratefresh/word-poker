import { isFriendCode, type Friend } from "@wordpoker/contracts";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authClient } from "@/auth/client/auth-client";
import { useTrayDismiss } from "@/components/screens/home/components/use-tray-dismiss";
import { fonts } from "@/constants/theme";
import { useActiveRoomId } from "@/features/online/room-session";
import { acceptFriend, addFriend, inviteFriend, nudgeFriend, removeFriend } from "@/lib/friends/friends-client";
import { webTestID } from "@/lib/ui/web-id";

import { AddCodeCard } from "./components/add-code-card";
import { BrickWall } from "./components/brick-wall";
import { ClipboardBoard, LOWER_MS } from "./components/clipboard-board";
import { FriendRow } from "./components/friend-row";
import { InviteCard, useShareLink } from "./components/invite-card";
import { PillButton } from "./components/pill-button";
import { useFriendsPage } from "./hooks/use-friends-page";
import { defaultTab, EMPTY_COPY, FRIENDS_TABS, sectionsFor, tabCounts, type FriendsTab } from "./utils/friend-lists";

const TAB_LABEL: Record<FriendsTab, string> = { online: "Online", all: "All", requests: "Requests" };
/** Rows start sliding in as the clipboard lands, one beat apart; later rows (a poll, a tab) come in at once. */
const ROWS_START_MS = 520;
const ROW_STAGGER_MS = 55;
const SETTLED_MS = 1200;
const TOAST_MS = 3000;

export function FriendsScreen() {
  const { data: session } = authClient.useSession();
  const { add, tab } = useLocalSearchParams<{ add?: string; tab?: string }>();
  // An account change discards cached private rows and in-flight reads.
  return <FriendsAccount key={session?.user.id ?? "signed-out"} anonymous={session?.user.isAnonymous === true}
    code={isFriendCode(add) ? add : null} requestedTab={tab === "requests" ? "requests" : null} />;
}

function FriendsAccount({ anonymous, code, requestedTab }: { anonymous: boolean; code: string | null; requestedTab: FriendsTab | null }) {
  const insets = useSafeAreaInsets();
  // Only this route's own params are touched, so the narrow shape is all that's asked of the navigator.
  const navigation = useNavigation<{ setParams: (params: { tab?: string }) => void }>();
  const reduceMotion = useReducedMotion();
  const roomId = useActiveRoomId();
  const { page, message, setMessage, busy, act, refresh } = useFriendsPage(anonymous);
  const { share, sharing, showLink } = useShareLink(page?.code ?? null, setMessage);
  const [picked, setPicked] = useState<FriendsTab | null>(null);
  const [adding, setAdding] = useState(false);
  // A friend link's add card closes for good once used or dismissed; `+ Add` opens an empty one.
  const [usedCode, setUsedCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Each visit remounts the clipboard so it rises again; `settled` ends the opening row stagger.
  const [visit, setVisit] = useState(0);
  const [settled, setSettled] = useState(false);
  const [lowered, setLowered] = useState(false);

  useFocusEffect(useCallback(() => {
    setVisit((count) => count + 1);
    setPicked(null);
    setLowered(false);
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), SETTLED_MS);
    return () => {
      clearTimeout(timer);
      // A push's `?tab=requests` is for that landing only; the tab bar re-sends a route's params.
      navigation.setParams({ tab: undefined });
    };
  }, [navigation]));

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, setMessage]);

  const close = useCallback(() => {
    setLowered(true);
    setTimeout(() => router.navigate("/"), reduceMotion ? 0 : LOWER_MS);
  }, [reduceMotion]);
  useTrayDismiss(close);

  const counts = page ? tabCounts(page) : null;
  const tab = picked ?? requestedTab ?? (page ? defaultTab(page) : "online");
  const sections = page && !anonymous ? sectionsFor(page, tab) : [];
  const subline = anonymous ? "Play together" : !page || !counts ? "Loading friends…" : `${counts.online} of ${counts.all} friends online`;

  // In a room, Invite seats them at it; otherwise it hands out the friend link (STO-584 invites need a room).
  const invite = (friend: Friend) => async (): Promise<boolean> => {
    if (!roomId) {
      await share();
      return false;
    }
    try {
      await inviteFriend(friend.userId, roomId);
      setMessage(`Invite sent to ${friend.name}`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invite couldn't be sent.");
      return false;
    }
  };

  const nudge = (friend: Friend) => async (): Promise<boolean> => {
    try {
      setMessage(await nudgeFriend(friend.userId));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The nudge couldn't be sent.");
      return false;
    }
  };

  // Joining a friend's table is the table's own route; it says so when the table has already started.
  const join = (seat: string) => () => router.push({ pathname: "/online/[roomId]", params: { roomId: seat } });

  let rowIndex = 0;
  const delay = () => (settled ? 0 : ROWS_START_MS) + Math.min(rowIndex++, 12) * ROW_STAGGER_MS;

  return <View style={styles.screen} testID="friends-screen">
    <BrickWall />
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={close} style={styles.back}
        testID="friends-close" id={webTestID("friends-close")}>
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>
      <View style={styles.headerCopy} pointerEvents="none">
        <Text accessibilityRole="header" style={styles.title}>FRIENDS</Text>
        <Text style={styles.subline}>{subline}</Text>
      </View>
      {anonymous || !page ? <View style={styles.addSpacer} /> : (
        <Pressable accessibilityRole="button" accessibilityLabel="Add a friend by code" onPress={() => setAdding((open) => !open)}
          style={styles.add} testID="friends-add" id={webTestID("friends-add")}>
          <Text style={styles.addLabel}>+ Add</Text>
        </Pressable>
      )}
    </View>

    {counts ? <View accessibilityRole="tablist" accessibilityLabel="Friends lists" style={styles.tabs}>
      {FRIENDS_TABS.map((id) => {
        const selected = id === tab;
        const alert = id === "requests" && counts.requests > 0;
        return <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setPicked(id)}
          style={[styles.tab, selected && styles.tabSelected]} testID={`friends-tab-${id}`} id={webTestID(`friends-tab-${id}`)}>
          <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{TAB_LABEL[id]}</Text>
          <Text style={[styles.count, selected && styles.countSelected, alert && styles.countAlert]}>{counts[id]}</Text>
        </Pressable>;
      })}
    </View> : <View style={styles.tabsSpacer} />}

    <View style={styles.boardArea}>
      <ClipboardBoard key={visit} lowered={lowered}>
        <ScrollView contentContainerStyle={styles.paper} showsVerticalScrollIndicator={false} refreshControl={anonymous ? undefined : (
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            void refresh().finally(() => setRefreshing(false));
          }} />
        )}>
          {anonymous ? <View style={styles.empty}>
            <Text style={styles.emptyText}>Sign up to add friends.</Text>
            <PillButton label="Create account" tone="primary" onPress={() => router.push("/sign-up")} testID="friends-sign-up" />
          </View> : <>
            {page && (adding || (code && code !== usedCode)) ? <AddCodeCard initialCode={adding ? "" : code ?? ""} busy={busy}
              onAdd={(entered) => { void act(() => addFriend(entered)); setAdding(false); setUsedCode(code); }}
              onClose={() => { setAdding(false); setUsedCode(code); }} /> : null}
            {sections.map((section) => <View key={section.kind} accessibilityLabel={section.title ?? TAB_LABEL[tab]} style={styles.section}>
              {section.title ? <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, section.kind === "incoming" && styles.sectionAlert]}>{section.title}</Text>
                <Text style={[styles.count, styles.countSelected, section.kind === "incoming" && styles.countAlert]}>{section.rows.length}</Text>
                <View style={[styles.rule, section.kind === "incoming" && styles.ruleAlert]} />
              </View> : null}
              {section.rows.map((friend) => <FriendRow key={friend.userId} friend={friend} kind={section.kind} delay={delay()} busy={busy}
                onAccept={() => { void act(() => acceptFriend(friend.userId)); }}
                onRemove={() => { void act(() => removeFriend(friend.userId)); }}
                onInvite={section.kind === "friends" && friend.status === "online" ? invite(friend) : undefined}
                onJoin={section.kind === "friends" && friend.status === "at-table" && friend.roomId && friend.roomId !== roomId ? join(friend.roomId) : undefined}
                onNudge={section.kind === "friends" && friend.status === "offline" ? nudge(friend) : undefined} />)}
            </View>)}
            {page && sections.length === 0 ? <Text style={[styles.emptyText, styles.emptyLine]}>{EMPTY_COPY[tab]}</Text> : null}
            {page && tab !== "requests" ? <InviteCard code={page.code} referrals={page.referrals} sharing={sharing} showLink={showLink}
              onShare={() => { void share(); }} onMessage={setMessage} /> : null}
          </>}
        </ScrollView>
      </ClipboardBoard>
    </View>

    {message ? <View accessibilityLiveRegion="polite" role="status" style={styles.toast}>
      <Text style={styles.toastText} testID="friends-message">{message}</Text>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#7b3238", overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(255,232,196,0.5)",
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: { fontFamily: fonts.arcade, fontSize: 26, lineHeight: 30, color: "#fff4dc" },
  headerCopy: { flex: 1, alignItems: "center", paddingTop: 2 },
  title: { fontFamily: fonts.arcade, fontSize: 30, letterSpacing: 4, color: "#ffe3ef", textShadowColor: "#ff2a6a", textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } },
  subline: { marginTop: 4, fontFamily: fonts.rubikMedium, fontSize: 12, color: "#ffd6e4" },
  add: { height: 36, marginTop: 2, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#f0bd5a", boxShadow: "0px 3px 0px #9a5f1c", justifyContent: "center" },
  addLabel: { fontFamily: fonts.arcade, fontSize: 15, letterSpacing: 0.5, color: "#3a2210" },
  addSpacer: { width: 40 },
  tabs: {
    flexDirection: "row",
    gap: 4,
    height: 40,
    marginTop: 14,
    marginHorizontal: 16,
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(20,6,12,0.55)",
  },
  tabsSpacer: { height: 54 },
  tab: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  tabSelected: { backgroundColor: "#fffdf6", boxShadow: "0px 2px 6px rgba(0,0,0,0.35)" },
  tabLabel: { fontFamily: fonts.rubikSemiBold, fontSize: 14, color: "#ffe3ef" },
  tabLabelSelected: { color: "#1e1a14" },
  count: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    overflow: "hidden",
    textAlign: "center",
    fontFamily: fonts.rubikSemiBold,
    fontSize: 11,
    lineHeight: 18,
    color: "#ffe3ef",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  countSelected: { color: "#6a6152", backgroundColor: "#efe6d2" },
  countAlert: { color: "#ffffff", backgroundColor: "#e2493a" },
  boardArea: { flex: 1, marginTop: 20, marginHorizontal: 14, marginBottom: 8 },
  paper: { paddingTop: 6, paddingBottom: 20 },
  section: { marginBottom: 6 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 6 },
  sectionTitle: { fontFamily: fonts.hand, fontSize: 20, color: "#6a6152" },
  sectionAlert: { color: "#c0392b" },
  rule: { flex: 1, height: 2, borderRadius: 1, backgroundColor: "rgba(106,97,82,0.25)" },
  ruleAlert: { backgroundColor: "rgba(192,57,43,0.3)" },
  empty: { alignItems: "center", gap: 14, paddingTop: 28 },
  emptyText: { fontFamily: fonts.hand, fontSize: 22, textAlign: "center", color: "#2a2f6a" },
  emptyLine: { marginTop: 28, marginHorizontal: 16 },
  toast: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
    maxWidth: "90%",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#e0974a",
    backgroundColor: "rgba(10,16,30,0.92)",
  },
  toastText: { fontFamily: fonts.rubikMedium, fontSize: 13, textAlign: "center", color: "#fff4dc" },
});
