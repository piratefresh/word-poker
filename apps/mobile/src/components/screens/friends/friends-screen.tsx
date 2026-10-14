import { Button as ExpoButton, Column, Host, RNHostView, Row, Text, type UniversalTextStyle } from "@expo/ui";
import { isFriendCode, type Friend, type FriendsPage } from "@wordpoker/contracts";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState, type ComponentProps } from "react";
import { SectionList, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authClient } from "@/auth/client/auth-client";
import { colors, fonts, fontSize, layout, radius, spacing } from "@/constants/theme";
import { acceptFriend, addFriend, getFriends, removeFriend } from "@/lib/friends-client";
import { friendLinkFor } from "@/lib/invite-link";
import { webTestID } from "@/lib/web-id";

const titleText = { color: colors.goldHi, fontFamily: fonts.serifBold, fontSize: fontSize.h2 } satisfies UniversalTextStyle;
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
  const acting = useRef(false);
  const generation = useRef(0);
  useFocusEffect(useCallback(() => {
    const load = () => {
      // A refresh mid-action would bump the generation and drop the action's own result.
      if (acting.current) return;
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

  const sections: Section[] = page ? [
    { title: "REQUESTS", kind: "incoming", data: page.incoming },
    { title: "FRIENDS", kind: "friends", data: page.friends },
    { title: "SENT", kind: "outgoing", data: page.outgoing },
  ] : [];

  return <SafeAreaView edges={["top"]} style={styles.screen} testID="friends-screen">
    <SectionList<Friend, Section>
      contentContainerStyle={styles.content}
      sections={anonymous ? [] : sections}
      keyExtractor={(item) => item.userId}
      ListHeaderComponent={<Host colorScheme="dark" matchContents={{ vertical: true }} style={{ width: "100%" }} seedColor={colors.gold}>
        <Column alignment="start" spacing={spacing.md}>
          <Text textStyle={titleText}>Friends</Text>
          {anonymous ? <>
            <Text textStyle={bodyText}>Sign up to add friends.</Text>
            <Button label="Create account" onPress={() => router.push("/sign-up")} />
          </> : <>
            <Text textStyle={bodyText}>{page ? `YOUR CODE: ${page.code}` : "Loading friends…"}</Text>
            {page && page.referrals > 0 ? <Text textStyle={bodyText} testID="friends-referrals">{`${page.referrals} ${page.referrals === 1 ? "friend" : "friends"} joined through you`}</Text> : null}
            {page ? <Button label="SHARE" testID="friends-share" onPress={() => {
              void Share.share({ message: friendLinkFor(page.code) }).catch(() => setMessage("Couldn't share. Try again."));
            }} /> : null}
            {code ? <>
              <Text textStyle={bodyText}>{`Add the player with code ${code}?`}</Text>
              <Button label="ADD" testID="friend-add" disabled={busy} onPress={() => { void act(() => addFriend(code)); }} />
            </> : null}
            <Text textStyle={bodyText} testID="friends-message">{message}</Text>
            <Button label="REFRESH" testID="friends-refresh" disabled={busy} onPress={() => { void act(async () => {}); }} variant="outlined" />
            {page && sections.every((section) => section.data.length === 0) ? <Text textStyle={bodyText}>Share your code to add friends.</Text> : null}
          </>}
        </Column>
      </Host>}
      renderSectionHeader={({ section }) => section.data.length ? <Host matchContents={{ vertical: true }} style={{ width: "100%" }} colorScheme="dark"><Text textStyle={sectionText}>{section.title}</Text></Host> : null}
      renderItem={({ item, section }) => <View style={styles.row}>
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
      </View>}
    />
  </SafeAreaView>;
}

/** Native controls keep their testID; Maestro web reads the surrounding DOM id first. */
function Button(props: ComponentProps<typeof ExpoButton>) {
  return <RNHostView matchContents>
    <View id={webTestID(props.testID)}>
      <Host matchContents colorScheme="dark" seedColor={colors.gold}><ExpoButton {...props} /></Host>
    </View>
  </RNHostView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { alignSelf: "center", width: "100%", maxWidth: layout.maxContentWidth, padding: spacing.gutter, paddingTop: spacing.xxxl, gap: spacing.md },
  row: { padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surfaceStrong },
});
