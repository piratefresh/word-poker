#!/usr/bin/env bash
# generate-report.sh — Consolidates check results into a markdown report
# Usage: bash generate-report.sh <project_dir> <results_dir> <report_file> <app_name> <app_version> <project_type> <platforms>
set -uo pipefail

PROJECT_DIR="${1:-.}"
RESULTS_DIR="${2:-${PROJECT_DIR}/.compliance-report/results}"
REPORT_FILE="${3:-${PROJECT_DIR}/.compliance-report/report.md}"
APP_NAME="${4:-Unknown}"
APP_VERSION="${5:-Unknown}"
PROJECT_TYPE="${6:-unknown}"
PLATFORMS="${7:-ios android}"

REPORT_DATE=$(date '+%d/%m/%Y %H:%M')

# ─── Aggregate all results ────────────────────────────────────────────────────

TOTAL_CRITICAL=0
TOTAL_WARNING=0
TOTAL_INFO=0
TOTAL_OK=0

# Collect all items by category
collect_by_severity() {
  local severity="$1"
  local category_filter="$2"  # "apple", "google", "security", "both", or "" for all

  for json_file in "${RESULTS_DIR}"/*.json; do
    [ -f "$json_file" ] || continue
    SCAN_FILE="$json_file" SCAN_SEVERITY="$severity" SCAN_CATEGORY="$category_filter" node -e "
      try {
        const data = require(process.env.SCAN_FILE);
        const sev = process.env.SCAN_SEVERITY;
        const cat = process.env.SCAN_CATEGORY;
        const results = data.results || [];
        results.forEach(r => {
          const matchSeverity = r.severity === sev;
          const matchCategory = cat === '' || r.category === cat || r.category === 'both';
          if (matchSeverity && matchCategory) {
            const icon = {CRITICAL:'🔴',WARNING:'⚠️',INFO:'ℹ️',OK:'✅'}[r.severity] || '';
            console.log('- ' + icon + ' **' + r.title + '**');
            if (r.description) console.log('  ' + r.description);
            if (r.fix) console.log('  > **Fix:** ' + r.fix);
            if (r.reference) console.log('  > **Reference:** ' + r.reference);
            if (r.file && r.file !== '—') console.log('  > **File:** \`' + r.file + '\`');
            console.log('');
          }
        });
      } catch(e) {}
    " 2>/dev/null || true
  done
}

collect_ok_items() {
  local category_filter="$1"

  for json_file in "${RESULTS_DIR}"/*.json; do
    [ -f "$json_file" ] || continue
    SCAN_FILE="$json_file" SCAN_CATEGORY="$category_filter" node -e "
      try {
        const data = require(process.env.SCAN_FILE);
        const cat = process.env.SCAN_CATEGORY;
        const results = data.results || [];
        results.forEach(r => {
          const matchCategory = cat === '' || r.category === cat || r.category === 'both';
          if (r.severity === 'OK' && matchCategory) {
            console.log('- ✅ ' + r.title);
          }
        });
      } catch(e) {}
    " 2>/dev/null || true
  done
}

# Count totals
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

# ─── Generate Report ──────────────────────────────────────────────────────────

{
cat << HEADER
# 📊 Compliance Report — ${APP_NAME}

> **Date:** ${REPORT_DATE}
> **App Version:** ${APP_VERSION}
> **Project Type:** ${PROJECT_TYPE}
> **Platforms:** ${PLATFORMS}

---

## Executive Summary

| Level | Count | Action |
|-------|-------|--------|
| 🔴 Critical | ${TOTAL_CRITICAL} | Fix before submitting |
| ⚠️ Warning | ${TOTAL_WARNING} | Review — may cause issues |
| ℹ️ Info | ${TOTAL_INFO} | Consider for better compliance |
| ✅ OK | ${TOTAL_OK} | Compliance verified |

HEADER

# Overall status
if [ "$TOTAL_CRITICAL" -gt 0 ]; then
  echo "**Status: 🔴 NOT READY FOR SUBMISSION** — fix critical issues before submitting to the stores."
elif [ "$TOTAL_WARNING" -gt 0 ]; then
  echo "**Status: ⚠️ ATTENTION NEEDED** — no critical issues, but there are warnings to review."
else
  echo "**Status: ✅ READY FOR REVIEW** — no critical issues detected. Review the attention items."
fi

echo ""
echo "---"
echo ""

# ─── Apple App Store Section ──────────────────────────────────────────────────
if echo "$PLATFORMS" | grep -q "ios"; then
  echo "## 🍎 Apple App Store"
  echo ""

  APPLE_CRITICAL=$(collect_by_severity "CRITICAL" "apple")
  if [ -n "$APPLE_CRITICAL" ]; then
    echo "### 🔴 Critical"
    echo ""
    echo "$APPLE_CRITICAL"
  fi

  APPLE_WARNING=$(collect_by_severity "WARNING" "apple")
  if [ -n "$APPLE_WARNING" ]; then
    echo "### ⚠️ Warnings"
    echo ""
    echo "$APPLE_WARNING"
  fi

  APPLE_INFO=$(collect_by_severity "INFO" "apple")
  if [ -n "$APPLE_INFO" ]; then
    echo "### ℹ️ Info"
    echo ""
    echo "$APPLE_INFO"
  fi

  APPLE_OK=$(collect_ok_items "apple")
  if [ -n "$APPLE_OK" ]; then
    echo "### ✅ OK"
    echo ""
    echo "$APPLE_OK"
    echo ""
  fi

  echo "---"
  echo ""
fi

# ─── Google Play Store Section ────────────────────────────────────────────────
if echo "$PLATFORMS" | grep -q "android"; then
  echo "## 🤖 Google Play Store"
  echo ""

  GOOGLE_CRITICAL=$(collect_by_severity "CRITICAL" "google")
  if [ -n "$GOOGLE_CRITICAL" ]; then
    echo "### 🔴 Critical"
    echo ""
    echo "$GOOGLE_CRITICAL"
  fi

  GOOGLE_WARNING=$(collect_by_severity "WARNING" "google")
  if [ -n "$GOOGLE_WARNING" ]; then
    echo "### ⚠️ Warnings"
    echo ""
    echo "$GOOGLE_WARNING"
  fi

  GOOGLE_INFO=$(collect_by_severity "INFO" "google")
  if [ -n "$GOOGLE_INFO" ]; then
    echo "### ℹ️ Info"
    echo ""
    echo "$GOOGLE_INFO"
  fi

  GOOGLE_OK=$(collect_ok_items "google")
  if [ -n "$GOOGLE_OK" ]; then
    echo "### ✅ OK"
    echo ""
    echo "$GOOGLE_OK"
    echo ""
  fi

  echo "---"
  echo ""
fi

# ─── Security Section ─────────────────────────────────────────────────────────
echo "## 🔐 Data Security"
echo ""

SEC_CRITICAL=$(collect_by_severity "CRITICAL" "security")
if [ -n "$SEC_CRITICAL" ]; then
  echo "### 🔴 Critical"
  echo ""
  echo "$SEC_CRITICAL"
fi

SEC_WARNING=$(collect_by_severity "WARNING" "security")
if [ -n "$SEC_WARNING" ]; then
  echo "### ⚠️ Warnings"
  echo ""
  echo "$SEC_WARNING"
fi

SEC_INFO=$(collect_by_severity "INFO" "security")
if [ -n "$SEC_INFO" ]; then
  echo "### ℹ️ Info"
  echo ""
  echo "$SEC_INFO"
fi

SEC_OK=$(collect_ok_items "security")
if [ -n "$SEC_OK" ]; then
  echo "### ✅ OK"
  echo ""
  echo "$SEC_OK"
  echo ""
fi

echo "---"
echo ""

# ─── Both Platforms Section ───────────────────────────────────────────────────
BOTH_CRITICAL=$(collect_by_severity "CRITICAL" "both")
BOTH_WARNING=$(collect_by_severity "WARNING" "both")
BOTH_INFO=$(collect_by_severity "INFO" "both")

if [ -n "$BOTH_CRITICAL" ] || [ -n "$BOTH_WARNING" ] || [ -n "$BOTH_INFO" ]; then
  echo "## 📋 Both Platforms"
  echo ""

  if [ -n "$BOTH_CRITICAL" ]; then
    echo "### 🔴 Critical"
    echo ""
    echo "$BOTH_CRITICAL"
  fi

  if [ -n "$BOTH_WARNING" ]; then
    echo "### ⚠️ Warnings"
    echo ""
    echo "$BOTH_WARNING"
  fi

  if [ -n "$BOTH_INFO" ]; then
    echo "### ℹ️ Info"
    echo ""
    echo "$BOTH_INFO"
  fi

  echo "---"
  echo ""
fi

# ─── Next Steps ───────────────────────────────────────────────────────────────
cat << NEXTSTEPS
## 🚀 Next Steps

### Before Submitting

NEXTSTEPS

if [ "$TOTAL_CRITICAL" -gt 0 ]; then
  echo "1. **🔴 Fix all CRITICAL issues** — do not submit without resolving these"
  echo "2. **⚠️ Review all WARNINGS** — decide which ones apply to your context"
  echo "3. **ℹ️ Consider INFO items** — they improve compliance but are not mandatory"
  echo "4. **📋 Run manual checklists** — \`checklists/pre-submission-ios.md\` and/or \`checklists/pre-submission-android.md\`"
  echo "5. **🧪 Test on a real device** — not just in a simulator"
else
  echo "1. **⚠️ Review WARNINGS** — decide which ones apply to your context"
  echo "2. **ℹ️ Consider INFO items** — they improve compliance but are not mandatory"
  echo "3. **📋 Run manual checklists** — \`checklists/pre-submission-ios.md\` and/or \`checklists/pre-submission-android.md\`"
  echo "4. **🧪 Test on a real device** — not just in a simulator"
  echo "5. **📝 Fill out store forms** — Data Safety (Google) and Privacy Labels (Apple)"
fi

cat << FOOTER

### Skill Resources

| Resource | File |
|----------|------|
| iOS Checklist | \`checklists/pre-submission-ios.md\` |
| Android Checklist | \`checklists/pre-submission-android.md\` |
| Privacy Checklist | \`checklists/privacy-compliance.md\` |
| Privacy Policy Template | \`templates/privacy-policy-pt-br.md\` |
| Google Data Safety Guide | \`templates/data-safety-form.md\` |
| Apple Privacy Labels Guide | \`templates/app-privacy-labels.md\` |
| Apple Guidelines | \`references/apple-app-store.md\` |
| Google Play Guidelines | \`references/google-play-store.md\` |
| LGPD Requirements | \`references/lgpd-privacy.md\` |

---

*Report generated by [expo-app-store-guideline-check](https://github.com/nandofalcao/expo-app-store-guideline-check)*
*This report checks technical compliance. Consult a lawyer for full legal compliance with LGPD and other regulations.*
FOOTER

} > "$REPORT_FILE"

echo "Report saved to: $REPORT_FILE"
