# Google Play Store Guidelines — Condensed Reference

> Last updated: 2026-03-28
> Official source: https://support.google.com/googleplay/android-developer/answer/16810878
> Deadlines: https://support.google.com/googleplay/android-developer/table/12921780

---

## Active Requirements (2025/2026)

| Requirement | Deadline | Status |
|-----------|-------|--------|
| Target API 34 (Android 14) for updates | August/2024 | **Mandatory** |
| Target API 35 (Android 15) for new apps | 2025/2026 | **Recommended now** |
| Data Safety Section filled | Mandatory | **Mandatory** |
| Developer Verification (Brazil) | September/2026 | **Coming soon** |
| AAB format (not APK) for new apps | August/2021 | **Mandatory** |

---

## Target API Level

### Requirements Timeline
- **API 33 (Android 13):** minimum for existing apps until August/2023
- **API 34 (Android 14):** mandatory for new apps and updates since August/2024
- **API 35 (Android 15):** recommended for 2025/2026 — check official deadline

### In Expo/React Native
```json
// app.json
{
  "expo": {
    "android": {
      "targetSdkVersion": 35,
      "compileSdkVersion": 35,
      "buildToolsVersion": "35.0.0"
    }
  }
}
```

---

## Data Safety Section — CRITICAL

### What it is
Mandatory form in Google Play Console > App content > Data safety.
Must declare all data that the app collects, uses, and shares.

### Data Categories
| Category | Examples |
|-----------|----------|
| Location | Approximate, Precise, Background |
| Personal info | Name, Email, User ID, Address |
| Financial info | Payment info, Purchase history |
| Health & Fitness | Health info, Fitness info |
| Messages | Emails, SMS, In-app messages |
| Photos & Videos | Photos, Videos |
| Audio | Voice recordings, Music files |
| Files & Docs | Files, Documents |
| Calendar | Calendar events |
| Contacts | Contacts |
| App activity | App interactions, In-app search history |
| Web browsing | Web browsing history |
| App info & performance | Crash logs, Diagnostics |
| Device or other IDs | Device ID, Advertising ID |

### Form Questions
For each data type:
1. Does the app collect this data?
2. Is the data shared with third parties?
3. Can the data be requested for deletion?
4. Is the processing mandatory or optional?
5. Is collection encrypted in transit?

### SDKs that Automatically Collect Data
- **Firebase Analytics:** App activity, Device IDs
- **Firebase Crashlytics:** App info & performance, Device info
- **Amplitude:** App activity, Device IDs
- **Google AdMob:** Device IDs, App activity
- **Sentry:** App info & performance
- **Branch/Appsflyer/Adjust:** Device IDs, App activity (attribution)

---

## Privacy and Data Policies

### User Data Policy
- Collect only data necessary for declared functionalities
- Clear and prominent disclosure before collecting sensitive data
- Explicit consent for collecting sensitive data
- Privacy Policy mandatory and accessible

### Permissions Policy
- Request only necessary permissions
- Explain why each permission is needed
- Do not access background permissions without justification
- "Hazardous" permissions (Location, Contacts, etc.) with minimal use

### High-Risk Permissions
| Permission | Additional Requirement |
|-----------|---------------------|
| ACCESS_BACKGROUND_LOCATION | Special approval + justification |
| READ_CONTACTS | Data Safety disclosure mandatory |
| RECORD_AUDIO | Clear justification |
| READ_CALL_LOG | Special approval |
| CAMERA | Usage disclosure |
| READ_MEDIA_* | Access disclosure |

---

## Restricted Content

### Prohibited Content
- Explicit sexual content (without special approval)
- Illegal material (drugs, illegal weapons, CSAM)
- Content that incites violence or hate
- Malware, spyware, adware
- Stalking/surveillance applications without consent

### Adult Content
- Correctly classify in Content Rating Questionnaire
- No adult content visible before age confirmation
- Follow ads policies if advertising is present

---

## Families Policy (Apps for Children)

If the app is targeted at children under 13 (or mixed):
- No third-party advertising (except those approved by families policy)
- No analytics that collect children's data
- No in-app purchases without parental approval
- No links to adult content
- Comply with COPPA (USA) and equivalent legislation

---

## Monetization and Advertising

### Google Play Billing
- **Mandatory** for consumable digital content (same rule as Apple)
- Do not bypass Google's payment system
- Exceptions: physical apps, B2B, certain streaming apps

### Ads Policies
- No misleading ads
- No ads that simulate system notifications
- No unexpected interstitial ads
- Ads must be clearly identified as advertising
- AdMob: follow family policies if app has minors

---

## Store Listing and Metadata

### Metadata Requirements
- Screenshots must reflect the actual app
- Accurate description of functionalities
- App title: maximum 50 characters
- No keyword spam in title
- Icon: PNG 512x512
- Feature Graphic: JPG/PNG 1024x500

### Content Rating
- Fill out the content rating questionnaire
- IARC classification mandatory
- Incorrect rating may cause removal

---

## Spam and Minimum Functionality

- App must have significant functionality
- No apps that are only links to websites
- No identical clones of other apps
- No apps with trivial functionality
- No misleading behaviors

---

## Developer Verification (2026)

Starting September 2026, all developers in Brazil (and other countries)
will need to verify identity/company in Google Play Console.

**Prepare now:**
- Keep account data updated
- Companies: have legal documentation ready
- Individuals: photo ID document

---

## Build Formats

### AAB (Android App Bundle) — Mandatory
```bash
# EAS Build generates AAB by default
eas build --platform android --profile production

# Check in eas.json:
{
  "build": {
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

---

## Compliance Resources (Google)

- [Google Play Developer Policy Center](https://support.google.com/googleplay/android-developer/answer/16810878)
- [Data Safety Section Help](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Target API Level Requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Policy Timelines](https://support.google.com/googleplay/android-developer/table/12921780)
- [Play Console Help](https://support.google.com/googleplay/android-developer/)
