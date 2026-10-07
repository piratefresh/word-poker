/** Native Skia is linked into the app: it is ready as soon as the module loads. */
export function skiaReady(): Promise<void> {
  return Promise.resolve();
}
