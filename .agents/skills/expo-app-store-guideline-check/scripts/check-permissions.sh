#!/usr/bin/env bash
# check-permissions.sh — Checks declared vs used permissions
# Usage: bash check-permissions.sh [project-directory]
# Output: structured JSON to stdout
set -uo pipefail

PROJECT_DIR="${1:-.}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

RESULTS=()
CRITICAL=0; WARNING=0; INFO=0; OK=0

add_result() {
  local id="$1" severity="$2" category="$3" title="$4" description="$5" fix="$6" reference="$7" file="$8"
  # Escape strings for JSON using printf
  local t d f
  t=$(printf '%s' "$title" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n' | sed 's/\\n$//')
  d=$(printf '%s' "$description" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n' | sed 's/\\n$//')
  f=$(printf '%s' "$fix" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n' | sed 's/\\n$//')
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

# ─── iOS: NS*UsageDescription ────────────────────────────────────────────────

# Mapping: infoPlist key → requiring module → friendly name
check_ios_permission() {
  local perm_key="$1"
  local modules="$2"
  local check_id="$3"
  local friendly_name="$4"

  # Check if any module is in package.json
  local used=false
  for mod in $modules; do
    if grep -q "\"$mod\"" "${PROJECT_DIR}/package.json" 2>/dev/null; then
      used=true
      break
    fi
  done

  if [ "$used" = false ]; then
    # Check in source code
    for mod in $modules; do
      if grep -r "from '$mod'\|require('$mod')\|import.*$mod" \
         "${PROJECT_DIR}/src" "${PROJECT_DIR}/app" "${PROJECT_DIR}/components" \
         "${PROJECT_DIR}/screens" "${PROJECT_DIR}/lib" 2>/dev/null | grep -q .; then
        used=true
        break
      fi
    done
  fi

  [ "$used" = false ] && return

  # Module detected — check if permission is declared
  local val
  val=$(SCAN_FILE="$APP_JSON" SCAN_KEY="$perm_key" node -e "
    try {
      const a = require(process.env.SCAN_FILE);
      const expo = a.expo || a;
      const v = expo.ios && expo.ios.infoPlist && expo.ios.infoPlist[process.env.SCAN_KEY];
      process.stdout.write(v !== undefined && v !== null ? String(v) : '__MISSING__');
    } catch(e) { process.stdout.write('__MISSING__'); }
  " 2>/dev/null || echo "__MISSING__")

  if [ "$val" = "__MISSING__" ]; then
    critical "$check_id" "apple" \
      "${perm_key} missing (${friendly_name} detected)" \
      "The module requiring ${friendly_name} was detected but ${perm_key} is not declared." \
      "Add ${perm_key} under expo.ios.infoPlist in app.json with a clear description." \
      "https://developer.apple.com/documentation/bundleresources/information_property_list" \
      "app.json"
  elif echo "$val" | grep -iqE "^(this app needs|needs access|requires access|access needed|app needs)$"; then
    warning "${check_id}b" "apple" \
      "${perm_key} has a generic description" \
      "The description '${val}' is too generic. Apple may reject the app." \
      "Rewrite the description explaining the real purpose of the ${friendly_name} usage." \
      "https://developer.apple.com/app-store/review/guidelines/#5.1.1" \
      "app.json"
  else
    ok "$check_id" "apple" "${perm_key} configured" "" "app.json"
  fi
}

if [ -f "$APP_JSON" ]; then
  check_ios_permission "NSCameraUsageDescription"          "expo-camera expo-image-picker react-native-camera"      "PERM-001" "Camera"
  check_ios_permission "NSMicrophoneUsageDescription"      "expo-av expo-audio react-native-audio"                  "PERM-002" "Microphone"
  check_ios_permission "NSLocationWhenInUseUsageDescription" "expo-location react-native-maps @react-native-community/geolocation" "PERM-003" "Location"
  check_ios_permission "NSPhotoLibraryUsageDescription"    "expo-image-picker expo-media-library react-native-image-picker" "PERM-004" "Photo Library"
  check_ios_permission "NSPhotoLibraryAddUsageDescription" "expo-image-picker expo-media-library"                   "PERM-005" "Save to Gallery"
  check_ios_permission "NSContactsUsageDescription"        "expo-contacts react-native-contacts"                    "PERM-006" "Contacts"
  check_ios_permission "NSCalendarsUsageDescription"       "expo-calendar react-native-calendar-events"             "PERM-007" "Calendar"
  check_ios_permission "NSFaceIDUsageDescription"          "expo-local-authentication react-native-biometrics"      "PERM-008" "Face ID / Biometrics"
  check_ios_permission "NSBluetoothAlwaysUsageDescription" "react-native-ble-plx expo-bluetooth"                    "PERM-009" "Bluetooth"
  check_ios_permission "NSMotionUsageDescription"          "expo-sensors react-native-sensors"                      "PERM-010" "Motion Sensors"
fi

# ─── Android: Declared permissions ───────────────────────────────────────────

ANDROID_MANIFEST="${PROJECT_DIR}/android/app/src/main/AndroidManifest.xml"
HAS_ANDROID_MANIFEST=false
[ -f "$ANDROID_MANIFEST" ] && HAS_ANDROID_MANIFEST=true

if [ "$HAS_ANDROID_MANIFEST" = true ]; then
  # Permissions declared in the manifest
  DECLARED_PERMS=$(grep 'uses-permission' "$ANDROID_MANIFEST" | grep -oP 'android\.permission\.\w+' 2>/dev/null || true)

  # PERM-020: CAMERA declared — check usage
  if echo "$DECLARED_PERMS" | grep -q "CAMERA"; then
    if grep -q "expo-camera\|react-native-camera\|expo-image-picker\|react-native-image-picker" \
       "${PROJECT_DIR}/package.json" 2>/dev/null; then
      ok "PERM-020" "google" "CAMERA permission declared and corresponding module present" "" "AndroidManifest.xml"
    else
      warning "PERM-020" "google" \
        "CAMERA permission declared but camera module not detected in package.json" \
        "Unnecessary permissions can cause rejection on Google Play and distrust users." \
        "Remove CAMERA from AndroidManifest if the camera will not be used." \
        "https://support.google.com/googleplay/android-developer/answer/9214102" \
        "AndroidManifest.xml"
    fi
  fi

  # PERM-021: ACCESS_FINE_LOCATION — justify
  if echo "$DECLARED_PERMS" | grep -q "ACCESS_FINE_LOCATION"; then
    if grep -q "expo-location\|react-native-maps\|Geolocation" \
       "${PROJECT_DIR}/package.json" 2>/dev/null; then
      ok "PERM-021" "google" "ACCESS_FINE_LOCATION permission declared and module present" "" "AndroidManifest.xml"
    else
      warning "PERM-021" "google" \
        "ACCESS_FINE_LOCATION declared but location module not detected" \
        "The location permission requires a clear justification in the Data Safety Section." \
        "Remove if location is not used or add the corresponding module." \
        "https://support.google.com/googleplay/android-developer/answer/9214102" \
        "AndroidManifest.xml"
    fi
  fi

  # PERM-022: READ_CONTACTS — high sensitivity
  if echo "$DECLARED_PERMS" | grep -q "READ_CONTACTS\|WRITE_CONTACTS"; then
    warning "PERM-022" "google" \
      "Contacts permission declared — high sensitivity" \
      "Contacts permissions are highly sensitive and require a clear justification in Data Safety and App Review." \
      "Make sure the usage is essential and document it in the Data Safety Section." \
      "https://support.google.com/googleplay/android-developer/answer/10787469" \
      "AndroidManifest.xml"
  fi

  # PERM-023: RECORD_AUDIO
  if echo "$DECLARED_PERMS" | grep -q "RECORD_AUDIO"; then
    ok "PERM-023" "google" "RECORD_AUDIO permission declared" "" "AndroidManifest.xml"
  fi

  # PERM-024: INTERNET (must be present)
  if ! echo "$DECLARED_PERMS" | grep -q "INTERNET"; then
    info_r "PERM-024" "google" \
      "INTERNET permission not declared" \
      "Most React Native apps need the INTERNET permission to function." \
      "Add <uses-permission android:name='android.permission.INTERNET' /> to AndroidManifest.xml" \
      "https://developer.android.com/reference/android/Manifest.permission#INTERNET" \
      "AndroidManifest.xml"
  else
    ok "PERM-024" "google" "INTERNET permission declared" "" "AndroidManifest.xml"
  fi

else
  # No AndroidManifest — check via app.json
  if [ -f "$APP_JSON" ]; then
    ANDROID_PERMS=$(SCAN_FILE="$APP_JSON" node -e "
      try {
        const a = require(process.env.SCAN_FILE);
        const expo = a.expo || a;
        const perms = expo.android && expo.android.permissions;
        if (Array.isArray(perms)) {
          console.log(perms.join('\n'));
        } else {
          console.log('__MISSING__');
        }
      } catch(e) { console.log('__MISSING__'); }
    " 2>/dev/null || echo "__MISSING__")

    if [ "$ANDROID_PERMS" = "__MISSING__" ]; then
      info_r "PERM-030" "google" \
        "Android permissions not explicitly configured in app.json" \
        "For Expo Managed, configure expo.android.permissions to control which permissions are included." \
        "Add 'permissions' under expo.android in app.json to limit to the minimum required." \
        "https://docs.expo.dev/versions/latest/config/app/#permissions" \
        "app.json"
    else
      ok "PERM-030" "google" "Android permissions configured in app.json" "" "app.json"
    fi
  fi
fi

# ─── Output JSON ──────────────────────────────────────────────────────────────

RESULTS_JSON=""
for r in "${RESULTS[@]}"; do
  [ -z "$RESULTS_JSON" ] && RESULTS_JSON="$r" || RESULTS_JSON="${RESULTS_JSON},${r}"
done

# If no results, add a generic OK
if [ ${#RESULTS[@]} -eq 0 ]; then
  ok "PERM-000" "both" "No problematic permissions detected" "" "—"
  RESULTS_JSON="${RESULTS[0]}"
fi

echo "{\"check\":\"check-permissions\",\"results\":[${RESULTS_JSON}],\"summary\":{\"critical\":${CRITICAL},\"warning\":${WARNING},\"info\":${INFO},\"ok\":${OK}}}"
