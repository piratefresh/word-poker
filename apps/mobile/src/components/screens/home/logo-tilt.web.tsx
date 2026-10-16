import { useFocusEffect } from "expo-router";
import { useCallback, useRef, type PropsWithChildren } from "react";
import { useReducedMotion } from "react-native-reanimated";

const REST = "rotateX(0deg) rotateY(0deg)";
const MAX_TILT = 12;

export function LogoTilt({ width, children }: PropsWithChildren<{ width: number }>) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useFocusEffect(useCallback(() => {
    const element = ref.current;
    const page = element?.ownerDocument;
    const viewport = page?.defaultView;
    if (!element || !page || !viewport || reduceMotion) return;
    const reset = () => { element.style.transform = REST; };
    // Any pointer: a mouse hovering, or a finger (or phone emulation) dragging across the street.
    const follow = (event: PointerEvent) => {
      const x = Math.max(-1, Math.min(1, event.clientX / viewport.innerWidth * 2 - 1));
      const y = Math.max(-1, Math.min(1, event.clientY / viewport.innerHeight * 2 - 1));
      element.style.transform = `rotateX(${-y * MAX_TILT}deg) rotateY(${x * MAX_TILT}deg)`;
    };
    // A lifted finger settles the logo; a mouse keeps its tilt until it leaves.
    const release = (event: PointerEvent) => { if (event.pointerType !== "mouse") reset(); };
    page.addEventListener("pointermove", follow);
    page.addEventListener("pointerleave", reset);
    page.addEventListener("pointerup", release);
    page.addEventListener("pointercancel", reset);
    viewport.addEventListener("blur", reset);
    return () => {
      page.removeEventListener("pointermove", follow);
      page.removeEventListener("pointerleave", reset);
      page.removeEventListener("pointerup", release);
      page.removeEventListener("pointercancel", reset);
      viewport.removeEventListener("blur", reset);
      reset();
    };
  }, [reduceMotion]));

  return (
    <div style={{ width, perspective: 400, pointerEvents: "none" }}>
      <div ref={ref} data-testid="street-logo-tilt" style={{ transform: REST, transition: reduceMotion ? "none" : "transform 120ms ease-out" }}>
        {children}
      </div>
    </div>
  );
}
