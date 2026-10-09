import { Host, RNHostView } from "@expo/ui";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

export interface CreateTableLayoutProps {
  children: ReactNode;
  actions: ReactNode;
}

/** The sheet supplies the safe-area and keyboard bounds; only its fields scroll. */
export function CreateTableLayout({ children, actions }: CreateTableLayoutProps) {
  return (
    <RNHostView>
      <View style={styles.form}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.fields}
          testID="create-table-scroll"
        >
          <Host matchContents ignoreSafeArea="all" style={styles.content}>
            {children}
          </Host>
        </ScrollView>
        {actions}
      </View>
    </RNHostView>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, minHeight: 0 },
  fields: { flex: 1, minHeight: 0 },
  content: { width: "100%" },
});
