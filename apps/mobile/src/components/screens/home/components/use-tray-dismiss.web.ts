import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

export function useTrayDismiss(onClose: () => void): void {
  useFocusEffect(useCallback(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]));
}
