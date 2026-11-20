import type { Friend } from "@wordpoker/contracts";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInLeft, useReducedMotion } from "react-native-reanimated";

import { fonts } from "@/constants/theme";
import { lastSeenLabel } from "@/lib/friends/last-seen";
import { webTestID } from "@/lib/ui/web-id";

import type { FriendsSection } from "../utils/friend-lists";
import { PillButton } from "./pill-button";

const AVATAR_INKS = ["#4a6fa5", "#8b4f7a", "#c0663a", "#3f7f6a", "#7a6a3f", "#5a5f8a", "#9a4a4a", "#2f6f8f"];
const DOT = { online: "#5fd38a", "at-table": "#7fb2ff", offline: "#8a8a80", request: "#f2c75a" } as const;
const NOTE = { online: "In the lobby", "at-table": "At a table", offline: "Offline" } as const;

function avatarInk(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_INKS[Math.abs(hash) % AVATAR_INKS.length] ?? AVATAR_INKS[0];
}

/**
 * One name on the list: avatar with its presence dot, name, status line, and the row's one action.
 * A friend row long-presses open a Remove choice (also an accessibility action), as the old list's Remove button did.
 * A friend's action follows where they are: Invite in the lobby, Join at a table, Nudge when offline.
 */
export function FriendRow({ friend, kind, delay, busy, onAccept, onRemove, onInvite, onJoin, onNudge }: {
  friend: Friend;
  kind: FriendsSection["kind"];
  /** When the row slides in, in ms; the screen staggers rows after the clipboard lands. */
  delay: number;
  busy: boolean;
  onAccept: () => void;
  onRemove: () => void;
  /** Present for a friend who can be invited (in the lobby). Resolves once the invite is out. */
  onInvite?: () => Promise<boolean>;
  /** Present for a friend at a table whose id is known: take a seat at it. */
  onJoin?: () => void;
  /** Present for an offline friend. Resolves once the nudge is out (false when it wasn't sent). */
  onNudge?: () => Promise<boolean>;
}) {
  const reduceMotion = useReducedMotion();
  const [menu, setMenu] = useState(false);
  const [invited, setInvited] = useState(false);
  const [nudged, setNudged] = useState(false);
  const status = friend.status ?? "offline";
  const quiet = kind === "outgoing" || (kind === "friends" && status === "offline");
  const dot = kind === "incoming" ? DOT.request : kind === "outgoing" ? null : DOT[status];
  const note = kind === "incoming" ? "Wants to be friends" : kind === "outgoing" ? "You asked"
    : status === "offline" ? lastSeenLabel(friend.lastSeen) ?? NOTE.offline : NOTE[status];

  const invite = onInvite && (async () => {
    setInvited(true);
    if (!(await onInvite())) setInvited(false);
  });
  const nudge = onNudge && (async () => {
    setNudged(true);
    if (!(await onNudge())) setNudged(false);
  });

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInLeft.duration(300).delay(delay).withInitialValues({ opacity: 0, transform: [{ translateX: -10 }] })}
    >
      <Pressable
        accessibilityActions={kind === "friends" ? [{ name: "longpress", label: `Remove ${friend.name}` }] : undefined}
        onAccessibilityAction={() => setMenu(true)}
        disabled={kind !== "friends"}
        onLongPress={() => setMenu((open) => !open)}
        style={[styles.row, kind === "incoming" && styles.highlight]}
        testID={`friend-row-${friend.userId}`}
        id={webTestID(`friend-row-${friend.userId}`)}
      >
        <View style={styles.avatarBox}>
          <View style={[styles.avatar, { backgroundColor: avatarInk(friend.userId) }, quiet && styles.faded]}>
            {friend.image ? <Image accessible={false} contentFit="cover" source={{ uri: friend.image }} style={styles.photo} testID={`friend-photo-${friend.userId}`} />
              : <Text style={styles.initial}>{friend.name.slice(0, 1).toUpperCase()}</Text>}
          </View>
          {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={[styles.name, quiet && styles.quietInk]} testID={`friend-name-${friend.userId}`}>{friend.name}</Text>
          <Text numberOfLines={1} style={styles.note} testID={`friend-status-${friend.userId}`} id={webTestID(`friend-status-${friend.userId}`)}>{note}</Text>
        </View>
        {kind === "incoming" ? <View style={styles.pair}>
          <PillButton label="Decline" tone="quiet" accessibilityLabel={`Decline ${friend.name}`} disabled={busy} onPress={onRemove} testID={`friend-decline-${friend.userId}`} />
          <PillButton label="Accept" tone="accept" accessibilityLabel={`Accept ${friend.name}`} disabled={busy} onPress={onAccept} testID={`friend-accept-${friend.userId}`} />
        </View> : kind === "outgoing" ? (
          <PillButton label="Cancel" tone="quiet" accessibilityLabel={`Cancel request to ${friend.name}`} disabled={busy} onPress={onRemove} testID={`friend-cancel-${friend.userId}`} />
        ) : menu ? (
          <PillButton label="Remove" tone="quiet" accessibilityLabel={`Remove ${friend.name}`} disabled={busy} onPress={onRemove} testID={`friend-remove-${friend.userId}`} />
        ) : invite ? (
          <PillButton label={invited ? "Invited ✓" : "Invite"} tone={invited ? "done" : "secondary"} accessibilityLabel={`Invite ${friend.name}`}
            disabled={invited} onPress={() => { void invite(); }} testID={`friend-invite-${friend.userId}`} />
        ) : onJoin ? (
          <PillButton label="Join" tone="primary" accessibilityLabel={`Join ${friend.name}'s table`} onPress={onJoin} testID={`friend-join-${friend.userId}`} />
        ) : nudge ? (
          <PillButton label={nudged ? "Nudged ✓" : "Nudge"} tone={nudged ? "done" : "quiet"} accessibilityLabel={`Nudge ${friend.name}`}
            disabled={nudged} onPress={() => { void nudge(); }} testID={`friend-nudge-${friend.userId}`} />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8, paddingLeft: 14, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: "#ece4d2" },
  highlight: { backgroundColor: "#fff4dc" },
  avatarBox: { width: 44, height: 44 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  photo: { width: 44, height: 44 },
  faded: { opacity: 0.55 },
  initial: { fontFamily: fonts.arcade, fontSize: 20, color: "#fff6e2" },
  dot: { position: "absolute", right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2.5, borderColor: "#fffdf6" },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.rubikSemiBold, fontSize: 16, lineHeight: 19, color: "#1e1a14" },
  quietInk: { color: "#6a6152" },
  note: { fontFamily: fonts.rubikMedium, fontSize: 12.5, color: "#6a6152" },
  pair: { flexDirection: "row", gap: 6 },
});
