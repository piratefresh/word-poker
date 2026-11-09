#!/usr/bin/env bash
# check-expo-config.sh — Checks app.json / app.config.js configuration
# Usage: bash check-expo-config.sh [project-directory]
# Output: structured JSON to stdout
set -uo pipefail

PROJECT_DIR="${1:-.}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

RESULTS=()
CRITICAL=0
WARNING=0
INFO=0
OK=0

# ─── Helpers ──────────────────────────────────────────────────────────────────

add_result() {
  local id="$1" severity="$2" category="$3" title="$4" description="$5" fix="$6" reference="$7" file="$8"
  RESULTS+=("{\"id\":\"${id}\",\"severity\":\"${severity}\",\"category\":\"${category}\",\"title\":$(echo "$title" | node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync("/dev/stdin","utf8").trim()))' 2>/dev/null || echo "\"${title}\""),\"description\":$(echo "$description" | node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync("/dev/stdin","utf8").trim()))' 2>/dev/null || echo "\"${description}\""),\"fix\":$(echo "$fix" | node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync("/dev/stdin","utf8").trim()))' 2>/dev/null || echo "\"${fix}\""),\"reference\":\"${reference}\",\"file\":\"${file}\"}")
  case "$severity" in
    CRITICAL) CRITICAL=$((CRITICAL+1)) ;;
    WARNING)  WARNING=$((WARNING+1)) ;;
    INFO)     INFO=$((INFO+1)) ;;
    OK)       OK=$((OK+1)) ;;
  esac
}

ok()       { add_result "$1" "OK"       "$2" "$3" "$4" "" "" "$5"; }
critical() { add_result "$1" "CRITICAL" "$2" "$3" "$4" "$5" "$6" "$7"; }
warning()  { add_result "$1" "WARNING"  "$2" "$3" "$4" "$5" "$6" "$7"; }
info()     { add_result "$1" "INFO"     "$2" "$3" "$4" "$5" "$6" "$7"; }

# ─── app.json parsing ─────────────────────────────────────────────────────────

APP_JSON="${PROJECT_DIR}/app.json"

if [ ! -f "$APP_JSON" ]; then
  critical "EXPO-000" "config" \
    "app.json not found" \
    "The app.json file is required for Expo projects." \
    "Create an app.json at the project root with the basic Expo configuration." \
    "https://docs.expo.dev/versions/latest/config/app/" \
    "app.json"
  # Try app.config.js
  if [ ! -f "${PROJECT_DIR}/app.config.js" ] && [ ! -f "${PROJECT_DIR}/app.config.ts" ]; then
    # Neither app.json nor app.config.js — emit results and exit
    echo "{\"check\":\"check-expo-config\",\"results\":[$(IFS=,; echo "${RESULTS[*]}")],\"summary\":{\"critical\":${CRITICAL},\"warning\":${WARNING},\"info\":${INFO},\"ok\":${OK}}}"
    exit 0
  fi
fi

# Extract values from app.json via node
get_val() {
  SCAN_FILE="$APP_JSON" SCAN_KEY="${1}" node -e "
    try {
      const a = require(process.env.SCAN_FILE);
      const expo = a.expo || a;
      const path = process.env.SCAN_KEY.split('.');
      let val = expo;
      for (const k of path) { val = val && val[k]; }
      if (val === undefined || val === null) {
        process.stdout.write('__MISSING__');
      } else {
        process.stdout.write(String(val));
      }
    } catch(e) {
      process.stdout.write('__ERROR__');
    }
  " 2>/dev/null || echo "__ERROR__"
}

get_array() {
  SCAN_FILE="$APP_JSON" SCAN_KEY="${1}" node -e "
    try {
      const a = require(process.env.SCAN_FILE);
      const expo = a.expo || a;
      const path = process.env.SCAN_KEY.split('.');
      let val = expo;
      for (const k of path) { val = val && val[k]; }
      if (Array.isArray(val)) {
        process.stdout.write(val.join('\n'));
      } else {
        process.stdout.write('__MISSING__');
      }
    } catch(e) {
      process.stdout.write('__MISSING__');
    }
  " 2>/dev/null || echo "__MISSING__"
}

