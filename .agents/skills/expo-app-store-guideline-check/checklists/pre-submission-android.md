# Pre-Submission Checklist — Google Play Store

> Version: 1.0 | Updated: 2026-03-28
> Complete this checklist before each submission to Google Play.

---

## 1. Basic Configuration

- [ ] `expo.android.package` defined (ex: `com.empresa.app`)
- [ ] `expo.version` updated (semver)
- [ ] `expo.android.versionCode` incremented from last publication
- [ ] Adaptive icon configured (`adaptiveIcon` with `foregroundImage` and `backgroundColor`)
- [ ] Splash Screen configured
- [ ] Target SDK Version: 34+ (required) or 35 (recommended for 2025/2026)
- [ ] Build format: **AAB** (Android App Bundle), not APK

---

## 2. Android Permissions

- [ ] Only **necessary** permissions declared in AndroidManifest.xml
- [ ] No declared permissions that are not used by the app
- [ ] Sensitive permissions (CAMERA, CONTACTS, LOCATION) with clear justification
- [ ] For `ACCESS_BACKGROUND_LOCATION`: special approval requested if needed
- [ ] `INTERNET` declared (necessary for apps with backend)
- [ ] Android 13+ permissions (`READ_MEDIA_IMAGES`, etc.) used instead of `READ_EXTERNAL_STORAGE`

---

## 3. Data Safety Section

**Fill in Google Play Console > App content > Data safety:**

- [ ] Data Safety Section **filled** (required — app cannot be published without it)
- [ ] Data collected by the app correctly declared:
  - [ ] Location data (if using GPS)
  - [ ] Personal data (name, email, etc.)
  - [ ] Financial data (if has IAP)
  - [ ] Health/fitness data (if applicable)
  - [ ] Device data (Advertising ID if using ads)
  - [ ] Performance data (crash logs if using Sentry/Crashlytics)
  - [ ] App activity data (analytics)
- [ ] Data shared with third parties declared
- [ ] Encryption policy in transit indicated (TLS/HTTPS)
- [ ] Deletion request option indicated (if implemented)
- [ ] Data Safety consistent with Privacy Policy

---

## 4. Privacy & Legal

- [ ] **Privacy Policy URL** configured in Google Play Console
- [ ] Privacy Policy accessible **within the app**
- [ ] Privacy Policy in Portuguese (and English if international app)
- [ ] Privacy Policy updated with all data and third-party SDKs

---

## 5. Content Rating

- [ ] **Content Rating (IARC)** questionnaire filled in Play Console
- [ ] Correct classification for target audience
- [ ] If app for children: comply with Families Policy
  - [ ] No unapproved third-party advertising
  - [ ] No analytics collecting data from minors
  - [ ] Parental consent for purchases

---

## 6. In-App Purchase (if applicable)

- [ ] **Google Play Billing** used for digital purchases
- [ ] No links to external purchase of digital content
- [ ] Prices displayed before confirmation
- [ ] Clear subscription terms (duration, automatic renewal)
- [ ] Purchases tested in Google Play Sandbox environment

---

## 7. Functionality and Performance

- [ ] App tested on **physical device** (not just emulator)
- [ ] Tested on multiple screen sizes (phone, tablet, foldable if applicable)
- [ ] Tested on Android 7 (API 24) — minimum version supported by current Expo
- [ ] Tested on Android 15 (API 35) — latest version
- [ ] No crashes in main flow
- [ ] Backend **active and accessible**
- [ ] No "Coming Soon" features in UI
- [ ] Dark mode tested (if app supports it)
- [ ] Behavior with denied permissions tested

---

## 8. Store Listing (Google Play Console)

- [ ] **Screenshots** of real app (not mockups)
  - [ ] Phone: minimum 2, up to 8 screenshots
  - [ ] Tablet 7" (recommended)
  - [ ] Tablet 10" (recommended)
- [ ] **Feature Graphic** (1024x500 JPG/PNG)
- [ ] **App Preview** (video) — optional but recommended
- [ ] App title (max 50 characters)
- [ ] Short description (max 80 characters)
- [ ] Full description (max 4000 characters)
- [ ] Correct category selected
- [ ] Relevant tags selected
- [ ] Distribution countries/regions configured

---

## 9. Account Management

- [ ] Google Play Developer Account verified
- [ ] If Developer Verification required in country: documentation ready
- [ ] Contact email address valid and monitored
- [ ] Bank account configured for payments (if has IAP)

---

## 10. Build and Publication

- [ ] AAB Build generated via EAS Build (production)
- [ ] Tested via **Internal Testing** before promoting
- [ ] Tested via **Closed Testing (Alpha)** with real users
- [ ] Keystore stored in secure location (loss = impossible to update the app)
- [ ] `eas.json` configured with `buildType: "app-bundle"` for production
- [ ] App signing configured (preferred: Google's Play App Signing)

---

## 11. Specific Policies (if applicable)

**Health/Fitness:**
- [ ] Health data not used for advertising purposes
- [ ] Medical certification if needed (ex: diagnostic apps)

**Finance/Fintech:**
- [ ] Compliance with local financial regulations
- [ ] KYC (Know Your Customer) implemented if required

**Minors under 18:**
- [ ] Families Policy complied
- [ ] COPPA compliance (if distributed in US)

**VPN:**
- [ ] Declared use approved by Google policy

---

## Final Verification

Run the automatic scan before publishing:

```bash
bash scripts/scan-project.sh .
```

Confirm that:
- [ ] No CRITICAL items in the report
- [ ] All items in this checklist are marked
- [ ] Internal Testing tested for at least 3 days with positive feedback
- [ ] Data Safety Section filled and saved

---

## References

- [Google Play Developer Policy](https://support.google.com/googleplay/android-developer/answer/16810878)
- [Data Safety Section Help](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Target API Level Requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- `references/google-play-store.md` — condensed guidelines
- `templates/data-safety-form.md` — guide to filling Data Safety
