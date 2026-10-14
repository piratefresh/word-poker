import { useId, useRef } from "react";

import { colors, fonts, fontSize, radius, spacing } from "@/constants/theme";

import type { AccountMenuProps } from "./account-menu";

export function AccountMenu({ children, name, onSettings, onSignOut }: AccountMenuProps) {
  const id = useId();
  const popover = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const select = (action: () => void) => {
    popover.current?.hidePopover();
    action();
  };

  return (
    <>
      <button
        aria-label={`Account menu for ${name}`}
        data-testid="home-account-menu"
        id="home-account-menu"
        popoverTarget={id}
        ref={trigger}
        style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", borderRadius: radius.pill }}
      >
        {children}
      </button>
      <div
        id={id}
        onToggle={(event) => {
          if (event.newState !== "open") return;
          const bounds = trigger.current?.getBoundingClientRect();
          if (bounds && popover.current) {
            popover.current.style.left = `${bounds.left}px`;
            popover.current.style.top = `${bounds.bottom + spacing.sm}px`;
          }
        }}
        popover="auto"
        ref={popover}
        style={{ margin: 0, padding: spacing.sm, background: colors.bgElevated, color: colors.text, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.card, minWidth: 180 }}
      >
        <div style={{ padding: spacing.sm, fontFamily: fonts.sans, fontSize: fontSize.small, overflowWrap: "anywhere", maxWidth: 240 }}>{name}</div>
        <button onClick={() => select(onSettings)} style={itemStyle}>Settings</button>
        <button onClick={() => select(onSignOut)} style={{ ...itemStyle, color: colors.danger }}>Sign out</button>
      </div>
    </>
  );
}

const itemStyle = {
  display: "block",
  width: "100%",
  padding: spacing.md,
  background: "transparent",
  border: 0,
  color: colors.text,
  fontFamily: fonts.sans,
  fontSize: fontSize.body,
  textAlign: "left",
  cursor: "pointer",
} as const;
