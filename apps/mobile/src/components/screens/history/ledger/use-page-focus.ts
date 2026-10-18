import { createContext, useContext, useEffect, useRef } from "react";
import type { View } from "react-native";

import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import { useLedgerReadable } from "./ledger-stage";
import { focusLedgerElement } from "./focus-ledger-element";

export const CurrentLedgerPage = createContext(false);

/** Focus follows the visible page, including hardware/browser back and cold links. */
export function usePageFocus() {
  const ref = useRef<View>(null);
  const current = useContext(CurrentLedgerPage);
  const readable = useLedgerReadable();
  const reduced = useReduceMotion();
  useEffect(() => {
    if (!current || !readable) return;
    const timer = setTimeout(() => {
      if (!ref.current) return;
      focusLedgerElement(ref.current);
    }, reduced ? 0 : 750);
    return () => clearTimeout(timer);
  }, [current, readable, reduced]);
  return ref;
}
