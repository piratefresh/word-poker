/**
 * with-scene-lifecycle.js — adopt UIKit's scene life cycle on iOS.
 *
 * The iOS 27 SDK refuses to launch an app that does not adopt scenes ("UIScene life cycle is
 * required for apps built with this SDK"). Expo 57 ships the runtime half — `ExpoAppSceneDelegate`
 * (objc `EXExpoAppSceneDelegate`) and the `ExpoReactNativeFactoryProvider` bridge — but SDK 57's
 * native template does not wire it up; SDK 58's does. Until the upgrade, this plugin applies the
 * SDK 58 template's wiring at prebuild:
 *
 * - Info.plist declares a single window scene whose delegate is Expo's own class, so no Swift file
 *   has to be added to the Xcode project.
 * - AppDelegate conforms to `ExpoReactNativeFactoryProvider` and stops creating its own window:
 *   the scene delegate creates it and starts React Native into it.
 *
 * Drop this plugin once the app is on an SDK whose template adopts scenes itself.
 */
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "EXExpoAppSceneDelegate",
      },
    ],
  },
};

// The template's window block: `window = UIWindow(...)` through the `#endif` after
// `startReactNative`. The scene delegate does both now.
const WINDOW_BLOCK =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?#endif\n/;

function adoptScenes(contents) {
  if (contents.includes("ExpoReactNativeFactoryProvider")) return contents;
  if (!WINDOW_BLOCK.test(contents)) {
    throw new Error(
      "with-scene-lifecycle: AppDelegate.swift no longer matches the SDK 57 template; " +
        "update the plugin or drop it if the template adopts scenes itself.",
    );
  }
  return contents
    .replace(
      "class AppDelegate: ExpoAppDelegate {",
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
    )
    .replace(
      WINDOW_BLOCK,
      "    // The window is created and React Native is started by the scene delegate\n" +
        "    // (EXExpoAppSceneDelegate, see Info.plist) under the scene life cycle.\n",
    );
}

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error("with-scene-lifecycle: expected a Swift AppDelegate.");
    }
    mod.modResults.contents = adoptScenes(mod.modResults.contents);
    return mod;
  });
};
