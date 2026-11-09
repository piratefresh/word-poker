# expo-app-store-guideline-check

Pre-submission guideline checker for **Expo** and **React Native** apps targeting
**Apple App Store** and **Google Play Store** — covering privacy, security, permissions,
and store-specific requirements.

## How It Works

This is an **agent skill**: a structured context file (`SKILL.md`) that tells your AI
assistant exactly how to audit your project. When triggered, the AI:

1. Reads your `app.json` / `app.config.js`, `package.json`, and source files
2. Optionally runs the included bash scripts to generate a detailed report
3. Flags issues by severity (Critical, Warning, Info) across all domains below
4. Suggests fixes with references to official guidelines

No cloud service, no API keys — runs entirely in your local environment.

## What It Checks

| Domain | Example Checks |
|--------|----------------|
| Apple App Store | Privacy Manifest, Usage Descriptions, Account Deletion, IAP |
| Google Play Store | Target API Level, Data Safety Section, Permissions |
| LGPD / Privacy | Privacy Policy, Consent, Data Subject Rights, DPO |
| GDPR | DPIA, DPA (Art. 28), 72h breach notification, Art. 15-22 rights |
| Security | AsyncStorage with sensitive data, hardcoded API keys, HTTPS |
| Dependencies | Known vulnerabilities, SDKs that collect data |

## Installation

### Via skills.sh (recommended)

