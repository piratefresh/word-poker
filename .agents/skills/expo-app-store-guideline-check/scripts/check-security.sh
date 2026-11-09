#!/usr/bin/env bash
# check-security.sh — Checks data security practices in the code
# Usage: bash check-security.sh [project-directory]
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

# Source code directories for searching
SRC_DIRS=()
for dir in src app components screens lib hooks services utils store; do
  [ -d "${PROJECT_DIR}/${dir}" ] && SRC_DIRS+=("${PROJECT_DIR}/${dir}")
done
# Add common root files
for f in App.tsx App.js App.ts index.tsx index.js; do
  [ -f "${PROJECT_DIR}/${f}" ] && SRC_DIRS+=("${PROJECT_DIR}/${f}")
done

# ─── SEC-001: AsyncStorage with sensitive data ────────────────────────────────

USES_ASYNC_STORAGE=false
if grep -q "async-storage\|AsyncStorage" "$PKG_JSON" 2>/dev/null; then
  USES_ASYNC_STORAGE=true
fi

if [ "$USES_ASYNC_STORAGE" = true ] && [ ${#SRC_DIRS[@]} -gt 0 ]; then
  # Note: "senha" is kept as a search pattern to detect Portuguese variable names in user code
  SENSITIVE_PATTERNS="token\|password\|senha\|secret\|api_key\|apikey\|auth\|credential\|jwt\|bearer\|session"
  MATCHES=$(grep -r "AsyncStorage.setItem\|AsyncStorage.set" "${SRC_DIRS[@]}" 2>/dev/null | \
    grep -iE "$SENSITIVE_PATTERNS" | head -5 || true)

  if [ -n "$MATCHES" ]; then
    FIRST_MATCH=$(echo "$MATCHES" | head -1 | sed 's/\\/\\\\/g; s/"/\\"/g')
    critical "SEC-001" "security" \
      "AsyncStorage potentially used for sensitive data" \
      "AsyncStorage is unencrypted. Usage with keys that suggest sensitive data was detected. Example: ${FIRST_MATCH}" \
      "Use expo-secure-store or react-native-keychain to store tokens, passwords, and sensitive data." \
      "https://docs.expo.dev/versions/latest/sdk/securestore/" \
      "src/"
  else
    ok "SEC-001" "security" "No suspicious use of AsyncStorage with sensitive data detected" "" "—"
  fi
elif [ "$USES_ASYNC_STORAGE" = false ]; then
  ok "SEC-001" "security" "AsyncStorage not in use" "" "—"
fi

# ─── SEC-002: Secure storage available ───────────────────────────────────────

HAS_SECURE_STORAGE=false
for pkg in "expo-secure-store" "react-native-keychain" "react-native-sensitive-info"; do
  if grep -q "\"$pkg\"" "$PKG_JSON" 2>/dev/null; then
    HAS_SECURE_STORAGE=true
    ok "SEC-002" "security" "Secure storage library present: $pkg" "" "package.json"
    break
  fi
done

if [ "$HAS_SECURE_STORAGE" = false ]; then
  info_r "SEC-002" "security" \
    "No secure storage library found" \
    "If the app stores authentication tokens or sensitive data, use an encrypted storage library." \
    "Install expo-secure-store: npx expo install expo-secure-store" \
    "https://docs.expo.dev/versions/latest/sdk/securestore/" \
    "package.json"
fi

# ─── SEC-003: Hardcoded API keys in source code ───────────────────────────────

if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  # Common patterns for hardcoded API keys
  HARDCODED_PATTERNS='(api_key|apikey|api-key|secret_key|secretkey|private_key)\s*[=:]\s*["\x27][A-Za-z0-9_\-]{20,}'
  MATCHES=$(grep -rEi "$HARDCODED_PATTERNS" "${SRC_DIRS[@]}" 2>/dev/null | \
    grep -v "\.test\.\|\.spec\.\|__mocks__\|placeholder\|your_api_key\|YOUR_KEY" | \
    head -3 || true)

  if [ -n "$MATCHES" ]; then
    critical "SEC-003" "security" \
      "Possible hardcoded API keys in source code" \
      "Hardcoded credentials in code are a serious security risk and may be exposed in repositories." \
      "Move secrets to environment variables (.env) and access them via expo-constants or react-native-config. Never commit .env with real values." \
      "https://docs.expo.dev/guides/environment-variables/" \
      "src/"
  else
    ok "SEC-003" "security" "No obvious hardcoded API key detected in source code" "" "—"
  fi
fi

# ─── SEC-004: Committed .env files with secrets ───────────────────────────────

ENV_FILES_FOUND=false
COMMITTED_ENV=""
for env_file in .env .env.local .env.production .env.staging; do
  if [ -f "${PROJECT_DIR}/${env_file}" ]; then
    ENV_FILES_FOUND=true
    # Check if it is in .gitignore
    if ! grep -q "^${env_file}$\|^${env_file}\s" "${PROJECT_DIR}/.gitignore" 2>/dev/null; then
      COMMITTED_ENV="${COMMITTED_ENV} ${env_file}"
    fi
  fi
done

if [ -n "$COMMITTED_ENV" ]; then
  critical "SEC-004" "security" \
    ".env file is not in .gitignore:${COMMITTED_ENV}" \
    ".env files with secrets that are not in .gitignore may be accidentally committed and exposed." \
    "Add '${COMMITTED_ENV}' to .gitignore. Create a .env.example with example values (without real secrets)." \
    "https://docs.expo.dev/guides/environment-variables/" \
    ".gitignore"
elif [ "$ENV_FILES_FOUND" = true ]; then
  ok "SEC-004" "security" ".env files found and protected by .gitignore" "" ".gitignore"
else
  ok "SEC-004" "security" "No .env file found (check that environment variables are configured)" "" "—"
fi

# ─── SEC-005: HTTP (non-HTTPS) URLs in source code ───────────────────────────

if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  HTTP_MATCHES=$(grep -rE "http://[a-zA-Z0-9]" "${SRC_DIRS[@]}" 2>/dev/null | \
    grep -v "localhost\|127\.0\.0\.1\|0\.0\.0\.0\|http://schemas\|http://www\.w3\.org\|\.test\.\|\.spec\." | \
    head -5 || true)

  if [ -n "$HTTP_MATCHES" ]; then
    FIRST_HTTP=$(echo "$HTTP_MATCHES" | head -1 | sed 's/.*http/http/' | cut -c1-80 | sed 's/"/\\"/g')
    critical "SEC-005" "security" \
      "HTTP (non-HTTPS) URLs detected in code" \
      "HTTP URLs transmit data in plain text. This can cause store rejection and violates best practices. Example: ${FIRST_HTTP}" \
      "Replace all http:// URLs with https://. For Android, add a network security config if necessary." \
      "https://developer.android.com/training/articles/security-config" \
      "src/"
  else
    ok "SEC-005" "security" "No insecure HTTP URL detected in code" "" "—"
  fi
fi

# ─── SEC-006: console.log with sensitive data ────────────────────────────────

if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  # Note: "senha" is kept as a search pattern to detect Portuguese variable names in user code
  SENSITIVE_LOG_PATTERNS="console\.log.*\(.*token\|console\.log.*password\|console\.log.*senha\|console\.log.*secret\|console\.log.*auth\|console\.log.*credential"
  LOG_MATCHES=$(grep -rEi "$SENSITIVE_LOG_PATTERNS" "${SRC_DIRS[@]}" 2>/dev/null | \
    grep -v "\.test\.\|\.spec\." | head -3 || true)

  if [ -n "$LOG_MATCHES" ]; then
    warning "SEC-006" "security" \
      "console.log with possible sensitive data detected" \
      "Logs containing tokens, passwords, or credentials can leak data in production and in device logs." \
      "Remove or replace sensitive console.log calls. Use a logging library that disables logs in production (e.g.: react-native-logs)." \
      "https://reactnative.dev/docs/debugging#examining-console-logs" \
      "src/"
  else
    ok "SEC-006" "security" "No suspicious console.log with sensitive data detected" "" "—"
  fi
fi

# ─── SEC-007: eval() and Function() ──────────────────────────────────────────

if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  EVAL_MATCHES=$(grep -rE "\beval\s*\(|\bnew Function\s*\(" "${SRC_DIRS[@]}" 2>/dev/null | \
    grep -v "\.test\.\|\.spec\.\|node_modules" | head -3 || true)

  if [ -n "$EVAL_MATCHES" ]; then
    warning "SEC-007" "security" \
      "Use of eval() or new Function() detected" \
      "eval() and new Function() are code injection vectors and violate the Content Security Policy. They may cause store rejection." \
      "Refactor the code to avoid eval(). Use alternatives like JSON.parse() for data parsing." \
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval#never_use_eval!" \
      "src/"
  else
    ok "SEC-007" "security" "No use of eval() or new Function() detected" "" "—"
  fi
fi

# ─── SEC-008: SSL Pinning ─────────────────────────────────────────────────────

HAS_SSL_PINNING=false
SSL_PKGS="react-native-ssl-pinning react-native-pinch"
for pkg in $SSL_PKGS; do
  if grep -q "\"$pkg\"" "$PKG_JSON" 2>/dev/null; then
    HAS_SSL_PINNING=true
    break
  fi
done

if [ "$HAS_SSL_PINNING" = true ]; then
  ok "SEC-008" "security" "SSL Pinning implemented" "" "package.json"
else
  info_r "SEC-008" "security" \
    "SSL Pinning not implemented" \
    "SSL Pinning prevents man-in-the-middle attacks even with valid certificates. Recommended for financial and health apps." \
    "Consider implementing SSL Pinning with react-native-ssl-pinning for critical endpoints." \
    "https://owasp.org/www-community/controls/Certificate_and_Public_Key_Pinning" \
    "package.json"
fi

# ─── SEC-009: Expo Constants exposing secrets ─────────────────────────────────

if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  CONSTANTS_SENSITIVE=$(grep -rE "Constants\.(expoConfig|manifest)\.(extra|env)" "${SRC_DIRS[@]}" 2>/dev/null | \
    grep -iE "secret|key|token|password" | head -3 || true)

  if [ -n "$CONSTANTS_SENSITIVE" ]; then
    warning "SEC-009" "security" \
      "Expo Constants accessing possible secrets from extra/env" \
      "Values in expo.extra in app.json are exposed in the app bundle. Do not put secrets there." \
      "Secrets must not be in expo.extra. Use server-side environment variables or EAS Secrets for builds." \
      "https://docs.expo.dev/build-reference/variables/" \
      "src/"
  else
    ok "SEC-009" "security" "No suspicious access to Expo Constants with secrets detected" "" "—"
  fi
fi

# ─── SEC-010: Android Network Security Config ─────────────────────────────────

ANDROID_NET_CONFIG="${PROJECT_DIR}/android/app/src/main/res/xml/network_security_config.xml"
if [ -d "${PROJECT_DIR}/android" ]; then
  if [ -f "$ANDROID_NET_CONFIG" ]; then
    # Check if cleartext is allowed
    if grep -q "cleartextTrafficPermitted=\"true\"" "$ANDROID_NET_CONFIG" 2>/dev/null; then
      warning "SEC-010" "security" \
        "Network Security Config allows cleartext traffic (HTTP)" \
        "cleartextTrafficPermitted='true' allows insecure HTTP connections. Use only in development." \
        "Restrict cleartextTrafficPermitted to specific development domains only, not globally." \
        "https://developer.android.com/training/articles/security-config" \
        "android/app/src/main/res/xml/network_security_config.xml"
    else
      ok "SEC-010" "security" "Network Security Config does not allow cleartext HTTP globally" "" "android/"
    fi
  else
    ok "SEC-010" "security" "No custom Network Security Config (Android secure default)" "" "android/"
  fi
fi

# ─── Output JSON ──────────────────────────────────────────────────────────────

RESULTS_JSON=""
for r in "${RESULTS[@]}"; do
  [ -z "$RESULTS_JSON" ] && RESULTS_JSON="$r" || RESULTS_JSON="${RESULTS_JSON},${r}"
done

if [ ${#RESULTS[@]} -eq 0 ]; then
  ok "SEC-000" "security" "No security issues detected" "" "—"
  RESULTS_JSON="${RESULTS[0]}"
fi

echo "{\"check\":\"check-security\",\"results\":[${RESULTS_JSON}],\"summary\":{\"critical\":${CRITICAL},\"warning\":${WARNING},\"info\":${INFO},\"ok\":${OK}}}"
