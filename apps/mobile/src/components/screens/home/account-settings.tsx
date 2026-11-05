/**
 * account-settings.tsx — the Account sheet (STO-1044): the login form's cream menu card, sliding up
 * over the dimmed street with the HUD still showing above it.
 *
 * Every change saves on its own: a switch on tap, the display name on blur or Return, a link once
 * its flow finishes. A felt-green tag drops in near the top of the sheet to confirm each one, so
 * there is no Save or Cancel, only DONE.
 */

import { isPlaceholderEmail } from "@wordpoker/contracts";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInUp, FadeOut, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authClient } from "@/auth/client/auth-client";
import { GAME_CENTER_AVAILABLE, linkGameCenter } from "@/auth/client/game-center";
import { linkSocial, SOCIAL_PROVIDERS, type SocialProvider } from "@/auth/client/social-sign-in";
import { Field, paper } from "@/components/screens/auth/auth-shell";
import { fonts, layout } from "@/constants/theme";
import { MODAL_ORIENTATIONS } from "@/lib/ui/modal-orientations";

import { FELT, FeltPill, Panel, Row, SectionLabel, SmallGoldButton } from "./account-card";
import { DeleteAccount } from "./delete-account";
import { NotificationSettings } from "./notification-settings";

/** Better Auth's provider ids, as the player knows them. */
const LOGIN_METHODS: Record<string, string> = { credential: "Email", "game-center": "Game Center", google: "Google", apple: "Apple" };
/** Placeholder until the real display-name rule is settled (STO-1044's open question). */
export const DISPLAY_NAME_MAX = 16;
const TAG_MS = 1600;
/** The design's sheet starts 112pt down a 54pt status bar: the HUD row's height plus a little air. */
const SHEET_BELOW_SAFE_TOP = 58;

export function displayNameError(value: string): string | null {
  const name = value.trim();
  if (!name) return "Enter a display name.";
  if (name.length > DISPLAY_NAME_MAX) return `Use ${DISPLAY_NAME_MAX} characters or fewer.`;
  return null;
}

