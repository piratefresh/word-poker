import * as Clipboard from "expo-clipboard";
import { useRef, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { fonts } from "@/constants/theme";
import { friendLinkFor } from "@/lib/navigation/invite-link";
import { webTestID } from "@/lib/ui/web-id";

import { PillButton } from "./pill-button";

/** Larger than the mock's 46pt so a phone camera reads it from across a table. */
const QR_SIZE = 64;

/** Share your friend link; where the share sheet can't open, the link stays selectable with a copy button. */
export function useShareLink(code: string | null, onMessage: (message: string) => void) {
  const [sharing, setSharing] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const pending = useRef(false);

  const share = async () => {
    if (!code || pending.current) return;
    pending.current = true;
    setSharing(true);
    onMessage("");
    try {
      await Share.share({ message: friendLinkFor(code) });
    } catch (error) {
      // Browsers reject with AbortError when the player dismisses the share sheet.
      if (error instanceof Error && error.name === "AbortError") return;
      setShowLink(true);
      onMessage("Sharing isn't available. Copy or select your link below.");
    } finally {
      pending.current = false;
      setSharing(false);
    }
  };

  return { share, sharing, showLink };
}

export function InviteCard({ code, referrals, sharing, showLink, onShare, onMessage }: {
  code: string;
  referrals: number;
  sharing: boolean;
  showLink: boolean;
  onShare: () => void;
  onMessage: (message: string) => void;
}) {
  const link = friendLinkFor(code);
  const copy = async () => {
    try {
      onMessage(await Clipboard.setStringAsync(link) ? "Link copied." : "Couldn't copy. Select the link instead.");
    } catch {
      onMessage("Couldn't copy. Select the link instead.");
    }
  };

  return (
    <View style={styles.card} testID="friends-invite">
      <View style={styles.top}>
        {/* Scanned off this screen by a friend sitting nearby; the same link Share sends. */}
        <View style={styles.qr} testID="friends-qr" id={webTestID("friends-qr")}
          accessible accessibilityRole="image" accessibilityLabel="QR code for your friend link">
          <QRCode size={QR_SIZE} value={link} color="#2a2410" backgroundColor="#fffdf6" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Put someone on the list</Text>
          <Text style={styles.detail}>{`Your code ${code}`}</Text>
          {referrals > 0 ? <Text style={styles.detail} testID="friends-referrals">{`${referrals} ${referrals === 1 ? "friend" : "friends"} joined through you`}</Text> : null}
          {/* Under the text, so the title gets the full width beside the QR. */}
          <View style={styles.share}>
            <PillButton label="Share" tone="ink" disabled={sharing} onPress={onShare} testID="friends-share" />
          </View>
        </View>
      </View>
      {showLink ? <View style={styles.top}>
        <Text selectable style={[styles.detail, styles.copy]} testID="friends-link" id={webTestID("friends-link")}>{link}</Text>
        <PillButton label="Copy" tone="ink" onPress={() => { void copy(); }} testID="friends-copy" />
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 14, marginHorizontal: 12, padding: 14, gap: 10, borderWidth: 2, borderStyle: "dashed", borderColor: "#d2bf98", borderRadius: 12 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  // A paper ring, then a tan hairline, like the mock's clipped-on code.
  qr: { padding: 3, borderRadius: 8, backgroundColor: "#fffdf6", borderWidth: 1, borderColor: "#c9b896" },
  copy: { flex: 1, minWidth: 0 },
  share: { marginTop: 8, alignSelf: "flex-start" },
  title: { fontFamily: fonts.hand, fontSize: 18, lineHeight: 21, color: "#2a2f6a" },
  detail: { marginTop: 2, fontFamily: fonts.rubikMedium, fontSize: 12, color: "#6a6152" },
});
