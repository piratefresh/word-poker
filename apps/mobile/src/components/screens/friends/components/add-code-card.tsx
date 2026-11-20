import { isFriendCode } from "@wordpoker/contracts";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { fonts } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

import { PillButton } from "./pill-button";

/**
 * Add a friend by their 8-character code. A friend link (`?add=CODE`) opens it filled in, and the
 * request still waits for an explicit press.
 */
export function AddCodeCard({ initialCode, busy, onAdd, onClose }: {
  initialCode: string;
  busy: boolean;
  onAdd: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  const valid = isFriendCode(code);

  return (
    <View style={styles.card} testID="friends-add-card">
      <Text style={styles.title}>{initialCode ? `Add the player with code ${initialCode}?` : "Add by code"}</Text>
      <View style={styles.line}>
        <TextInput
          accessibilityLabel="Friend code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          onChangeText={(text) => setCode(text.toUpperCase().trim())}
          onSubmitEditing={() => { if (valid) onAdd(code); }}
          placeholder="8-character code"
          placeholderTextColor="#a89a80"
          style={styles.input}
          testID="friends-add-code"
          id={webTestID("friends-add-code")}
          value={code}
        />
        <PillButton label="Add" tone="accept" disabled={busy || !valid} onPress={() => onAdd(code)} testID="friend-add" />
        <PillButton label="Close" tone="quiet" onPress={onClose} testID="friends-add-close" />
      </View>
      {code.length === 8 && !valid ? <Text style={styles.hint}>{"That isn't a friend code."}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: 12, marginBottom: 4, padding: 12, gap: 8, borderRadius: 12, backgroundColor: "#fff4dc", borderWidth: 1.5, borderColor: "#e6d3a8" },
  title: { fontFamily: fonts.hand, fontSize: 20, color: "#2a2f6a" },
  line: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#c9b896",
    backgroundColor: "#ffffff",
    fontFamily: fonts.rubikSemiBold,
    fontSize: 15,
    letterSpacing: 1.5,
    color: "#1e1a14",
  },
  hint: { fontFamily: fonts.rubikMedium, fontSize: 12, color: "#c0392b" },
});
