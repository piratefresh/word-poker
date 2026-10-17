export interface LedgerListAccessibilityProps {
  accessibilityLabel?: string;
  "aria-label"?: string;
}

export function ledgerListAccessibilityProps(label?: string): LedgerListAccessibilityProps {
  return label ? { accessibilityLabel: label } : {};
}
