#!/usr/bin/env bash
# check-privacy-manifest.sh — Checks iOS Privacy Manifest (PrivacyInfo.xcprivacy)
# Mandatory since May 2024 for all apps submitted to the App Store
# Usage: bash check-privacy-manifest.sh [project-directory]
# Output: structured JSON to stdout
set -uo pipefail

PROJECT_DIR="${1:-.}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

RESULTS=()
CRITICAL=0; WARNING=0; INFO=0; OK=0

add_result() {
  local id="$1" severity="$2" category="$3" title="$4" description="$5" fix="$6" reference="$7" file="$8"
  local t d f
  t=$(printf '%s' "$title" | sed 's/\\/\\\\/g; s/"/\\"/g')
  d=$(printf '%s' "$description" | sed 's/\\/\\\\/g; s/"/\\"/g')
  f=$(printf '%s' "$fix" | sed 's/\\/\\\\/g; s/"/\\"/g')
  RESULTS+=("{\"id\":\"${id}\",\"severity\":\"${severity}\",\"category\":\"${category}\",\"title\":\"${t}\",\"description\":\"${d}\",\"fix\":\"${f}\",\"reference\":\"${reference}\",\"file\":\"${file}\"}")
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
info_r()   { add_result "$1" "INFO"     "$2" "$3" "$4" "$5" "$6" "$7"; }

APP_JSON="${PROJECT_DIR}/app.json"
IOS_DIR="${PROJECT_DIR}/ios"
PRIVACY_INFO_FILE=""

# ─── Locate PrivacyInfo.xcprivacy ────────────────────────────────────────────

# In bare projects, search for the file
if [ -d "$IOS_DIR" ]; then
  FOUND=$(find "$IOS_DIR" -name "PrivacyInfo.xcprivacy" 2>/dev/null | head -1 || true)
  [ -n "$FOUND" ] && PRIVACY_INFO_FILE="$FOUND"
fi

# ─── PRIV-001: Privacy Manifest existence ────────────────────────────────────

HAS_EXPO_PRIVACY_MANIFEST=false
if [ -f "$APP_JSON" ]; then
  val=$(SCAN_FILE="$APP_JSON" node -e "
    try {
      const a = require(process.env.SCAN_FILE);
      const expo = a.expo || a;
      const pm = expo.ios && expo.ios.privacyManifests;
      process.stdout.write(pm ? 'yes' : 'no');
    } catch(e) { process.stdout.write('no'); }
  " 2>/dev/null || echo "no")
  [ "$val" = "yes" ] && HAS_EXPO_PRIVACY_MANIFEST=true
fi

if [ "$HAS_EXPO_PRIVACY_MANIFEST" = false ] && [ -z "$PRIVACY_INFO_FILE" ]; then
  critical "PRIV-001" "apple" \
    "Privacy Manifest (PrivacyInfo.xcprivacy) not found" \
    "Apple requires a Privacy Manifest for all apps since May 2024. Without it, the app will be rejected. In Expo Managed, configure via expo.ios.privacyManifests in app.json." \
    "Add privacyManifests under expo.ios in app.json with the APIs used and their reasons." \
    "https://docs.expo.dev/guides/apple-privacy/" \
    "app.json"
else
  ok "PRIV-001" "apple" "Privacy Manifest configured" "" \
    "${PRIVACY_INFO_FILE:-app.json}"
fi

# ─── PRIV-002: NSPrivacyAccessedAPITypes ─────────────────────────────────────

# APIs requiring declaration and the modules that use them
# Format: "API_TYPE|recommended_reason|modules_that_use_it"
declare -a REQUIRED_APIS=(
  "NSPrivacyAccessedAPICategoryUserDefaults|C617.1|@react-native-async-storage/async-storage expo-secure-store react-native"
  "NSPrivacyAccessedAPICategoryFileTimestamp|C617.1|react-native expo-file-system expo-media-library"
  "NSPrivacyAccessedAPICategorySystemBootTime|35F9.1|react-native expo-modules-core"
  "NSPrivacyAccessedAPICategoryDiskSpace|E174.1|react-native expo-file-system"
)

for api_entry in "${REQUIRED_APIS[@]}"; do
  IFS='|' read -r api_type reason modules <<< "$api_entry"

  # Check if any module is in the project
  USES_API=false
  for mod in $modules; do
    if grep -q "\"$mod\"" "${PROJECT_DIR}/package.json" 2>/dev/null; then
      USES_API=true
      break
    fi
  done

  [ "$USES_API" = false ] && continue

  # Check if it is declared in the Privacy Manifest
  DECLARED=false

  if [ "$HAS_EXPO_PRIVACY_MANIFEST" = true ] && [ -f "$APP_JSON" ]; then
    check=$(SCAN_FILE="$APP_JSON" SCAN_API="$api_type" node -e "
      try {
        const a = require(process.env.SCAN_FILE);
        const expo = a.expo || a;
        const pm = expo.ios && expo.ios.privacyManifests;
        const apis = (pm && pm.NSPrivacyAccessedAPITypes) || [];
        const found = apis.some(a => a.NSPrivacyAccessedAPIType === process.env.SCAN_API);
        process.stdout.write(found ? 'yes' : 'no');
      } catch(e) { process.stdout.write('no'); }
    " 2>/dev/null || echo "no")
    [ "$check" = "yes" ] && DECLARED=true
  fi

  if [ -n "$PRIVACY_INFO_FILE" ]; then
    if grep -q "$api_type" "$PRIVACY_INFO_FILE" 2>/dev/null; then
      DECLARED=true
    fi
  fi

  CHECK_ID="PRIV-$(echo "$api_type" | grep -oP '[A-Z][a-z]+$' | head -c 3 | tr '[:lower:]' '[:upper:]')$(( RANDOM % 900 + 100 ))"

  if [ "$DECLARED" = false ]; then
    critical "$CHECK_ID" "apple" \
      "${api_type} not declared in the Privacy Manifest" \
      "The module using this API was detected but it is not declared in the Privacy Manifest. Apple will reject the app." \
      "Add ${api_type} with reason ${reason} under expo.ios.privacyManifests.NSPrivacyAccessedAPITypes in app.json." \
      "https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api" \
      "app.json"
  else
    ok "$CHECK_ID" "apple" "${api_type} declared in the Privacy Manifest" "" "app.json"
  fi
done

# ─── PRIV-003: NSPrivacyTracking ─────────────────────────────────────────────

# Check if tracking SDKs are used
USES_TRACKING=false
TRACKING_SDKS="@react-native-firebase/analytics react-native-fbsdk-next @amplitude/analytics-react-native react-native-mixpanel"
for sdk in $TRACKING_SDKS; do
  if grep -q "\"$sdk\"" "${PROJECT_DIR}/package.json" 2>/dev/null; then
    USES_TRACKING=true
    break
  fi
done

if [ "$USES_TRACKING" = true ]; then
  # Check ATT implementation
  HAS_ATT=false
  if grep -q "expo-tracking-transparency\|AppTrackingTransparency" "${PROJECT_DIR}/package.json" 2>/dev/null; then
    HAS_ATT=true
  fi
  if grep -r "requestTrackingPermissionsAsync\|ATTrackingManager\|AppTrackingTransparency" \
     "${PROJECT_DIR}/src" "${PROJECT_DIR}/app" "${PROJECT_DIR}/App.tsx" "${PROJECT_DIR}/App.js" 2>/dev/null | grep -q .; then
    HAS_ATT=true
  fi

  if [ "$HAS_ATT" = false ]; then
    critical "PRIV-003" "apple" \
      "App Tracking Transparency not implemented (tracking SDK detected)" \
      "Analytics/tracking SDKs were detected but App Tracking Transparency (ATT) is not implemented. Mandatory since iOS 14.5." \
      "Install expo-tracking-transparency and request permission before initializing tracking SDKs." \
      "https://docs.expo.dev/versions/latest/sdk/tracking-transparency/" \
      "package.json"
  else
    ok "PRIV-003" "apple" "App Tracking Transparency implemented" "" "—"
  fi

  # NSUserTrackingUsageDescription
  if [ -f "$APP_JSON" ]; then
    val=$(SCAN_FILE="$APP_JSON" node -e "
      try {
        const a = require(process.env.SCAN_FILE);
        const expo = a.expo || a;
        const v = expo.ios && expo.ios.infoPlist && expo.ios.infoPlist.NSUserTrackingUsageDescription;
        process.stdout.write(v || '__MISSING__');
      } catch(e) { process.stdout.write('__MISSING__'); }
    " 2>/dev/null || echo "__MISSING__")

    if [ "$val" = "__MISSING__" ]; then
      critical "PRIV-004" "apple" \
        "NSUserTrackingUsageDescription missing (tracking detected)" \
        "Tracking SDKs were detected. NSUserTrackingUsageDescription is required to request ATT." \
        "Add NSUserTrackingUsageDescription under expo.ios.infoPlist in app.json." \
        "https://developer.apple.com/documentation/bundleresources/information_property_list/nsusertrackingusagedescription" \
        "app.json"
    else
      ok "PRIV-004" "apple" "NSUserTrackingUsageDescription configured" "" "app.json"
    fi
  fi
fi

# ─── PRIV-005: NSPrivacyCollectedDataTypes ────────────────────────────────────

# If there is a Privacy Manifest, check whether NSPrivacyCollectedDataTypes is filled in
if [ "$HAS_EXPO_PRIVACY_MANIFEST" = true ] && [ -f "$APP_JSON" ]; then
  val=$(SCAN_FILE="$APP_JSON" node -e "
    try {
      const a = require(process.env.SCAN_FILE);
      const expo = a.expo || a;
      const pm = expo.ios && expo.ios.privacyManifests;
      const collected = pm && pm.NSPrivacyCollectedDataTypes;
      process.stdout.write(Array.isArray(collected) && collected.length > 0 ? 'yes' : 'no');
    } catch(e) { process.stdout.write('no'); }
  " 2>/dev/null || echo "no")

  if [ "$val" = "no" ]; then
    info_r "PRIV-005" "apple" \
      "NSPrivacyCollectedDataTypes not filled in the Privacy Manifest" \
      "If the app collects user data, declare it in NSPrivacyCollectedDataTypes in the Privacy Manifest." \
      "Add NSPrivacyCollectedDataTypes under expo.ios.privacyManifests with the types of data collected." \
      "https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_data_use_in_privacy_manifests" \
      "app.json"
  else
    ok "PRIV-005" "apple" "NSPrivacyCollectedDataTypes declared in the Privacy Manifest" "" "app.json"
  fi
fi

# ─── PRIV-006: Dependencies requiring Privacy Manifest ───────────────────────

# Known SDKs that have their own privacy manifest requirements
KNOWN_PRIVACY_SDKS=(
  "@sentry/react-native:Sentry collects crash and device data"
  "@react-native-firebase/crashlytics:Firebase Crashlytics collects crash data"
  "react-native-mmkv:MMKV uses NSUserDefaults — declare NSPrivacyAccessedAPICategoryUserDefaults"
  "react-native-device-info:DeviceInfo uses multiple APIs that require declaration"
)

for sdk_entry in "${KNOWN_PRIVACY_SDKS[@]}"; do
  IFS=':' read -r sdk_name sdk_note <<< "$sdk_entry"
  if grep -q "\"$sdk_name\"" "${PROJECT_DIR}/package.json" 2>/dev/null; then
    info_r "PRIV-$(echo "$sdk_name" | tr -d '@/-' | head -c 6 | tr '[:lower:]' '[:upper:]')" "apple" \
      "SDK '${sdk_name}' requires declarations in the Privacy Manifest" \
      "${sdk_note}. Check the SDK documentation for the required declarations." \
      "Consult the ${sdk_name} documentation on Privacy Manifest and add the necessary declarations." \
      "https://docs.expo.dev/guides/apple-privacy/#third-party-libraries" \
      "package.json"
  fi
done

# ─── Output JSON ──────────────────────────────────────────────────────────────

RESULTS_JSON=""
for r in "${RESULTS[@]}"; do
  [ -z "$RESULTS_JSON" ] && RESULTS_JSON="$r" || RESULTS_JSON="${RESULTS_JSON},${r}"
done

if [ ${#RESULTS[@]} -eq 0 ]; then
  ok "PRIV-000" "apple" "No Privacy Manifest issues detected" "" "—"
  RESULTS_JSON="${RESULTS[0]}"
fi

echo "{\"check\":\"check-privacy-manifest\",\"results\":[${RESULTS_JSON}],\"summary\":{\"critical\":${CRITICAL},\"warning\":${WARNING},\"info\":${INFO},\"ok\":${OK}}}"
