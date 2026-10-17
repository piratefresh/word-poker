import type { ReactNode } from "react";

export function PageInteraction({ children }: { active: boolean; children: ReactNode }) {
  return <>{children}</>;
}
