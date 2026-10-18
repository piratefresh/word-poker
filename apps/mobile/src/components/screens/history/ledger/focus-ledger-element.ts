import { AccessibilityInfo, findNodeHandle, type View } from "react-native";

export function focusLedgerElement(element: View): void {
  const tag = findNodeHandle(element);
  if (tag !== null) AccessibilityInfo.setAccessibilityFocus(tag);
}
