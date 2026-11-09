#!/usr/bin/env bash
# scan-project.sh — Main orchestrator for the Mobile App Compliance Checker
# Usage: bash scan-project.sh [project-directory]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-.}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
REPORT_DIR="${PROJECT_DIR}/.compliance-report"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/report_${TIMESTAMP}.md"
RESULTS_DIR="${REPORT_DIR}/results_${TIMESTAMP}"

# Terminal output colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
log_ok()    { echo -e "${GREEN}✅${NC} $*"; }
log_warn()  { echo -e "${YELLOW}⚠️${NC}  $*"; }
log_error() { echo -e "${RED}🔴${NC} $*"; }
log_bold()  { echo -e "${BOLD}$*${NC}"; }

# ─── Project Type Detection ───────────────────────────────────────────────────

detect_project_type() {
  local dir="$1"

  if [ ! -f "${dir}/package.json" ]; then
    echo "unknown"
    return
  fi

  # Expo Managed or Bare
  if [ -f "${dir}/app.json" ]; then
    local has_expo_key
    has_expo_key=$(SCAN_FILE="${dir}/app.json" node -e "
      try {
        const a = require(process.env.SCAN_FILE);
        console.log(a.expo ? 'yes' : 'no');
      } catch(e) { console.log('no'); }
    " 2>/dev/null || echo "no")

    if [ "$has_expo_key" = "yes" ]; then
      if [ -d "${dir}/ios" ] || [ -d "${dir}/android" ]; then
        echo "expo-bare"
      else
        echo "expo-managed"
      fi
      return
    fi
  fi

  # app.config.js/ts
  if [ -f "${dir}/app.config.js" ] || [ -f "${dir}/app.config.ts" ]; then
    echo "expo-bare"
    return
  fi

  # Pure React Native
  if grep -q '"react-native"' "${dir}/package.json" 2>/dev/null; then
    echo "react-native"
    return
  fi

  echo "unknown"
}

collect_basic_info() {
  local dir="$1"
  APP_NAME="Unknown"
  APP_VERSION="Unknown"
  APP_SDK_VERSION="Unknown"
  PLATFORMS=""

  if [ -f "${dir}/app.json" ]; then
    APP_NAME=$(SCAN_FILE="${dir}/app.json" node -e "
      try {
        const a = require(process.env.SCAN_FILE);
        console.log((a.expo && a.expo.name) || a.name || 'Unknown');
      } catch(e) { console.log('Unknown'); }
    " 2>/dev/null || echo "Unknown")

    APP_VERSION=$(SCAN_FILE="${dir}/app.json" node -e "
      try {
        const a = require(process.env.SCAN_FILE);
        console.log((a.expo && a.expo.version) || a.version || 'Unknown');
      } catch(e) { console.log('Unknown'); }
    " 2>/dev/null || echo "Unknown")

    APP_SDK_VERSION=$(SCAN_FILE="${dir}/app.json" node -e "
      try {
        const a = require(process.env.SCAN_FILE);
        console.log((a.expo && a.expo.sdkVersion) || 'Unknown');
      } catch(e) { console.log('Unknown'); }
    " 2>/dev/null || echo "Unknown")
  elif [ -f "${dir}/package.json" ]; then
    APP_NAME=$(SCAN_FILE="${dir}/package.json" node -e "
      try {
        const p = require(process.env.SCAN_FILE);
        console.log(p.name || 'Unknown');
      } catch(e) { console.log('Unknown'); }
    " 2>/dev/null || echo "Unknown")
  fi

  PLATFORMS=""
  [ -d "${dir}/ios" ] && PLATFORMS="${PLATFORMS}ios "
  [ -d "${dir}/android" ] && PLATFORMS="${PLATFORMS}android"
  # For Expo Managed, assume both if no native folders exist
  if [ -z "$PLATFORMS" ] && [ "$PROJECT_TYPE" = "expo-managed" ]; then
    PLATFORMS="ios android"
  fi
}

# ─── Running Checks ───────────────────────────────────────────────────────────

run_check() {
  local check_name="$1"
  local script_file="${SCRIPT_DIR}/${check_name}.sh"
  local output_file="${RESULTS_DIR}/${check_name}.json"

  if [ ! -f "$script_file" ]; then
    log_warn "Script not found: $script_file"
    return
  fi

  echo -n "  Checking $check_name... "
  if bash "$script_file" "$PROJECT_DIR" > "$output_file" 2>/dev/null; then
    local critical warning
    critical=$(SCAN_FILE="$output_file" node -e "try{const r=require(process.env.SCAN_FILE);console.log(r.summary.critical||0);}catch(e){console.log(0);}" 2>/dev/null || echo 0)
    warning=$(SCAN_FILE="$output_file" node -e "try{const r=require(process.env.SCAN_FILE);console.log(r.summary.warning||0);}catch(e){console.log(0);}" 2>/dev/null || echo 0)

    if [ "${critical:-0}" -gt 0 ] 2>/dev/null; then
      echo -e "${RED}${critical} critical${NC}"
    elif [ "${warning:-0}" -gt 0 ] 2>/dev/null; then
      echo -e "${YELLOW}${warning} warning(s)${NC}"
    else
      echo -e "${GREEN}OK${NC}"
    fi
  else
    echo -e "${YELLOW}Warning: check returned errors${NC}"
    # Create a valid empty JSON to avoid breaking the report
    echo '{"check":"'"$check_name"'","results":[],"summary":{"critical":0,"warning":0,"info":0,"ok":0}}' > "$output_file"
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  echo ""
  log_bold "📱 Mobile App Compliance Checker"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "Project: $PROJECT_DIR"

  # Check if it is a valid project
  if [ ! -f "${PROJECT_DIR}/package.json" ]; then
    log_error "package.json not found in: $PROJECT_DIR"
    log_error "Run this script from the root of the React Native/Expo project."
    exit 1
  fi

  # Detect project type
  PROJECT_TYPE=$(detect_project_type "$PROJECT_DIR")
  log_info "Project type detected: ${BOLD}${PROJECT_TYPE}${NC}"

  if [ "$PROJECT_TYPE" = "unknown" ]; then
    log_warn "Could not detect the project type. Continuing with basic checks."
  fi

  # Collect basic information
  collect_basic_info "$PROJECT_DIR"
  log_info "App: ${BOLD}${APP_NAME}${NC} v${APP_VERSION}"
  [ "$APP_SDK_VERSION" != "Unknown" ] && log_info "Expo SDK: $APP_SDK_VERSION"
  [ -n "$PLATFORMS" ] && log_info "Platforms: $PLATFORMS"

  # Create output directories
  mkdir -p "$RESULTS_DIR"

  echo ""
  log_bold "🔍 Running checks..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Core checks (always run)
  run_check "check-expo-config"
  run_check "check-permissions"
  run_check "check-security"
  run_check "check-dependencies"

  # Platform-specific checks
  if echo "$PLATFORMS" | grep -q "ios"; then
    run_check "check-privacy-manifest"
  fi
  if echo "$PLATFORMS" | grep -q "android"; then
    run_check "check-data-safety"
  fi

  # Generate consolidated report
  echo ""
  log_bold "📊 Generating report..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  bash "${SCRIPT_DIR}/generate-report.sh" \
    "$PROJECT_DIR" \
    "$RESULTS_DIR" \
    "$REPORT_FILE" \
    "$APP_NAME" \
    "$APP_VERSION" \
    "$PROJECT_TYPE" \
    "$PLATFORMS"

  echo ""
  log_ok "Report generated: ${BOLD}${REPORT_FILE}${NC}"
  echo ""

  # Show summary in the terminal
  TOTAL_CRITICAL=0
  TOTAL_WARNING=0
  TOTAL_INFO=0
  TOTAL_OK=0

  for json_file in "${RESULTS_DIR}"/*.json; do
    [ -f "$json_file" ] || continue
    c=$(SCAN_FILE="$json_file" node -e "try{const r=require(process.env.SCAN_FILE);console.log(r.summary.critical||0);}catch(e){console.log(0);}" 2>/dev/null || echo 0)
    w=$(SCAN_FILE="$json_file" node -e "try{const r=require(process.env.SCAN_FILE);console.log(r.summary.warning||0);}catch(e){console.log(0);}" 2>/dev/null || echo 0)
    i=$(SCAN_FILE="$json_file" node -e "try{const r=require(process.env.SCAN_FILE);console.log(r.summary.info||0);}catch(e){console.log(0);}" 2>/dev/null || echo 0)
    o=$(SCAN_FILE="$json_file" node -e "try{const r=require(process.env.SCAN_FILE);console.log(r.summary.ok||0);}catch(e){console.log(0);}" 2>/dev/null || echo 0)
    TOTAL_CRITICAL=$((TOTAL_CRITICAL + ${c:-0}))
    TOTAL_WARNING=$((TOTAL_WARNING + ${w:-0}))
    TOTAL_INFO=$((TOTAL_INFO + ${i:-0}))
    TOTAL_OK=$((TOTAL_OK + ${o:-0}))
  done

  log_bold "📋 Summary:"
  [ "$TOTAL_CRITICAL" -gt 0 ] && log_error "Critical: $TOTAL_CRITICAL"
  [ "$TOTAL_WARNING" -gt 0 ] && log_warn "Warnings: $TOTAL_WARNING"
  [ "$TOTAL_INFO" -gt 0 ] && log_info "Info: $TOTAL_INFO"
  log_ok "OK: $TOTAL_OK"

  echo ""
  if [ "$TOTAL_CRITICAL" -gt 0 ]; then
    log_error "Fix CRITICAL issues before submitting to the stores."
    exit 1
  else
    log_ok "No critical issues found. Review the warnings before submitting."
  fi
}

main "$@"
