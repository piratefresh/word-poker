import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

export interface CreateTableLayoutProps {
  children: ReactNode;
  actions: ReactNode;
}

export function CreateTableLayout({ children, actions }: CreateTableLayoutProps) {
  return (
    <>
      {/* Expo UI's web sheet leaves its inner container unbounded. Make it share
          the drawer's available height, including Vaul's keyboard resize. */}
      <style>{`
        [data-testid="create-table-sheet"] {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-height: 0;
          overflow: hidden !important;
          padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;
          padding-left: max(16px, env(safe-area-inset-left)) !important;
          padding-right: max(16px, env(safe-area-inset-right)) !important;
        }
        [data-testid="create-table-name-host"] {
          width: 100% !important;
        }
      `}</style>
      <View style={styles.form}>
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
  form: { flex: 1, minHeight: 0 },
  fields: { flex: 1, minHeight: 0 },
});