# ─── Checks ───────────────────────────────────────────────────────────────────

# EXPO-001: iOS Bundle Identifier
val=$(get_val "ios.bundleIdentifier")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  critical "EXPO-001" "apple" \
    "iOS Bundle Identifier not defined" \
    "expo.ios.bundleIdentifier is required to submit to the App Store." \
    "Add 'bundleIdentifier' under expo.ios in app.json. E.g.: 'com.company.app'" \
    "https://docs.expo.dev/versions/latest/config/app/#bundleidentifier" \
    "app.json"
else
  ok "EXPO-001" "apple" "iOS Bundle Identifier defined: $val" "" "app.json"
fi

# EXPO-002: Android Package
val=$(get_val "android.package")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  critical "EXPO-002" "google" \
    "Android Package not defined" \
    "expo.android.package is required to submit to Google Play." \
    "Add 'package' under expo.android in app.json. E.g.: 'com.company.app'" \
    "https://docs.expo.dev/versions/latest/config/app/#package" \
    "app.json"
else
  ok "EXPO-002" "google" "Android Package defined: $val" "" "app.json"
fi

# EXPO-003: iOS Build Number
val=$(get_val "ios.buildNumber")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  warning "EXPO-003" "apple" \
    "iOS Build Number not defined" \
    "expo.ios.buildNumber must be incremented with each App Store submission." \
    "Add 'buildNumber' under expo.ios in app.json. E.g.: '1'" \
    "https://docs.expo.dev/versions/latest/config/app/#buildnumber" \
    "app.json"
else
  ok "EXPO-003" "apple" "iOS Build Number defined: $val" "" "app.json"
fi

# EXPO-004: Android Version Code
val=$(get_val "android.versionCode")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  warning "EXPO-004" "google" \
    "Android Version Code not defined" \
    "expo.android.versionCode must be an integer incremented with each Google Play submission." \
    "Add 'versionCode' under expo.android in app.json. E.g.: 1" \
    "https://docs.expo.dev/versions/latest/config/app/#versioncode" \
    "app.json"
else
  ok "EXPO-004" "google" "Android Version Code defined: $val" "" "app.json"
fi

# EXPO-005: iOS Privacy Manifest
val=$(get_val "ios.privacyManifests")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  critical "EXPO-005" "apple" \
    "iOS Privacy Manifest not configured" \
    "Apple requires PrivacyInfo.xcprivacy since May 2024. In Expo, configure via expo.ios.privacyManifests in app.json." \
    "Add 'privacyManifests' under expo.ios with NSPrivacyAccessedAPITypes and the APIs used by the app." \
    "https://docs.expo.dev/guides/apple-privacy/" \
    "app.json"
else
  ok "EXPO-005" "apple" "iOS Privacy Manifest configured" "" "app.json"
fi

# EXPO-006: Privacy Policy URL
val_ios=$(get_val "ios.privacyPolicyUrl")
val_privacy=$(get_val "privacyPolicyUrl")
if [ "$val_ios" = "__MISSING__" ] && [ "$val_privacy" = "__MISSING__" ]; then
  critical "EXPO-006" "both" \
    "Privacy Policy URL not found" \
    "Apple and Google require a Privacy Policy. The URL must be configured in app.json and provided in the stores." \
    "Add 'privacyPolicyUrl' in app.json with the URL of your privacy policy." \
    "https://developer.apple.com/app-store/review/guidelines/#privacy" \
    "app.json"
else
  ok "EXPO-006" "both" "Privacy Policy URL configured" "" "app.json"
fi

# EXPO-007: App icon
val=$(get_val "icon")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  warning "EXPO-007" "both" \
    "App icon not configured" \
    "expo.icon is required for submission to both stores." \
    "Add 'icon' in app.json pointing to a 1024x1024 PNG file." \
    "https://docs.expo.dev/versions/latest/config/app/#icon" \
    "app.json"
else
  ok "EXPO-007" "both" "App icon configured: $val" "" "app.json"
fi

# EXPO-008: Splash Screen
val=$(get_val "splash")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  warning "EXPO-008" "both" \
    "Splash Screen not configured" \
    "expo.splash is required for a good user experience and is evaluated during review." \
    "Add a 'splash' configuration in app.json with an image and backgroundColor." \
    "https://docs.expo.dev/versions/latest/config/app/#splash" \
    "app.json"
