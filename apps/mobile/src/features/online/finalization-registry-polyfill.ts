// Hermes has no FinalizationRegistry, and @colyseus/schema touches it at import time.
// ponytail: no-op stub — cleanup callbacks never fire; schema only uses it to free view slots.
if (typeof globalThis.FinalizationRegistry === "undefined") {
  (globalThis as any).FinalizationRegistry = class {
    register() {}
    unregister() {}
  };
}
