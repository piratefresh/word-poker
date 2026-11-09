#!/usr/bin/env bash
# check-data-safety.sh — Checks preparation for Google Play Data Safety Section
# Usage: bash check-data-safety.sh [project-directory]
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
PKG_JSON="${PROJECT_DIR}/package.json"

# ─── DS-001: Target API Level ────────────────────────────────────────────────

# Check targetSdkVersion in app.json (Expo) or build.gradle (bare)
TARGET_SDK="unknown"

if [ -f "$APP_JSON" ]; then
  TARGET_SDK=$(SCAN_FILE="$APP_JSON" node -e "
    try {
      const a = require(process.env.SCAN_FILE);
      const expo = a.expo || a;
      const sdk = expo.android && expo.android.targetSdkVersion;
      process.stdout.write(sdk ? String(sdk) : '__MISSING__');
    } catch(e) { process.stdout.write('__MISSING__'); }
  " 2>/dev/null || echo "__MISSING__")
fi

if [ "$TARGET_SDK" = "__MISSING__" ]; then
  # Try build.gradle
  BUILD_GRADLE="${PROJECT_DIR}/android/app/build.gradle"
  if [ -f "$BUILD_GRADLE" ]; then
    TARGET_SDK=$(grep 'targetSdkVersion' "$BUILD_GRADLE" | grep -oP '\d+' | head -1 || echo "unknown")
  fi
fi

if [ "$TARGET_SDK" = "unknown" ] || [ "$TARGET_SDK" = "__MISSING__" ]; then
  warning "DS-001" "google" \
    "Target SDK Version not detected" \
    "Could not detect targetSdkVersion. New apps in 2025+ need to target API 35 (Android 15)." \
    "Set targetSdkVersion in expo.android.targetSdkVersion or in android/app/build.gradle." \
    "https://support.google.com/googleplay/android-developer/answer/11926878" \
    "app.json"
elif [ "$TARGET_SDK" -lt 34 ] 2>/dev/null; then
  critical "DS-001" "google" \
    "Target SDK Version too low: $TARGET_SDK (minimum: 34 / Android 14)" \
    "Google Play requires targetSdkVersion >= 34 for new apps and updates since August 2024." \
    "Update targetSdkVersion to 35 (Android 15) in app.json or build.gradle." \
    "https://support.google.com/googleplay/android-developer/answer/11926878" \
    "app.json"
elif [ "$TARGET_SDK" -eq 34 ] 2>/dev/null; then
  warning "DS-001" "google" \
    "Target SDK Version: $TARGET_SDK (recommended: 35 / Android 15)" \
    "API 35 (Android 15) is the recommended target for new apps in 2025/2026." \
    "Consider updating to targetSdkVersion 35 for better future compatibility." \
    "https://support.google.com/googleplay/android-developer/answer/11926878" \
    "app.json"
else
  ok "DS-001" "google" "Target SDK Version adequate: $TARGET_SDK" "" "app.json"
fi

# ─── DS-002: Analytics SDKs ──────────────────────────────────────────────────

declare -a ANALYTICS_SDKS=(
  "@react-native-firebase/analytics:Firebase Analytics collects usage and behavior data"
  "@amplitude/analytics-react-native:Amplitude collects usage events and user data"
  "react-native-mixpanel:Mixpanel collects events and user properties"
  "@segment/analytics-react-native:Segment collects and forwards analytics data"
  "react-native-rudderstack:RudderStack collects and forwards analytics events"
  "@datadog/mobile-react-native:Datadog collects performance and error data"
  "react-native-posthog:PostHog collects product events and user data"
)

ANALYTICS_FOUND=()
for sdk_entry in "${ANALYTICS_SDKS[@]}"; do
  IFS=':' read -r sdk_name sdk_desc <<< "$sdk_entry"
  if grep -q "\"$sdk_name\"" "$PKG_JSON" 2>/dev/null; then
    ANALYTICS_FOUND+=("$sdk_name")
    warning "DS-002-$(echo "$sdk_name" | tr -d '@/' | head -c 8)" "google" \
      "Analytics SDK detected: $sdk_name" \
      "${sdk_desc}. Declare this data in the Google Play Data Safety Section." \
      "Go to Google Play Console > App content > Data safety and declare the data collected by ${sdk_name}." \
      "https://support.google.com/googleplay/android-developer/answer/10787469" \
      "package.json"
  fi
done

if [ ${#ANALYTICS_FOUND[@]} -eq 0 ]; then
  ok "DS-002" "google" "No third-party analytics SDK detected" "" "package.json"
fi

# ─── DS-003: Crash Reporting ─────────────────────────────────────────────────

declare -a CRASH_SDKS=(
  "@sentry/react-native:Sentry"
  "@react-native-firebase/crashlytics:Firebase Crashlytics"
  "react-native-bugsnag:Bugsnag"
)

for sdk_entry in "${CRASH_SDKS[@]}"; do
  IFS=':' read -r sdk_name sdk_display <<< "$sdk_entry"
  if grep -q "\"$sdk_name\"" "$PKG_JSON" 2>/dev/null; then
    info_r "DS-003" "google" \
      "Crash reporting SDK detected: $sdk_display" \
      "${sdk_display} collects diagnostic data (crash logs, device info). Declare it in the Data Safety Section." \
      "In the Data Safety Section, declare 'Crash logs' and 'Diagnostics' as automatically collected data." \
      "https://support.google.com/googleplay/android-developer/answer/10787469#zippy=%2Cdiagnostics" \
      "package.json"
    break
  fi
done

# ─── DS-004: Advertising ID ──────────────────────────────────────────────────

USES_AD_ID=false
AD_ID_TRIGGERS="react-native-google-mobile-ads expo-ads-admob @react-native-firebase/in-app-messaging"
for sdk in $AD_ID_TRIGGERS; do
  if grep -q "\"$sdk\"" "$PKG_JSON" 2>/dev/null; then
    USES_AD_ID=true
    break
  fi
done

if [ "$USES_AD_ID" = true ]; then
  critical "DS-004" "google" \
    "Advertising SDK detected — Advertising ID requires disclosure" \
    "Advertising SDKs use the Android Advertising ID. This requires a declaration in the Data Safety Section and the AD_ID permission in the manifest." \
    "Declare 'Device or other IDs > Advertising ID' in the Data Safety Section. Verify that AD_ID is in AndroidManifest." \
    "https://support.google.com/googleplay/android-developer/answer/6048248" \
    "package.json"
else
  ok "DS-004" "google" "No advertising SDK / Advertising ID detected" "" "package.json"
fi

# ─── DS-005: Authentication and account data ─────────────────────────────────

USES_AUTH=false
AUTH_SDKS="@react-native-google-signin/google-signin react-native-fbsdk-next @invertase/react-native-apple-authentication expo-auth-session"
for sdk in $AUTH_SDKS; do
  if grep -q "\"$sdk\"" "$PKG_JSON" 2>/dev/null; then
    USES_AUTH=true
    break
  fi
done

if [ "$USES_AUTH" = true ]; then
  info_r "DS-005" "google" \
    "Social authentication SDK detected" \
    "Authentication via Google/Facebook/Apple collects user account data. Declare it in the Data Safety Section." \
    "In the Data Safety Section, declare 'Account info' if using social authentication or creating accounts." \
    "https://support.google.com/googleplay/android-developer/answer/10787469" \
    "package.json"
fi

# ─── DS-006: Location ────────────────────────────────────────────────────────

USES_LOCATION=false
LOCATION_SDKS="expo-location react-native-maps @react-native-community/geolocation"
for sdk in $LOCATION_SDKS; do
  if grep -q "\"$sdk\"" "$PKG_JSON" 2>/dev/null; then
    USES_LOCATION=true
    break
  fi
done

if [ "$USES_LOCATION" = true ]; then
  warning "DS-006" "google" \
    "Location SDK detected — declare in Data Safety" \
    "The app uses location. In the Data Safety Section, declare whether approximate or precise location is collected, and whether it is used in the background." \
    "In the Data Safety Section, declare 'Location > Approximate location' and/or 'Precise location' as appropriate." \
    "https://support.google.com/googleplay/android-developer/answer/10787469" \
    "package.json"
else
  ok "DS-006" "google" "No location SDK detected" "" "package.json"
fi

# ─── DS-007: File storage ────────────────────────────────────────────────────

USES_STORAGE=false
STORAGE_SDKS="expo-file-system expo-document-picker expo-media-library react-native-fs"
for sdk in $STORAGE_SDKS; do
  if grep -q "\"$sdk\"" "$PKG_JSON" 2>/dev/null; then
    USES_STORAGE=true
    break
  fi
done

if [ "$USES_STORAGE" = true ]; then
  info_r "DS-007" "google" \
    "File storage SDK detected" \
    "The app accesses device storage. Declare in the Data Safety Section if it collects or reads user files." \
    "In the Data Safety Section, declare 'Photos and videos' or 'Files and docs' depending on the content accessed." \
    "https://support.google.com/googleplay/android-developer/answer/10787469" \
    "package.json"
fi

# ─── DS-008: Push Notifications ──────────────────────────────────────────────

USES_PUSH=false
PUSH_SDKS="expo-notifications react-native-push-notification @react-native-firebase/messaging"
for sdk in $PUSH_SDKS; do
  if grep -q "\"$sdk\"" "$PKG_JSON" 2>/dev/null; then
    USES_PUSH=true
    break
  fi
done

if [ "$USES_PUSH" = true ]; then
  info_r "DS-008" "google" \
    "Push notifications SDK detected" \
    "Push notifications may involve collecting device tokens. Declare in the Data Safety Section if applicable." \
    "If you store push tokens on the server, declare 'Device or other IDs' in the Data Safety Section." \
    "https://support.google.com/googleplay/android-developer/answer/10787469" \
    "package.json"
fi

# ─── DS-009: Data Safety form verification ───────────────────────────────────

# Check if there is evidence that the form has been filled out
# (cannot verify directly, but can check for documentation)
DATA_SAFETY_DOC="${PROJECT_DIR}/docs/data-safety.md"
DATA_SAFETY_DOC2="${PROJECT_DIR}/DATA_SAFETY.md"

if [ -f "$DATA_SAFETY_DOC" ] || [ -f "$DATA_SAFETY_DOC2" ]; then
  ok "DS-009" "google" "Data Safety documentation found in the project" "" "docs/data-safety.md"
else
  info_r "DS-009" "google" \
    "No Data Safety documentation in the repository" \
    "It is good practice to keep internal documentation of what was declared in the Google Play Data Safety Section." \
    "Create docs/data-safety.md documenting the data collected. Use the template in templates/data-safety-form.md." \
    "https://support.google.com/googleplay/android-developer/answer/10787469" \
    "—"
fi

# ─── Output JSON ──────────────────────────────────────────────────────────────

RESULTS_JSON=""
for r in "${RESULTS[@]}"; do
  [ -z "$RESULTS_JSON" ] && RESULTS_JSON="$r" || RESULTS_JSON="${RESULTS_JSON},${r}"
done

if [ ${#RESULTS[@]} -eq 0 ]; then
  ok "DS-000" "google" "No Data Safety issues detected" "" "—"
  RESULTS_JSON="${RESULTS[0]}"
fi

echo "{\"check\":\"check-data-safety\",\"results\":[${RESULTS_JSON}],\"summary\":{\"critical\":${CRITICAL},\"warning\":${WARNING},\"info\":${INFO},\"ok\":${OK}}}"
