import type { ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { nightLobby } from "@/constants/theme";

export interface CreateTableLayoutProps {
  children: ReactNode;
  actions: ReactNode;
}

export function CreateTableLayout({ children, actions }: CreateTableLayoutProps) {
  const insets = useSafeAreaInsets();
  return (
    <>
      {/* Expo UI's web sheet leaves its inner container unbounded. Make it share
          the drawer's available height, including Vaul's keyboard resize. */}
      <style>{`
        [data-vaul-drawer]:has([data-testid="create-table-sheet"]) {
          height: min(600px, 92dvh) !important;
          padding-top: 0 !important;
          border-radius: 26px 26px 0 0 !important;
          overflow: hidden;
        }
        [data-testid="create-table-sheet"] {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-height: 0;
          overflow: hidden !important;
          padding: 0 !important;
        }
      `}</style>
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
    </>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, minHeight: 0, paddingHorizontal: 20, borderTopWidth: 2, borderTopColor: "#e0974a", borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: "hidden" },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "#59617b", alignSelf: "center", marginTop: 12, marginBottom: 16 },
  fields: { flex: 1, minHeight: 0 },
});
