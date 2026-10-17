import type { ReactNode } from "react";

/** aria-hidden alone leaves the turned page's buttons in the keyboard tab order. */
export function PageInteraction({ active, children }: { active: boolean; children: ReactNode }) {
  return <div inert={!active} style={{ position: "absolute", inset: 0 }}>{children}</div>;
}
