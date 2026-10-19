import { RNHostView } from "@expo/ui";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { nightLobby } from "@/constants/theme";

export interface CreateTableLayoutProps {
  children: ReactNode;
  actions: ReactNode;
}

/** The sheet supplies the safe-area and keyboard bounds; only its fields scroll. */
export function CreateTableLayout({ children, actions }: CreateTableLayoutProps) {
  const insets = useSafeAreaInsets();
  return (
    <RNHostView>
      <View style={[styles.form, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <LinearGradient colors={nightLobby.panel.navy} style={StyleSheet.absoluteFill} />
        <View style={styles.handle} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.fields}
          testID="create-table-scroll"
        >
          {children}
        </ScrollView>
        {actions}
      </View>
    </RNHostView>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, minHeight: 0, paddingHorizontal: 20, borderTopWidth: 2, borderTopColor: "#e0974a", borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: "hidden" },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "#59617b", alignSelf: "center", marginTop: 12, marginBottom: 16 },
  fields: { flex: 1, minHeight: 0 },
});