[skills.sh](https://skills.sh) is the open agent skills ecosystem by Vercel.
Install directly with the CLI — works with Claude Code, Cursor, Copilot, and others:

```bash
npx skills add nandofalcao/expo-app-store-guideline-check
```

This downloads the skill and places it in the appropriate directory for your agent.
Browse the skill on the directory: [skills.sh/nandofalcao/expo-app-store-guideline-check](https://skills.sh/nandofalcao/expo-app-store-guideline-check)

### Claude Code (manual)

```bash
# Clone and copy to Claude Code skills directory
git clone https://github.com/nandofalcao/expo-app-store-guideline-check
cp -r expo-app-store-guideline-check/ ~/.claude/skills/
```

Or reference it locally per project by adding to `.claude/settings.json`:

```json
{
  "skills": ["./expo-app-store-guideline-check/SKILL.md"]
}
```

### OpenCode

```bash
# Copy SKILL.md content to custom instructions
cat expo-app-store-guideline-check/SKILL.md >> .opencode/instructions.md
```

### GitHub Copilot

```bash
cat expo-app-store-guideline-check/SKILL.md >> .github/copilot-instructions.md
```

## Quick Start

### Option 1 — Ask your AI agent

After installing the skill, open a conversation in Claude Code (or your agent) at the
root of your Expo project and type:

```
Check if this app is ready for App Store and Google Play submission
```

The skill is triggered automatically. The AI will scan your project files and produce
a structured report with issues and recommended fixes.

### Option 2 — Run the scan script directly

```bash
# At the root of your Expo/React Native project:
bash ~/.claude/skills/expo-app-store-guideline-check/scripts/scan-project.sh .

# Or if cloned locally:
bash expo-app-store-guideline-check/scripts/scan-project.sh /path/to/your/project

# Report saved to:
# ./.compliance-report/report_YYYYMMDD_HHMMSS.md
```

### Option 3 — Run individual checks

```bash
SKILL_DIR=~/.claude/skills/expo-app-store-guideline-check

bash $SKILL_DIR/scripts/check-permissions.sh .
bash $SKILL_DIR/scripts/check-privacy-manifest.sh .
bash $SKILL_DIR/scripts/check-data-safety.sh .
bash $SKILL_DIR/scripts/check-expo-config.sh .
bash $SKILL_DIR/scripts/check-dependencies.sh .
bash $SKILL_DIR/scripts/check-security.sh .
```

## Tips

- **Run before every release** — store guidelines change frequently; what passed last
  quarter may be flagged today.
- **Fix Criticals first** — 🔴 items will cause rejection; ⚠️ warnings are reviewed
  case-by-case by store reviewers.
- **Pair with the AI** — after the script generates a report, paste it into your chat
  and ask the AI to explain and prioritize the fixes.
- **Keep references up to date** — each file in `references/` has a last-update header;
  compare against official sources periodically.

## Severity Levels

| Level | Symbol | Meaning |
|-------|--------|---------|
| CRITICAL | 🔴 | Will cause store rejection — fix immediately |
| WARNING | ⚠️ | May cause rejection or future issues — review |
| INFO | ℹ️ | Recommended best practice — consider |
| OK | ✅ | Verified compliance |

## Requirements

- `bash` 3.2+
- `node` 14+ (for JSON parsing when needed)
- `jq` (optional, improves JSON output)
- No other external dependencies

## Compatibility

| Project | Support |
|---------|---------|
| Expo Managed Workflow | ✅ Full |
| Expo Bare Workflow | ✅ Full |
| Pure React Native | ✅ Partial (no Expo-specific checks) |

## Structure

```
expo-app-store-guideline-check/
├── SKILL.md                          # Main skill (< 500 lines)
├── references/
│   ├── apple-app-store.md            # Condensed Apple guidelines
│   ├── google-play-store.md          # Condensed Google Play guidelines
│   ├── lgpd-privacy.md               # LGPD + Privacy requirements
│   ├── gdpr-privacy.md               # GDPR + Privacy requirements (EU/EEA)
│   ├── lgpd-vs-gdpr.md               # LGPD vs GDPR comparison + dual-compliance strategy
│   ├── react-native-expo.md          # RN/Expo specific checks
│   └── common-rejections.md          # Common rejection reasons + solutions
├── checklists/
│   ├── pre-submission-ios.md         # iOS pre-submission checklist
│   ├── pre-submission-android.md     # Android pre-submission checklist
│   ├── privacy-compliance.md         # Privacy/LGPD checklist
│   └── security-checklist.md         # Data security checklist
├── scripts/
│   ├── scan-project.sh               # Main orchestrator
│   ├── check-permissions.sh          # Analyzes declared permissions
│   ├── check-privacy-manifest.sh     # Checks iOS Privacy Manifest
│   ├── check-data-safety.sh          # Checks Data Safety (Android)
│   ├── check-expo-config.sh          # Analyzes app.json / app.config.js
│   ├── check-dependencies.sh         # Analyzes dependencies
│   ├── check-security.sh             # Checks security practices
│   └── generate-report.sh            # Generates consolidated report
├── templates/
│   ├── privacy-policy-en.md          # Privacy Policy Template — LGPD (EN)
│   ├── privacy-policy-pt-br.md       # Privacy Policy Template — LGPD (PT-BR)
│   ├── privacy-policy-gdpr-en.md     # Privacy Policy Template — GDPR (EN)
│   ├── terms-of-use-en.md            # Terms of Use Template (EN)
│   ├── terms-of-use-pt-br.md         # Terms of Use Template (PT-BR)
│   ├── data-safety-form.md           # Google Play Data Safety Guide
│   └── app-privacy-labels.md         # Apple Privacy Labels Guide
├── evals/
│   └── evals.json                    # Test cases
└── README.md
```

## Guideline Updates

Store guidelines change frequently. Each file in `references/`
has a last update date in the header. Check official sources
regularly:

- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Developer Policy](https://support.google.com/googleplay/android-developer/answer/16810878)
- [ANPD — National Data Protection Authority](https://www.gov.br/anpd/pt-br)
- [EDPB — European Data Protection Board](https://www.edpb.europa.eu/edpb_en)

## Disclaimer

This skill provides automated technical checks and educational references.
**It does not replace legal advice.** For full compliance with LGPD, GDPR, and
other regulatory frameworks, consult a legal professional specialized
in data protection.

## License

MIT — see [LICENSE](LICENSE)