export function AccountSettings({ onDismiss }: { onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();
  const isGuest = !!session?.user.isAnonymous;
  const userId = isGuest ? null : session?.user.id;

  // Kept with the account it was read for, so a different (or no) account never shows these.
  const [loaded, setLoaded] = useState<{ userId: string; providers: string[] } | null>(null);
  const providers = userId && loaded?.userId === userId ? loaded.providers : null;
  const [listed, setListed] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let current = true;
    void authClient.listAccounts().then(({ data }) => {
      if (current && data?.length) setLoaded({ userId, providers: data.map((account) => account.providerId) });
    }, () => {});
    return () => { current = false; };
  }, [userId, listed]);

  // The confirmation tag. Its id restarts the drop-in when the same message comes twice.
  const [tag, setTag] = useState<{ id: number; text: string } | null>(null);
  const tagTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = (text: string) => {
    clearTimeout(tagTimer.current);
    setTag((prev) => ({ id: (prev?.id ?? 0) + 1, text }));
    tagTimer.current = setTimeout(() => setTag(null), TAG_MS);
  };
  useEffect(() => () => clearTimeout(tagTimer.current), []);

  // Display name: saved on blur or Return, never while invalid.
  const [name, setName] = useState(session?.user.name ?? "");
  const savedName = useRef((session?.user.name ?? "").trim());
  const [nameSaved, setNameSaved] = useState(false);
  const [nameFailed, setNameFailed] = useState(false);
  const nameError = displayNameError(name);
  const commitName = async () => {
    const next = name.trim();
    if (displayNameError(next) || next === savedName.current) return;
    const previous = savedName.current;
    savedName.current = next;
    setName(next);
    setNameFailed(false);
    try {
      const result = await authClient.updateUser({ name: next });
      if (result.error) throw new Error(result.error.message);
      setNameSaved(true);
      flash("SAVED");
    } catch {
      savedName.current = previous;
      setNameSaved(false);
      setNameFailed(true);
    }
  };

  // Sign-in links: one at a time, since each opens a system flow.
  const [linking, setLinking] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const link = async (provider: "game-center" | SocialProvider) => {
    setLinking(provider);
    setLinkError(null);
    try {
      const result = await (provider === "game-center" ? linkGameCenter() : linkSocial(provider));
      // An identity already linked to another account stays there: nothing merges.
      if (!result.ok) {
        setLinkError(result.message);
        return;
      }
      setListed((n) => n + 1);
      flash(`${LOGIN_METHODS[provider].toUpperCase()} LINKED`);
    } catch {
      setLinkError(`Couldn’t link ${LOGIN_METHODS[provider]}. Try again.`);
    } finally {
      setLinking(null);
    }
  };

  const [deleting, setDeleting] = useState(false);

  const close = () => {
    // A name typed and never blurred still counts: DONE saves it on the way out.
    void commitName();
    onDismiss();
  };

  const displayName = (session?.user.name?.trim() || session?.user.email || "Player").trim();
  const email = session?.user.email && !isPlaceholderEmail(session.user.email) ? session.user.email : null;
  const signedInWith = isGuest
    ? "Guest account"
    : providers?.length
      ? `Signed in with ${providers.includes("credential") ? "email" : LOGIN_METHODS[providers[0]] ?? providers[0]}`
      : "";

  const linkRow = (provider: "game-center" | SocialProvider, linked: { caption: string }, unlinked: { caption: string }) => {
    const isLinked = !!providers?.includes(provider);
    return (
      <Row
        caption={isLinked ? linked.caption : unlinked.caption}
        end={
          isLinked ? (
            <FeltPill label="LINKED" />
          ) : (
            <SmallGoldButton
              busy={linking !== null}
              label={linking === provider ? "LINKING…" : "LINK"}
              onPress={() => { void link(provider); }}
              testID={`account-link-${provider}`}
            />
          )
        }
        key={provider}
        title={LOGIN_METHODS[provider]}
      />
    );
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
      supportedOrientations={MODAL_ORIENTATIONS}
      transparent
      visible
    >
      <Animated.View entering={FadeIn.duration(200)} style={styles.scrim}>
        <Pressable accessibilityLabel="Close account settings" onPress={close} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.springify().damping(18).stiffness(160)}
        style={[styles.sheet, { top: insets.top + SHEET_BELOW_SAFE_TOP }]}
        testID="account-settings"
      >
        <LinearGradient colors={paper.gradient} style={StyleSheet.absoluteFill} />
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[styles.content, { paddingBottom: 34 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View accessibilityLabel={`Avatar for ${displayName}`} accessibilityRole="image" accessible style={styles.avatar}>
              {session?.user.image ? (
                <Image contentFit="cover" source={{ uri: session.user.image }} style={StyleSheet.absoluteFill} />
              ) : (
                <Text style={styles.initial}>{displayName.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.titleBlock}>
              <Text accessibilityRole="header" style={styles.title}>Account</Text>
              {signedInWith ? <Text style={styles.subtitle}>{signedInWith}</Text> : null}
            </View>
            <SmallGoldButton label="DONE" onPress={close} testID="account-done" />
          </View>

          <Field
            autoCapitalize="words"
            autoCorrect={false}
            error={nameError ?? (nameFailed ? "Couldn’t save your name. Try again." : undefined)}
            hint="Other players see this at the table."
            label="Display name"
            labelEnd={nameSaved && !nameError ? <Text style={styles.saved}>✓ SAVED</Text> : undefined}
            onBlur={() => { void commitName(); }}
            onChangeText={(value) => {
              setName(value);
              setNameSaved(false);
            }}
            onSubmitEditing={() => { void commitName(); }}
            placeholder="Shown at the table"
            returnKeyType="done"
            testID="account-display-name"
            value={name}
          />

          {providers ? (
            <View style={styles.section}>
              <SectionLabel>Sign-in</SectionLabel>
              <Panel>
                {providers.includes("credential") ? (
                  <Row caption={email ?? "Email and password"} end={<FeltPill label="SIGNED IN" />} title="Email" />
                ) : null}
                {GAME_CENTER_AVAILABLE || providers.includes("game-center")
                  ? linkRow(
                      "game-center",
                      { caption: "Linked. Your progress follows you to any iPhone." },
                      { caption: "Link to keep your progress on any iPhone." },
                    )
                  : null}
                {(["google", "apple"] as const)
                  .filter((provider) => providers.includes(provider) || SOCIAL_PROVIDERS.includes(provider))
                  .map((provider) =>
                    linkRow(
                      provider,
                      { caption: `Linked. You can sign in with ${LOGIN_METHODS[provider]} too.` },
                      { caption: `Link to sign in with ${LOGIN_METHODS[provider]} too.` },
                    ),
                  )}
              </Panel>
              {linkError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{linkError}</Text> : null}
            </View>
          ) : null}

          {isGuest ? null : <NotificationSettings onSaved={() => flash("SAVED")} />}

          {/* Waits on the sign-in methods, which guests never load: they have no account to delete. */}
          {providers ? (
            <View style={styles.danger}>
              {deleting ? (
                <DeleteAccount onBack={() => setDeleting(false)} onDeleted={onDismiss} providers={providers} />
              ) : (
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setDeleting(true)} style={styles.deleteLink} testID="account-delete">
                  <Text style={styles.deleteLabel}>Delete account</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </ScrollView>

        {tag ? (
          <Animated.View
            accessibilityLiveRegion="polite"
            entering={FadeInUp.springify().damping(14)}
            exiting={FadeOut.duration(200)}
            key={tag.id}
            pointerEvents="none"
            style={styles.tagSlot}
          >
            <View style={styles.tag}>
              <Text accessibilityRole="alert" style={styles.tagLabel} testID="account-tag">{tag.text}</Text>
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(4, 6, 14, 0.6)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  sheet: {
    alignSelf: "center",
    borderTopColor: "#c4743a",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 4,
    bottom: 0,
    boxShadow: "0px -14px 40px rgba(0, 0, 0, 0.6)",
    maxWidth: layout.maxContentWidth,
    overflow: "hidden",
    position: "absolute",
    width: "100%",
  },
  content: { gap: 18, paddingHorizontal: 20, paddingTop: 12 },
  handle: { alignSelf: "center", backgroundColor: "rgba(122, 86, 52, 0.3)", borderRadius: 3, height: 5, width: 42 },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  avatar: {
    alignItems: "center",
    backgroundColor: "#d4a24c",
    borderColor: "#e0974a",
    borderRadius: 32,
    borderWidth: 3,
    boxShadow: "0px 3px 0px #6b3416",
    height: 64,
    justifyContent: "center",
    overflow: "hidden",
    width: 64,
  },
  initial: { color: "#2a1906", fontFamily: fonts.arcade, fontSize: 28 },
  titleBlock: { flex: 1, gap: 5, minWidth: 0 },
  title: { color: paper.ink, fontFamily: fonts.arcade, fontSize: 26, lineHeight: 28 },
  subtitle: { color: paper.body, fontFamily: fonts.rubik, fontSize: 13 },
  saved: { color: "#2f7a52", fontFamily: fonts.rubikSemiBold, fontSize: 12, letterSpacing: 0.72 },
  section: { gap: 6 },
  error: { color: paper.error, fontFamily: fonts.rubikMedium, fontSize: 13, lineHeight: 18 },
  danger: { paddingTop: 6 },
  deleteLink: { alignSelf: "center", paddingHorizontal: 12, paddingVertical: 8 },
  deleteLabel: {
    color: paper.error,
    fontFamily: fonts.rubikSemiBold,
    fontSize: 14,
    textDecorationLine: "underline",
  },
  tagSlot: { alignItems: "center", left: 0, position: "absolute", right: 0, top: 10 },
  tag: {
    backgroundColor: FELT.face,
    borderColor: FELT.edge,
    borderRadius: 999,
    borderWidth: 2,
    boxShadow: "0px 6px 14px rgba(0, 0, 0, 0.45)",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  tagLabel: { color: FELT.ink, fontFamily: fonts.arcade, fontSize: 14, letterSpacing: 0.7 },
});