else
  ok "EXPO-008" "both" "Splash Screen configured" "" "app.json"
fi

# EXPO-009: iOS Tablet support
val=$(get_val "ios.supportsTablet")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  info "EXPO-009" "apple" \
    "supportsTablet not explicitly defined" \
    "Explicitly define whether the app supports iPad to avoid ambiguity during review." \
    "Add 'supportsTablet: true' or 'false' under expo.ios in app.json." \
    "https://developer.apple.com/app-store/review/guidelines/#2.4.1" \
    "app.json"
else
  ok "EXPO-009" "apple" "supportsTablet defined: $val" "" "app.json"
fi

# EXPO-010: App Scheme (Deep Linking)
val=$(get_val "scheme")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  info "EXPO-010" "both" \
    "Scheme (deep linking) not configured" \
    "Configuring a scheme is required for deep linking and Universal Links." \
    "Add 'scheme' in app.json. E.g.: 'myapp'" \
    "https://docs.expo.dev/versions/latest/config/app/#scheme" \
    "app.json"
else
  ok "EXPO-010" "both" "Scheme configured: $val" "" "app.json"
fi

# EXPO-011: App version
val=$(get_val "version")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  critical "EXPO-011" "both" \
    "App version not defined" \
    "expo.version is required. It must follow the semver format (e.g.: 1.0.0)." \
    "Add 'version' in app.json following semver." \
    "https://docs.expo.dev/versions/latest/config/app/#version" \
    "app.json"
else
  ok "EXPO-011" "both" "App version defined: $val" "" "app.json"
fi

# EXPO-012: App name
val=$(get_val "name")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  critical "EXPO-012" "both" \
    "App name not defined" \
    "expo.name is required — it is the name displayed under the icon on the device." \
    "Add 'name' in app.json with the name of your application." \
    "https://docs.expo.dev/versions/latest/config/app/#name" \
    "app.json"
else
  ok "EXPO-012" "both" "App name defined: $val" "" "app.json"
fi

# EXPO-013: Orientation
val=$(get_val "orientation")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  info "EXPO-013" "both" \
    "App orientation not configured" \
    "Setting 'orientation' avoids unexpected rotations that may be evaluated negatively." \
    "Add 'orientation' in app.json: 'portrait', 'landscape', or 'default'." \
    "https://docs.expo.dev/versions/latest/config/app/#orientation" \
    "app.json"
else
  ok "EXPO-013" "both" "Orientation configured: $val" "" "app.json"
fi

# EXPO-014: NSCameraUsageDescription (if camera is used)
USES_CAMERA=false
if grep -r "expo-camera\|react-native-camera\|ImagePicker\|expo-image-picker" "${PROJECT_DIR}/package.json" > /dev/null 2>&1; then
  USES_CAMERA=true
fi

if [ "$USES_CAMERA" = true ]; then
  val=$(get_val "ios.infoPlist.NSCameraUsageDescription")
  if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
    critical "EXPO-014" "apple" \
      "NSCameraUsageDescription missing (camera detected)" \
      "The app uses the camera but does not declare NSCameraUsageDescription. Apple will reject the app." \
      "Add 'NSCameraUsageDescription' under expo.ios.infoPlist in app.json with a clear description of the usage." \
      "https://developer.apple.com/documentation/bundleresources/information_property_list/nscamerausagedescription" \
      "app.json"
  else
    # Check if the description is not generic
    if echo "$val" | grep -iqE "^(this app needs|needs access|requires access|camera access)$"; then
      warning "EXPO-014b" "apple" \
        "NSCameraUsageDescription is too generic" \
        "Apple may reject generic permission descriptions. Describe the actual purpose." \
        "Rewrite the description explaining specifically what the app uses the camera for." \
        "https://developer.apple.com/documentation/bundleresources/information_property_list/nscamerausagedescription" \
        "app.json"
    else
      ok "EXPO-014" "apple" "NSCameraUsageDescription configured" "" "app.json"
    fi
  fi
fi

