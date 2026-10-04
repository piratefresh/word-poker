// @ts-check
/**
 * launch-mode.js — the main activity launches `singleTop` (STO-346).
 *
 * The generated manifest carries `singleTask`, and with it Google Play cancels a purchase that
 * leaves the app to be verified elsewhere (a bank's app, a browser) — the return relaunches the
 * activity and RevenueCat's purchase flow is torn down. RevenueCat's Android guidance is
 * `singleTop`. CommonJS rather than TypeScript: `app.json` loads plugins with plain `require`.
 */

const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withSingleTopLaunchMode = (config) =>
  withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    activity.$["android:launchMode"] = "singleTop";

    return mod;
  });

module.exports = withSingleTopLaunchMode;
