/**
 * invite-sheet.tsx — "Invite a friend": the waiting table's QR code and web link (STO-581).
 *
 * Both are the same URL (`inviteLinkFor`): a friend scans it or opens it, plays in the browser, and
 * signs in as a guest if they have no account. The link stays selectable, because a copy on a
 * non-secure LAN origin can be refused by the browser.
 */

import { BottomSheet, RNHostView } from "@expo/ui";
import * as Clipboard from "expo-clipboard";
import { REFERRAL_REFERRER_GRANT, type FriendsPage } from "@wordpoker/contracts";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { authClient } from "@/auth/client/auth-client";
import { GoldButton } from "@/components/ui/gold-button";
import { border, colors, fonts, fontSize, palette, radius, spacing } from "@/constants/theme";
import { getFriends } from "@/lib/friends-client";
import { inviteLinkFor } from "@/lib/invite-link";
import { webTestID } from "@/lib/web-id";

const QR_SIZE = 200;

type CopyState = "idle" | "copied" | "failed";

const COPY_LABEL: Record<CopyState, string> = {
  idle: "COPY LINK",
  copied: "COPIED",
  failed: "Couldn't copy — select the link instead",
};

export function InviteSheet({
  visible,
  roomId,
  onClose,
}: {
  visible: boolean;
  roomId: string;
  onClose: () => void;
}) {
  const { data: session } = authClient.useSession();
  const account = session !== null && session?.user.isAnonymous !== true;
  // A signed-in account's link carries its friend code, so a friend who signs up through it pays the sharer (STO-582).
  const [page, setPage] = useState<FriendsPage | null>(null);
  useEffect(() => {
    if (!visible || !account) return;
    void getFriends().then(setPage).catch(() => {});
  }, [visible, account]);
  const link = inviteLinkFor(roomId, account ? page?.code : undefined);
  const [copy, setCopy] = useState<CopyState>("idle");

  const close = () => {
    setCopy("idle");
    onClose();
  };

  const copyLink = () => {
    Clipboard.setStringAsync(link)
      .then((ok) => setCopy(ok ? "copied" : "failed"))
      .catch(() => setCopy("failed"));
  };

  return (
    <BottomSheet
      containerColor={palette.felt800}
      isPresented={visible}
      onDismiss={close}
      testID="invite-sheet"
    >
      <RNHostView matchContents>
        <View style={styles.sheet}>
          <Text style={styles.title}>Invite a friend</Text>
          <Text style={styles.kicker}>NO APP NEEDED</Text>
          {account ? (
            <Text style={styles.reward} testID="invite-reward">
              {`Invite friends, earn ${REFERRAL_REFERRER_GRANT.toLocaleString("en-US")} coins`}
            </Text>
          ) : null}

          <View id={webTestID("invite-qr")} style={styles.qr} testID="invite-qr">
            <QRCode size={QR_SIZE} value={link} />
          </View>

          <Text
            id={webTestID("invite-link")}
            selectable
            style={styles.link}
            testID="invite-link"
          >
            {link}
          </Text>

          <GoldButton label={COPY_LABEL[copy]} onPress={copyLink} testID="invite-copy" />
          <Pressable
            accessibilityRole="button"
            id={webTestID("invite-close")}
            onPress={close}
            style={styles.done}
            testID="invite-close"
          >
            <Text style={styles.doneLabel}>Done</Text>
          </Pressable>
        </View>
      </RNHostView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.h3,
  },
  kicker: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 2.2,
  },
  // A QR code needs a light quiet zone around it to scan off a dark felt.
  reward: {
    color: colors.textBright,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.small,
  },
  qr: {
    backgroundColor: "#fff",
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  link: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    color: colors.textBright,
    fontFamily: fonts.mono,
    fontSize: fontSize.small,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlign: "center",
  },
  done: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  doneLabel: {
    color: colors.textDim,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.small,
    letterSpacing: 1,
  },
});
