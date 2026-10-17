import type { LedgerListAccessibilityProps } from "./ledger-list-accessibility";

export function ledgerListAccessibilityProps(label?: string): LedgerListAccessibilityProps {
  return label ? { "aria-label": label } : {};
}
