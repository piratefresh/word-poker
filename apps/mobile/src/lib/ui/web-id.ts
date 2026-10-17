import { Platform } from "react-native";

/**
 * A test id as the page's own element `id`, and nothing at all on a device.
 *
 * Maestro reads an element's identifier off a page in one order: the DOM `id` first, then the
 * aria-label, and only then `data-testid` (its injected `maestro-web.js`). react-native-web puts
 * a test id in `data-testid` and a label in the aria-label, so the controls that carry both — the
 * felt's action row, every tile in the strip — answer to their label in a web flow and to their
 * test id in a device flow, and no single `.maestro/*.yaml` can name them both ways. Handing the
 * test id to `id` as well puts it where the web reads first, so `id:` means the same thing on
 * both platforms. Nothing else reads it: no code selects by element id, and on a device (where
 * `testID` is already the resource id) this returns nothing.
 */
export function webTestID(testID: string | undefined): string | undefined {
  return Platform.OS === "web" ? testID : undefined;
}
