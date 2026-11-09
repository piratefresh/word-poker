# Apple AppStore Guidelines — Condensed Reference

> Last updated: 2026-03-28
> Official source: https://developer.apple.com/app-store/review/guidelines/
> Upcoming requirements: https://developer.apple.com/news/upcoming-requirements/

---

## Active Requirements (2025/2026)

| Requirement | Deadline | Status |
|-------------|----------|--------|
| Privacy Manifest (PrivacyInfo.xcprivacy) | Since May/2024 | **Mandatory** |
| iOS 18 SDK minimum for new apps | April/2026 | **Mandatory** |
| Account Deletion (if account creation) | Since June/2023 | **Mandatory** |
| App Tracking Transparency | Since iOS 14.5 | **Mandatory if tracking** |

---

## 1. Safety (User Safety)

### 1.1 Objectionable Content
- No pornographic, violent, discriminatory content or content that promotes illegal activities
- Content with artistic nudity must be properly rated (17+)

### 1.2 User Generated Content (UGC)
- **Mandatory:** Report/Block button for content from other users
- **Mandatory:** Content moderation mechanism
- **Mandatory:** Offensive material filter
- Chat/forum apps need a functional reporting system

### 1.3 Kids Category (Apps for Children)
- No third-party analytics (except COPPA-compliant)
- No third-party advertising
- No in-app purchases without explicit parental approval
- No external links without parental approval
- Specific privacy policy for minors

### 1.5 Developer Information
- Valid and verified developer account
- Up-to-date contact information

---

## 2. Performance

### 2.1 App Completeness
- **Most common rejection:** App with obvious crashes, non-working buttons, blank screens
- No "Coming Soon" features in UI
- Backend must be active and accessible during review
- Demo accounts must work throughout the entire review period

### 2.2 Beta Testing
- Apps in beta must use TestFlight, not the App Store
- Do not distribute test versions through the App Store

### 2.3 Accurate Metadata
- Screenshots must reflect the actual app (not generic mockups)
- Description must match actual functionality
- App name must not contain keyword spam
- No mentions of competitors in name or description
- Icon cannot imitate icons from other apps or brands

### 2.4 Hardware Compatibility
- **2.4.1:** Explicitly define if iPad is supported (`supportsTablet`)
- Universal apps must work well on all supported sizes
- 64-bit support required (already met by modern React Native)

### 2.5 Software Requirements
- Only public iOS APIs — no private APIs
- Expo and React Native only use public APIs (generally OK)
- Verify that custom native plugins don't use private APIs

---

## 3. Business (Business Models)

### 3.1 Payments — CRITICAL
- **All consumable digital content within the app** must use In-App Purchase (IAP)
- Do not redirect user to purchase outside the app for digital content
- **Exceptions:** physical purchases, services rendered outside the app, B2B with approval

### 3.1.1 In-App Purchase Rules
- Prices must be visible before purchase
- No misleading "limited time" prices
- Consumables vs non-consumables must be correctly classified

### 3.1.2 Subscriptions
- **Mandatory:** Functional "Restore Purchases" button
- Clear subscription terms (price, duration, automatic renewal)
- Cancellation must be easy
- Trial periods clearly communicated

### 3.2 Other Business Models
- Freemium: basic functionality must work without payment
- Free apps cannot request payment to use

---

## 4. Design

### 4.1 Copycats
- No icons that imitate famous apps (Instagram, WhatsApp, etc.)
- No names that cause confusion with other apps
- Original design — do not copy UI from other apps

### 4.2 Minimum Functionality
- App must have significant native functionality
- **WebView wrappers** without additional value are rejected
- No apps that are just a link to a website

### 4.5 Apple Sites and Services
- Do not use Apple APIs in undocumented ways
- Do not imply affiliation with Apple

---

## 5. Legal

### 5.1 Privacy — MOST IMPORTANT SECTION

#### 5.1.1 Data Collection and Storage
- **Privacy Policy required** — URL configured in App Store Connect
- Privacy Policy must be accessible within the app
- Privacy Manifest (`PrivacyInfo.xcprivacy`) required
- Collect only data necessary for functionality
- Health/fitness data only for health functionalities
- **No user data for advertising without explicit consent**

#### 5.1.1(ix) Account Deletion — CRITICAL
If the app allows account creation:
- **Mandatory:** Account deletion mechanism within the app
- Must delete or anonymize all user data
- Available without contacting support

#### 5.1.2 Data Use and Sharing
- Declare all collected data in Privacy Labels (App Store Connect)
- Do not share data with third parties without disclosure
- Location data: limit to minimum necessary

#### Privacy Labels (App Store Connect)
Declare each type of data:
- **Data Used to Track You:** data used for cross-app tracking
- **Data Linked to You:** data associated with user identity
- **Data Not Linked to You:** data collected anonymously

#### App Tracking Transparency (ATT)
- **Mandatory since iOS 14.5** if the app uses tracking
- Must request permission before accessing IDFA
- No tracking if user denies

### 5.2 Intellectual Property
- No unauthorized use of registered trademarks
- Copyrights respected (music, images, fonts)

### 5.3 Gaming, Gambling
- Casinos and betting require national license
- Simulated gambling (virtual currency) = 17+ rating

### 5.4 VPN Apps
- Require clear justification and cannot collect user data

### 5.6 Developer Code of Conduct
- Do not deceive users with unexpected behavior
- Do not collect data without consent
- Do not use dark patterns for purchases

---

## Privacy Manifest — Technical Details

### APIs that require reason declaration:

| API | Available Reason Codes |
|-----|------------------------|
| `NSPrivacyAccessedAPICategoryUserDefaults` | C617.1, AC6B.1, CA92.1, 1C8F.1 |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | C617.1, 3B52.1, 0A2A.1 |
| `NSPrivacyAccessedAPICategorySystemBootTime` | 35F9.1 |
| `NSPrivacyAccessedAPICategoryDiskSpace` | E174.1, 85F4.1 |
| `NSPrivacyAccessedAPICategoryActiveKeyboards` | 3EC4.1, 54BD.1 |

### Example in app.json (Expo):
```json
{
  "expo": {
    "ios": {
      "privacyManifests": {
        "NSPrivacyAccessedAPITypes": [
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
            "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
            "NSPrivacyAccessedAPITypeReasons": ["C617.1"]
          }
        ],
        "NSPrivacyCollectedDataTypes": [],
        "NSPrivacyTracking": false
      }
    }
  }
}
```

---

## Most Common Rejection Reasons (Apple)

1. **Crash during review** — test on real device before submitting
2. **Privacy Manifest missing or incomplete**
3. **Incorrect metadata** — outdated screenshots or don't reflect the app
4. **No demo account** — provide credentials in App Review Notes
5. **No Account Deletion** — if the app has account creation
6. **Usage Descriptions too generic** — describe the real purpose
7. **Inactive backend** during review
8. **Incomplete features** in the submitted build

---

## Compliance Resources (Apple)

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Privacy Manifest Files](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files)
- [Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
