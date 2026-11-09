#!/usr/bin/env bash
# check-dependencies.sh — Analyzes dependencies for known risks
# Usage: bash check-dependencies.sh [project-directory]
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

PKG_JSON="${PROJECT_DIR}/package.json"

if [ ! -f "$PKG_JSON" ]; then
  critical "DEP-000" "both" \
    "package.json not found" \
    "Could not analyze dependencies: package.json is missing." \
    "Run this script from the root of the React Native/Expo project." \
    "" "—"
  echo "{\"check\":\"check-dependencies\",\"results\":[${RESULTS[0]}],\"summary\":{\"critical\":1,\"warning\":0,\"info\":0,\"ok\":0}}"
  exit 0
fi

# ─── DEP-001: React Native version ───────────────────────────────────────────

RN_VERSION=$(SCAN_FILE="$PKG_JSON" node -e "
  try {
    const p = require(process.env.SCAN_FILE);
    const v = (p.dependencies && p.dependencies['react-native']) ||
              (p.devDependencies && p.devDependencies['react-native']) || '__MISSING__';
    process.stdout.write(v.replace(/[\^~>=<]/g, '').split('.').slice(0,2).join('.') || '__MISSING__');
  } catch(e) { process.stdout.write('__MISSING__'); }
" 2>/dev/null || echo "__MISSING__")

if [ "$RN_VERSION" != "__MISSING__" ]; then
  RN_MAJOR=$(echo "$RN_VERSION" | cut -d. -f1)
  RN_MINOR=$(echo "$RN_VERSION" | cut -d. -f2)

  if [ "$RN_MAJOR" -eq 0 ] && [ "$RN_MINOR" -lt 73 ] 2>/dev/null; then
    warning "DEP-001" "both" \
      "React Native outdated: 0.${RN_MINOR} (recommended: 0.76+)" \
      "Older versions of React Native may not support the minimum APIs required by the stores or may have known vulnerabilities." \
      "Update to React Native 0.76+ or use the latest LTS version." \
      "https://reactnative.dev/blog" \
      "package.json"
  else
    ok "DEP-001" "both" "React Native up to date: 0.${RN_MINOR}" "" "package.json"
  fi
fi

# ─── DEP-002: Expo SDK Version ────────────────────────────────────────────────

EXPO_VERSION=$(SCAN_FILE="$PKG_JSON" node -e "
  try {
    const p = require(process.env.SCAN_FILE);
    const v = (p.dependencies && p.dependencies['expo']) ||
              (p.devDependencies && p.devDependencies['expo']) || '__MISSING__';
    const clean = v.replace(/[\^~>=<]/g, '');
    const major = parseInt(clean.split('.')[0]) || 0;
    process.stdout.write(major > 0 ? String(major) : '__MISSING__');
  } catch(e) { process.stdout.write('__MISSING__'); }
" 2>/dev/null || echo "__MISSING__")

if [ "$EXPO_VERSION" != "__MISSING__" ]; then
  if [ "$EXPO_VERSION" -lt 51 ] 2>/dev/null; then
    critical "DEP-002" "both" \
      "Expo SDK outdated: SDK ${EXPO_VERSION} (minimum recommended: SDK 51+)" \
      "Older versions of the Expo SDK may not include the mandatory Privacy Manifest for iOS and may have vulnerabilities." \
      "Update to Expo SDK 52 or higher: npx expo upgrade" \
      "https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/" \
      "package.json"
  elif [ "$EXPO_VERSION" -lt 52 ] 2>/dev/null; then
    warning "DEP-002" "both" \
      "Expo SDK ${EXPO_VERSION} — newer version available (SDK 52+)" \
      "Keeping the Expo SDK up to date ensures support for the latest store APIs." \
      "Consider updating: npx expo upgrade" \
      "https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/" \
      "package.json"
  else
    ok "DEP-002" "both" "Expo SDK up to date: SDK ${EXPO_VERSION}" "" "package.json"
  fi
fi

# ─── DEP-003: Data-collecting SDKs — mandatory disclosure ────────────────────

declare -a DATA_COLLECTING_SDKS=(
  "@react-native-firebase/analytics:Collects events, user properties, and device data"
  "@react-native-firebase/crashlytics:Collects crash logs, stack traces, and device data"
  "@amplitude/analytics-react-native:Collects events, sessions, and user properties"
  "react-native-mixpanel:Collects events, properties, and profile data"
  "react-native-fbsdk-next:Collects Facebook data for analytics and advertising"
  "react-native-google-mobile-ads:Collects Advertising ID and behavior data"
  "@segment/analytics-react-native:Collects and forwards events to multiple destinations"
  "react-native-branch:Collects attribution and deep linking data"
  "react-native-appsflyer:Collects install attribution and event data"
  "react-native-adjust:Collects mobile attribution data"
)

DATA_SDK_COUNT=0
for sdk_entry in "${DATA_COLLECTING_SDKS[@]}"; do
  IFS=':' read -r sdk_name sdk_desc <<< "$sdk_entry"
  if grep -q "\"$sdk_name\"" "$PKG_JSON" 2>/dev/null; then
    DATA_SDK_COUNT=$((DATA_SDK_COUNT+1))
    info_r "DEP-003-${DATA_SDK_COUNT}" "both" \
      "SDK collects data: $sdk_name" \
      "${sdk_desc}. Must be declared in Data Safety (Google) and Privacy Labels (Apple)." \
      "Make sure to declare the data collected by ${sdk_name} in the privacy sections of both stores." \
      "https://support.google.com/googleplay/android-developer/answer/10787469" \
      "package.json"
  fi
done

if [ "$DATA_SDK_COUNT" -eq 0 ]; then
  ok "DEP-003" "both" "No third-party data-collecting SDK detected" "" "package.json"
fi

# ─── DEP-004: Deprecated or known-issue packages ─────────────────────────────

declare -a DEPRECATED_PKGS=(
  "@react-native-community/async-storage:Migrated to @react-native-async-storage/async-storage"
  "react-native-camera:Replaced by react-native-vision-camera (more active and maintained)"
  "react-native-fcm:Firebase Cloud Messaging now via @react-native-firebase/messaging"
  "react-native-code-push:CodePush is being discontinued by Visual Studio App Center"
  "react-native-linear-gradient:Use expo-linear-gradient if using Expo"
  "@react-native-community/netinfo:Check compatibility with newer versions of RN"
)

for pkg_entry in "${DEPRECATED_PKGS[@]}"; do
  IFS=':' read -r pkg_name pkg_note <<< "$pkg_entry"
  if grep -q "\"$pkg_name\"" "$PKG_JSON" 2>/dev/null; then
    warning "DEP-004-$(echo "$pkg_name" | tr -d '@/-' | head -c 8)" "both" \
      "Possibly deprecated package: $pkg_name" \
      "${pkg_note}." \
      "Evaluate whether migration to the recommended alternative is necessary." \
      "https://www.npmjs.com/package/${pkg_name}" \
      "package.json"
  fi
done

# ─── DEP-005: npm audit (if available) ───────────────────────────────────────

if command -v npm &>/dev/null && [ -f "${PROJECT_DIR}/package-lock.json" ]; then
  AUDIT_OUTPUT=$(cd "$PROJECT_DIR" && npm audit --json 2>/dev/null || true)
  if [ -n "$AUDIT_OUTPUT" ]; then
    CRITICAL_VULNS=$(echo "$AUDIT_OUTPUT" | node -e "
      let data = '';
      process.stdin.on('data', d => data += d);
      process.stdin.on('end', () => {
        try {
          const r = JSON.parse(data);
          const meta = r.metadata && r.metadata.vulnerabilities;
          process.stdout.write(meta ? String(meta.critical || 0) : '0');
        } catch(e) { process.stdout.write('0'); }
      });
    " 2>/dev/null || echo "0")

    HIGH_VULNS=$(echo "$AUDIT_OUTPUT" | node -e "
      let data = '';
      process.stdin.on('data', d => data += d);
      process.stdin.on('end', () => {
        try {
          const r = JSON.parse(data);
          const meta = r.metadata && r.metadata.vulnerabilities;
          process.stdout.write(meta ? String(meta.high || 0) : '0');
        } catch(e) { process.stdout.write('0'); }
      });
    " 2>/dev/null || echo "0")

    if [ "$CRITICAL_VULNS" -gt 0 ] 2>/dev/null; then
      critical "DEP-005" "security" \
        "npm audit: ${CRITICAL_VULNS} CRITICAL vulnerability(ies) found" \
        "Dependencies with critical vulnerabilities pose a security risk and may cause store rejection." \
        "Run 'npm audit fix' to fix automatically. Manually review those that require intervention." \
        "https://docs.npmjs.com/cli/v10/commands/npm-audit" \
        "package-lock.json"
    elif [ "$HIGH_VULNS" -gt 0 ] 2>/dev/null; then
      warning "DEP-005" "security" \
        "npm audit: ${HIGH_VULNS} high severity vulnerability(ies) found" \
        "Dependencies with high vulnerabilities pose a security risk." \
        "Run 'npm audit' for details and 'npm audit fix' to fix what is possible." \
        "https://docs.npmjs.com/cli/v10/commands/npm-audit" \
        "package-lock.json"
    else
      ok "DEP-005" "security" "npm audit: no critical or high vulnerabilities found" "" "package-lock.json"
    fi
  fi
elif command -v yarn &>/dev/null && [ -f "${PROJECT_DIR}/yarn.lock" ]; then
  info_r "DEP-005" "security" \
    "Check vulnerabilities with yarn audit" \
    "Could not run yarn audit automatically. Run it manually to check for vulnerabilities." \
    "Run 'yarn audit' at the project root and fix the vulnerabilities found." \
    "https://yarnpkg.com/cli/npm/audit" \
    "yarn.lock"
fi

# ─── DEP-006: Dependency licenses ────────────────────────────────────────────

# Check for packages with GPL licenses (incompatible with App Store)
GPL_PACKAGES=$(SCAN_FILE="$PKG_JSON" node -e "
  try {
    const p = require(process.env.SCAN_FILE);
    const deps = {...(p.dependencies||{}), ...(p.devDependencies||{})};
    const gplPkgs = Object.keys(deps).filter(d => d.includes('gpl') || d.includes('GPL'));
    process.stdout.write(gplPkgs.join(', ') || '__NONE__');
  } catch(e) { process.stdout.write('__NONE__'); }
" 2>/dev/null || echo "__NONE__")

if [ "$GPL_PACKAGES" != "__NONE__" ] && [ -n "$GPL_PACKAGES" ]; then
  warning "DEP-006" "apple" \
    "Possible GPL packages detected: $GPL_PACKAGES" \
    "GPL licenses may be incompatible with distribution via the App Store (Apple). Check each dependency." \
    "Review the package licenses and replace them with alternatives using permissive licenses (MIT, Apache 2.0, BSD)." \
    "https://developer.apple.com/app-store/review/guidelines/#5.2.1" \
    "package.json"
else
  ok "DEP-006" "both" "No package with an obvious GPL license detected" "" "package.json"
fi

# ─── Output JSON ──────────────────────────────────────────────────────────────

RESULTS_JSON=""
for r in "${RESULTS[@]}"; do
  [ -z "$RESULTS_JSON" ] && RESULTS_JSON="$r" || RESULTS_JSON="${RESULTS_JSON},${r}"
done

if [ ${#RESULTS[@]} -eq 0 ]; then
  ok "DEP-000" "both" "No dependency issues detected" "" "—"
  RESULTS_JSON="${RESULTS[0]}"
fi

echo "{\"check\":\"check-dependencies\",\"results\":[${RESULTS_JSON}],\"summary\":{\"critical\":${CRITICAL},\"warning\":${WARNING},\"info\":${INFO},\"ok\":${OK}}}"
