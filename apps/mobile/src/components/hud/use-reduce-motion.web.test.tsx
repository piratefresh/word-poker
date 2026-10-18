import { act, renderHook } from "@testing-library/react-native";
import { useReduceMotion } from "./use-reduce-motion.web";

test("reads prefers-reduced-motion synchronously, follows changes and unsubscribes", async () => {
  let matches = true;
  let change: (() => void) | undefined;
  const remove = jest.fn();
  const original = window.matchMedia;
  window.matchMedia = jest.fn(() => ({
    get matches() { return matches; },
    addEventListener: (_: string, listener: () => void) => { change = listener; },
    removeEventListener: remove,
  } as unknown as MediaQueryList));
  try {
    const view = await renderHook(useReduceMotion);
    expect(view.result.current).toBe(true);
    await act(() => { matches = false; change?.(); });
    expect(view.result.current).toBe(false);
    await view.unmount();
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  } finally {
    window.matchMedia = original;
  }
});
