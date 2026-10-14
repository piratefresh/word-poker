import { MenuView } from "@expo/ui/community/menu";
import type { ReactNode } from "react";

export interface AccountMenuProps {
  children: ReactNode;
  name: string;
  onSettings: () => void;
  onSignOut: () => void;
}

export function AccountMenu({ children, name, onSettings, onSignOut }: AccountMenuProps) {
  return (
    <MenuView
      actions={[
        { id: "settings", title: "Settings", image: "gearshape" },
        { id: "sign-out", title: "Sign out", image: "rectangle.portrait.and.arrow.right", attributes: { destructive: true } },
      ]}
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === "settings") onSettings();
        if (nativeEvent.event === "sign-out") onSignOut();
      }}
      shouldOpenOnLongPress={false}
      testID="home-account-menu"
      title={name}
    >
      {children}
    </MenuView>
  );
}