# EXPO-015: NSLocationWhenInUseUsageDescription (if location is used)
USES_LOCATION=false
if grep -r "expo-location\|react-native-maps\|Geolocation" "${PROJECT_DIR}/package.json" > /dev/null 2>&1; then
  USES_LOCATION=true
fi

if [ "$USES_LOCATION" = true ]; then
  val=$(get_val "ios.infoPlist.NSLocationWhenInUseUsageDescription")
  if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
    critical "EXPO-015" "apple" \
      "NSLocationWhenInUseUsageDescription missing (location detected)" \
      "The app uses location but does not declare NSLocationWhenInUseUsageDescription." \
      "Add 'NSLocationWhenInUseUsageDescription' under expo.ios.infoPlist." \
      "https://docs.expo.dev/versions/latest/sdk/location/#configuration-in-appjsonappconfigjs" \
      "app.json"
  else
    ok "EXPO-015" "apple" "NSLocationWhenInUseUsageDescription configured" "" "app.json"
  fi

  # Background location
  val_bg=$(get_val "ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription")
  if [ "$val_bg" != "__MISSING__" ] && [ "$val_bg" != "__ERROR__" ]; then
    warning "EXPO-015b" "apple" \
      "Background location declared — additional justification required" \
      "Background location requires special approval from Apple. Make sure the usage is essential." \
      "Document the use case in the App Review Notes and in expo.ios.infoPlist.UIBackgroundModes." \
      "https://developer.apple.com/app-store/review/guidelines/#5.1.1" \
      "app.json"
  fi
fi

# EXPO-016: NSMicrophoneUsageDescription (if microphone is used)
USES_MIC=false
if grep -r "expo-av\|react-native-audio\|Audio\." "${PROJECT_DIR}/package.json" > /dev/null 2>&1; then
  USES_MIC=true
fi

if [ "$USES_MIC" = true ]; then
  val=$(get_val "ios.infoPlist.NSMicrophoneUsageDescription")
  if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
    critical "EXPO-016" "apple" \
      "NSMicrophoneUsageDescription missing (audio detected)" \
      "The app uses audio/microphone but does not declare NSMicrophoneUsageDescription." \
      "Add 'NSMicrophoneUsageDescription' under expo.ios.infoPlist." \
      "https://developer.apple.com/documentation/bundleresources/information_property_list/nsmicrophoneusagedescription" \
      "app.json"
  else
    ok "EXPO-016" "apple" "NSMicrophoneUsageDescription configured" "" "app.json"
  fi
fi

# EXPO-017: Android adaptiveIcon
val=$(get_val "android.adaptiveIcon")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  warning "EXPO-017" "google" \
    "Android Adaptive Icon not configured" \
    "Android 8.0+ uses Adaptive Icons. Without it, the icon may appear incorrectly formatted in some launchers." \
    "Add 'adaptiveIcon' under expo.android with 'foregroundImage' and 'backgroundColor'." \
    "https://docs.expo.dev/versions/latest/config/app/#adaptiveicon" \
    "app.json"
else
  ok "EXPO-017" "google" "Android Adaptive Icon configured" "" "app.json"
fi

# EXPO-018: App slug
val=$(get_val "slug")
if [ "$val" = "__MISSING__" ] || [ "$val" = "__ERROR__" ]; then
  warning "EXPO-018" "both" \
    "App slug not defined" \
    "expo.slug is required for publishing on Expo and EAS Build." \
    "Add 'slug' in app.json. It must be unique and in kebab-case." \
    "https://docs.expo.dev/versions/latest/config/app/#slug" \
    "app.json"
else
  ok "EXPO-018" "both" "Slug defined: $val" "" "app.json"
fi

# ─── Output JSON ──────────────────────────────────────────────────────────────

RESULTS_JSON=""
for r in "${RESULTS[@]}"; do
  [ -z "$RESULTS_JSON" ] && RESULTS_JSON="$r" || RESULTS_JSON="${RESULTS_JSON},${r}"
done

echo "{\"check\":\"check-expo-config\",\"results\":[${RESULTS_JSON}],\"summary\":{\"critical\":${CRITICAL},\"warning\":${WARNING},\"info\":${INFO},\"ok\":${OK}}}"
