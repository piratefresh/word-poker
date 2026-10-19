import { Button as ExpoButton, Column, Host, RNHostView, Row, Text, type UniversalTextStyle } from "@expo/ui";
import { isFriendCode, type Friend, type FriendsPage } from "@wordpoker/contracts";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState, type ComponentProps } from "react";
import { Share, StyleSheet, Text as NativeText, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { authClient } from "@/auth/client/auth-client";
import { TRAY_EXIT_MS, TrayFrame } from "@/components/screens/home/components/tray-frame";
import { colors, fonts, fontSize, radius, spacing } from "@/constants/theme";
import { acceptFriend, addFriend, getFriends, removeFriend } from "@/lib/friends/friends-client";
import { friendLinkFor } from "@/lib/navigation/invite-link";
import { menuFeedback } from "@/lib/ui/menu-feedback";
import { webTestID } from "@/lib/ui/web-id";

const bodyText = { color: colors.textBright, fontFamily: fonts.sans, fontSize: fontSize.body } satisfies UniversalTextStyle;
const sectionText = { color: colors.goldHi, fontFamily: fonts.monoBold, fontSize: fontSize.small, letterSpacing: 1.4 } satisfies UniversalTextStyle;
const STATUS_LABEL = { online: "Online", "at-table": "At a table", offline: "Offline" } as const;
/** How often an open friends list re-reads, so a friend's status follows the heartbeat. */
const REFRESH_MS = 15_000;
type Section = { title: string; kind: "incoming" | "friends" | "outgoing"; data: Friend[] };

export function FriendsScreen() {
  const { data: session } = authClient.useSession();
  const { add } = useLocalSearchParams<{ add?: string }>();
  // An account change discards cached private rows and in-flight reads.
  return <FriendsAccount key={session?.user.id ?? "signed-out"} anonymous={session?.user.isAnonymous === true} code={isFriendCode(add) ? add : null} />;
}

function FriendsAccount({ anonymous, code }: { anonymous: boolean; code: string | null }) {
  const [page, setPage] = useState<FriendsPage | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showShareLink, setShowShareLink] = useState(false);
  const sharePending = useRef(false);
  const acting = useRef(false);
  const generation = useRef(0);
  useFocusEffect(useCallback(() => {
    const load = () => {
      const current = ++generation.current;
      void getFriends().then((data) => {
        if (generation.current === current) {
          setPage(data);
          setMessage("");
        }
      }).catch((error: unknown) => {
        if (generation.current === current) setMessage(error instanceof Error ? error.message : "Friends couldn't be reached.");
      });
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    if (!anonymous) {
      load();
      timer = setInterval(load, REFRESH_MS);
    }
    return () => {
      clearInterval(timer);
      generation.current++;
    };
  }, [anonymous]));

  const act = async (action: () => Promise<string | void>) => {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    const current = ++generation.current;
    try {
      const result = await action();
      if (current !== generation.current) return;
      setMessage(result ?? "Friends updated.");
      const data = await getFriends();
      if (current === generation.current) setPage(data);
    } catch (error) {
      if (current === generation.current) setMessage(error instanceof Error ? error.message : "Friends couldn't be reached.");
    } finally {
      acting.current = false;
      setBusy(false);
    }
  };

  const sections: Section[] = page && !anonymous ? [
    { title: "REQUESTS", kind: "incoming", data: page.incoming },
    { title: "FRIENDS", kind: "friends", data: page.friends },
    { title: "SENT", kind: "outgoing", data: page.outgoing },
  ] : [];

  const shareLink = async () => {
    if (!page || sharePending.current) return;
    sharePending.current = true;
    setSharing(true);
    setMessage("");
    try {
      await Share.share({ message: friendLinkFor(page.code) });
    } catch (error) {
      // Browsers reject with AbortError when the player dismisses the share sheet.
      if (error instanceof Error && error.name === "AbortError") return;
      setShowShareLink(true);
      setMessage("Sharing isn't available. Copy or select your link below.");
    } finally {
      sharePending.current = false;
      setSharing(false);
    }
  };

  const copyLink = async () => {
    if (!page) return;
    try {
      const copied = await Clipboard.setStringAsync(friendLinkFor(page.code));
      setMessage(copied ? "Link copied." : "Couldn't copy. Select the link instead.");
    } catch {
      setMessage("Couldn't copy. Select the link instead.");
    }
  };

  // The tab is the tray: it rises when the tab gains focus and returns to Home when closed.
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(false);
  const [height, setHeight] = useState(0);
  useFocusEffect(useCallback(() => {
    setShown(true);
    return () => setShown(false);
  }, []));
  const close = useCallback(() => {
    setShown(false);
    setTimeout(() => router.navigate("/"), reduceMotion ? 0 : TRAY_EXIT_MS);
  }, [reduceMotion]);
  const online = page?.friends.filter((friend) => friend.status === "online" || friend.status === "at-table").length ?? 0;
  const subline = anonymous ? "Play together" : !page ? "Loading friends…" : page.friends.length === 0 ? "Add friends to play together"
    : `${page.friends.length} ${page.friends.length === 1 ? "friend" : "friends"} · ${online} online`;

  return <View style={styles.screen} testID="friends-screen" onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
    {shown ? <TrayFrame id="friends" title="FRIENDS" subline={subline} closeLabel="Close friends" onClose={close}
      // Clears the Home header, as the Offline tray does.
      maxHeight={Math.max(180, height - 190)}>
      <Host colorScheme="dark" matchContents={{ vertical: true }} style={{ width: "100%" }} seedColor={colors.gold}>
        <Column alignment="start" spacing={spacing.md}>
          {anonymous ? <>
            <Text textStyle={bodyText}>Sign up to add friends.</Text>
            <Button label="Create account" onPress={() => router.push("/sign-up")} />
          </> : <>
            {page ? <Text textStyle={bodyText}>{`YOUR CODE: ${page.code}`}</Text> : null}
            {page && page.referrals > 0 ? <Text textStyle={bodyText} testID="friends-referrals">{`${page.referrals} ${page.referrals === 1 ? "friend" : "friends"} joined through you`}</Text> : null}
            {page ? <Button label="SHARE" testID="friends-share" disabled={sharing} onPress={() => { void shareLink(); }} /> : null}
            {page && showShareLink ? <>
              <RNHostView matchContents>
                <NativeText selectable style={bodyText} testID="friends-link" id={webTestID("friends-link")}>{friendLinkFor(page.code)}</NativeText>
              </RNHostView>
              <Button label="COPY LINK" testID="friends-copy" onPress={() => { void copyLink(); }} />
            </> : null}
            {code ? <>
              <Text textStyle={bodyText}>{`Add the player with code ${code}?`}</Text>
              <Button label="ADD" testID="friend-add" disabled={busy} onPress={() => { void act(() => addFriend(code)); }} />
            </> : null}
            <Text textStyle={bodyText} testID="friends-message">{message}</Text>
            <Button label="REFRESH" testID="friends-refresh" disabled={busy} onPress={() => { void act(async () => {}); }} variant="outlined" />
            {page && sections.every((section) => section.data.length === 0) ? <Text textStyle={bodyText}>Share your code to add friends.</Text> : null}
          </>}
        </Column>
      </Host>
      {/* ponytail: a plain map, fine for a friends list; virtualize if lists grow past a few hundred. */}
      {sections.filter((section) => section.data.length).map((section) => <View key={section.kind} style={styles.section}>
        <Host matchContents={{ vertical: true }} style={{ width: "100%" }} colorScheme="dark"><Text textStyle={sectionText}>{section.title}</Text></Host>
        {section.data.map((item) => <View key={item.userId} style={styles.row}>
          <Host matchContents={{ vertical: true }} style={{ width: "100%" }} colorScheme="dark" seedColor={colors.gold}>
            <Column alignment="start" spacing={spacing.sm}>
              <Text textStyle={bodyText} testID={`friend-name-${item.userId}`}>{item.status ? `${item.name} · ${STATUS_LABEL[item.status]}` : item.name}</Text>
              <Row spacing={spacing.sm}>
                {section.kind === "incoming" ? <Button label="Accept" disabled={busy} testID={`friend-accept-${item.userId}`} onPress={() => { void act(() => acceptFriend(item.userId)); }} /> : null}
                <Button label={section.kind === "incoming" ? "Decline" : section.kind === "outgoing" ? "Cancel" : "Remove"} disabled={busy}
                  testID={`friend-${section.kind === "incoming" ? "decline" : section.kind === "outgoing" ? "cancel" : "remove"}-${item.userId}`}
                  onPress={() => { void act(() => removeFriend(item.userId)); }} variant="outlined" />
              </Row>
            </Column>
          </Host>
        </View>)}
      </View>)}
    </TrayFrame> : null}
  </View>;
  }
  
  /** Native controls keep their testID; Maestro web reads the surrounding DOM id first. */
  function Button(props: ComponentProps<typeof ExpoButton>) {
    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);
    return <RNHostView matchContents>
      <View
        id={webTestID(props.testID)}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => { setHovered(false); setPressed(false); }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        style={props.disabled ? undefined : menuFeedback(hovered, pressed)}
      >
        <Host matchContents colorScheme="dark" seedColor={colors.gold}><ExpoButton {...props} /></Host>
      </View>
    </RNHostView>;
  }
  
  const styles = StyleSheet.create({
    // Transparent, so the Home street shows behind the tray.
    screen: { flex: 1 },
    section: { gap: spacing.sm },
    row: { padding: spacing.md, borderRadius: radius.card, backgroundColor: "rgba(0,0,0,0.2)" },
  });
