# Pre-Submission Checklist — Apple App Store

> Version: 1.0 | Updated: 2026-03-28
> Complete this checklist before each App Store submission.

---

## 1. Basic Configuration

- [ ] `expo.ios.bundleIdentifier` defined and unique
- [ ] `expo.version` updated (semver)
- [ ] `expo.ios.buildNumber` incremented from last submission
- [ ] High-resolution app icon (1024x1024 PNG, no transparency)
- [ ] Splash Screen configured
- [ ] Minimum iOS SDK: iOS 16+ (or 18+ starting April/2026)
- [ ] `expo.ios.supportsTablet` explicitly defined
- [ ] App orientation configured (`orientation` in app.json)

---

## 2. Privacy Manifest

- [ ] `expo.ios.privacyManifests` configured in app.json
- [ ] `NSPrivacyAccessedAPICategoryUserDefaults` declared (React Native Core uses it)
- [ ] `NSPrivacyAccessedAPICategoryFileTimestamp` declared (React Native Core uses it)
- [ ] `NSPrivacyAccessedAPICategorySystemBootTime` declared (React Native Core uses it)
- [ ] `NSPrivacyAccessedAPICategoryDiskSpace` declared (React Native Core uses it)
- [ ] Third-party APIs (Sentry, Firebase, etc.) verified and declared
- [ ] `NSPrivacyTracking: false` (or `true` if uses tracking — with ATT implemented)

---

## 3. Permissions (Usage Descriptions)

**Camera (if using expo-camera or expo-image-picker):**
- [ ] `NSCameraUsageDescription` with specific description (not generic)

**Microphone (if using expo-av):**
- [ ] `NSMicrophoneUsageDescription` with specific description

**Location (if using expo-location):**
- [ ] `NSLocationWhenInUseUsageDescription` with specific description
- [ ] If using background location: `NSLocationAlwaysAndWhenInUseUsageDescription` with justification

**Gallery (if using expo-image-picker):**
- [ ] `NSPhotoLibraryUsageDescription` with specific description
- [ ] If saving to gallery: `NSPhotoLibraryAddUsageDescription`

**Others (check if app uses):**
- [ ] `NSContactsUsageDescription` (expo-contacts)
- [ ] `NSCalendarsUsageDescription` (expo-calendar)
- [ ] `NSFaceIDUsageDescription` (expo-local-authentication)
- [ ] `NSBluetoothAlwaysUsageDescription` (Bluetooth)
- [ ] `NSMotionUsageDescription` (expo-sensors)
- [ ] `NSUserTrackingUsageDescription` (if using tracking/ATT)

---

## 4. Privacy & Legal

- [ ] **Privacy Policy URL** configured in app.json (`privacyPolicyUrl`)
- [ ] Privacy Policy accessible **within the app** (no login required)
- [ ] Privacy Policy in Portuguese (and English if app has international users)
- [ ] Privacy Policy updated with all currently collected data
- [ ] **Privacy Labels** filled in App Store Connect
  - [ ] Data Used to Track You
  - [ ] Data Linked to You
  - [ ] Data Not Linked to You

---

## 5. Account & Authentication

- [ ] If app has account creation: **Account Deletion** implemented within the app
  - [ ] Accessible in Settings/Profile without needing support
  - [ ] Deletes or anonymizes all user data
  - [ ] Clear confirmation message before deletion
- [ ] If has social login (Google/Apple/Facebook): configured correctly
- [ ] **Sign in with Apple** implemented if app has other third-party login methods

---

## 6. In-App Purchase (if applicable)

- [ ] **Restore Purchases** button visible and functional
- [ ] Prices visible before purchase
- [ ] Subscription terms clearly displayed (duration, price, renewal)
- [ ] Trial period clearly communicated
- [ ] Cancellation explained (direct to iOS settings)
- [ ] Purchases tested in Sandbox environment

---

## 7. App Tracking Transparency (if using tracking)

- [ ] `expo-tracking-transparency` installed
- [ ] `NSUserTrackingUsageDescription` configured in app.json
- [ ] ATT dialog displayed before initializing tracking SDKs
- [ ] Tracking SDKs disabled if user denies

---

## 8. Functionality and Performance

- [ ] App tested on **physical device** (not just simulator)
- [ ] Tested on iPhone with smallest supported screen
- [ ] Tested on iPad (if `supportsTablet: true`)
- [ ] No crashes in main flow
- [ ] No blank screens or infinite loading states
- [ ] All URLs and links working
- [ ] Backend **active and accessible** (keep for up to 7 days during review)
- [ ] No "Coming Soon" features in UI
- [ ] Features requiring permission tested with permission denied

---

## 9. Store Listing (App Store Connect)

- [ ] **Screenshots** taken from real app (not mockups)
  - [ ] iPhone 6.9" (required)
  - [ ] iPhone 6.5" (recommended)
  - [ ] iPad 12.9" (if universal)
- [ ] **App Preview** (video) — optional but recommended
- [ ] App title without keyword spam (max 30 characters)
- [ ] Descriptive subtitle (max 30 characters)
- [ ] Accurate description without unverifiable claims
- [ ] Relevant keywords (max 100 characters)
- [ ] Correct primary category
- [ ] **Age Rating** filled (Content Rights)
- [ ] **Copyright** filled (e.g., "© 2026 Company Ltd")

---

## 10. App Review Notes

- [ ] **Demo account** provided (email + password that works without configuration)
- [ ] Usage instructions if flow is complex
- [ ] Explanation of any non-obvious functionality
- [ ] Video recording if app uses hardware (camera, GPS) that reviewer may not have access to

---

## 11. Build and Submission

- [ ] Build generated via EAS Build (production)
- [ ] Build tested via TestFlight before submitting for review
- [ ] **Bitcode** configured as needed (verify EAS settings)
- [ ] Valid Certificates and Provisioning Profiles
- [ ] DSYM files included (for crash reporting)

---

## Final Verification

Run the automatic scan before submitting:

```bash
bash scripts/scan-project.sh .
```

Confirm that:
- [ ] No CRITICAL items in report
- [ ] All items in this checklist are marked
- [ ] TestFlight tested with at least 5 external testers

---

## References

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [Expo Apple Privacy Guide](https://docs.expo.dev/guides/apple-privacy/)
- `references/apple-app-store.md` — condensed guidelines
- `references/common-rejections.md` — avoid common rejections
