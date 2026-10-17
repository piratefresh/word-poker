/**
 * e2e.ts — the one thing an E2E build changes about the app.
 *
 * `e2e-test` in eas.json builds with `EXPO_PUBLIC_E2E_AUTH_BYPASS=1` so EAS Workflows can
 * drive the table on an emulator or a simulator with nothing behind it: the offline hand is
 * entirely in the app (the dictionary ships in the bundle — `game-rules`' lazy artifact
 * import — the bots run in-process, and the seed the deep link pins is the table's whole
 * randomness), and the only thing a device cannot do offline is sign in, because the table
 * lives behind the guard in `src/app/_layout.tsx`.
 *
 * So the guard takes this build's word for the session instead of asking for one. The flag is
 * inlined at build time, and no other profile sets it: a build without it behaves exactly as
 * before (`E2E_AUTH_BYPASS` folds to `false`), and a run of the web flows is untouched.
 *
 * Never set this outside `e2e-test` — an app built with it boots past the sign-in guard.
 */
export const E2E_AUTH_BYPASS = process.env.EXPO_PUBLIC_E2E_AUTH_BYPASS === "1";
