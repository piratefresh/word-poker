# Common Rejection Reasons — Apple and Google Play

> Last updated: 2026-03-28
> Based on real cases and official store documentation

---

## Top 10 — Apple App Store

### 1. Crashes and Obvious Bugs
**Frequency:** Very High
**Guideline:** 2.1 App Completeness

**Symptoms:**
- App crashes during main flow
- Blank screens or screens that don't load
- Buttons that don't work
- Backend offline during review

**Solutions:**
- Test on real device (not just simulator)
- Test on iPad if app is universal
- Ensure backend is active and accessible throughout the entire review period
- Use TestFlight with external beta testers before submitting
- Test with a clean demo account (without development data)

---

### 2. Privacy Manifest Missing or Incomplete
**Frequency:** High (since 2024)
**Guideline:** Apple Privacy Requirements 2024

**Symptoms:**
- ITMS-91053: Missing API declaration
- Rejection indicating undeclared APIs
- Build rejected during Xcode/EAS validation

**Solutions:**
- Add `expo.ios.privacyManifests` in app.json with all RN Core APIs
- Check third-party dependencies (Sentry, Firebase, etc.)
- Use `npx expo-doctor` to verify configuration
- See `references/react-native-expo.md` for complete configuration

---

### 3. Incorrect Metadata
**Frequency:** High
**Guideline:** 2.3 Accurate Metadata

**Symptoms:**
- Screenshots don't reflect the current version of the app
- Screenshots with outdated devices
- Description mentions features that don't exist
- Keywords in the app name

**Solutions:**
- Take fresh screenshots before each submission
- Use devices of the correct size (iPhone 6.9", 6.5", iPad 12.9")
- Remove any "Coming Soon" from the description
- Ensure the category is correct

---

### 4. Demo Account Not Provided
**Frequency:** High
**Guideline:** 2.1 App Completeness

**Symptoms:**
- Email from App Review requesting credentials
- Rejection due to inability to access app content

**Solutions:**
- Always provide a demo account in App Review Notes
- Credentials must work without additional configuration
- Include instructions if the flow is complex
- For apps with camera/location: video recordings of functionality help

---

### 5. Account Deletion Missing
**Frequency:** Medium-High (mandatory since June/2023)
**Guideline:** 5.1.1(ix)

**Symptoms:**
- "We noticed that your app allows users to create an account but does not have the option to initiate deletion of their account from within the app"

**Solutions:**
- Add account deletion option in Settings/Profile of the app
- Deletion must delete ALL user data (or anonymize it)
- Can have a 30-day period before permanent deletion (but must be clear)
- "Send email to delete" is not accepted — must be self-service

---

### 6. Restore Purchases Missing
**Frequency:** Medium
**Guideline:** 3.1.1

**Symptoms:**
- Rejection in apps with IAP without restore button

**Solutions:**
- Add a visible "Restore Purchases" button
- Implement `purchasesAreRestored` callback
- Test restore with a Sandbox account that has already purchased

---

### 7. Generic Usage Descriptions
**Frequency:** Medium
**Guideline:** 5.1.1

**Symptoms:**
- "The purpose string in the NSCameraUsageDescription key is not sufficient"

**Solutions:**
- Descriptions must explain the real purpose, not just state that the app needs it
- Bad: "This app needs camera access"
- Good: "We use the camera for you to photograph your plants and receive automatic identification"
- Reference the specific functionality that uses the permission

---

### 8. WebView Wrapper
**Frequency:** Medium
**Guideline:** 4.2 Minimum Functionality

**Symptoms:**
- App is essentially a website opened in WebView
- No significant native functionality
- UI identical to the company website

**Solutions:**
- Add native value (push notifications, camera access, biometrics, offline)
- Ensure the native experience is significantly better than the website
- If it's a hybrid app, WebView should be a complement, not the main functionality

---

### 9. UGC Content Without Moderation
**Frequency:** Medium-Low
**Guideline:** 1.2 User Generated Content

**Symptoms:**
- App allows users to post content without a reporting mechanism
- Absence of Report/Block buttons

**Solutions:**
- Add a "Report" button on all user content
- Implement a "Block user" button
- Have a moderation mechanism (automatic or manual)
- Mention moderation mechanisms in App Review Notes

---

### 10. Inactive Backend during Review
**Frequency:** Medium-Low
**Guideline:** 2.1 App Completeness

**Symptoms:**
- Reviewers cannot use the app due to network/API errors

**Solutions:**
- Keep the production environment stable throughout the review period (up to 7 days)
- If using feature flags, ensure all features are enabled for the reviewer
- Monitor uptime with alerts
- Provide reviewer location IPs for whitelisting if necessary (Apple uses IPs in Cupertino, CA)

---

## Top 10 — Google Play Store

### 1. User Data Policy Violation
**Frequency:** High
**Policy:** User Data Policy

**Symptoms:**
- App removed for data collection without disclosure
- Warning about privacy practices

**Solutions:**
- Fill out Data Safety Section correctly
- Declare ALL SDKs that collect data
- Privacy Policy accessible and updated
- Don't collect more data than declared

---

### 2. Outdated Target API Level
**Frequency:** High
**Policy:** Target API Requirements

**Symptoms:**
- "Your app currently targets API level X. It needs to target API level Y or higher"
- App prevented from being published/updated

**Solutions:**
- Update `targetSdkVersion` in build.gradle or app.json
- Test behavior on Android 14/15 before publishing
- Verify all dependencies support the new target SDK

---

### 3. Excessive or Unjustified Permissions
**Frequency:** Medium-High
**Policy:** Permissions Policy

**Symptoms:**
- "Your app requests permissions that are not used by your app's functionality"
- Rejection for hazardous permission without justification

**Solutions:**
- Remove unused permissions from AndroidManifest.xml
- For sensitive permissions: add clear justification in Store Listing
- For `ACCESS_BACKGROUND_LOCATION`: special approval required

---

### 4. Incomplete or Incorrect Data Safety Section
**Frequency:** Medium-High
**Policy:** Data Safety

**Symptoms:**
- Warning indicating Data Safety doesn't reflect actual app behavior
- Form not filled out

**Solutions:**
- Fill out Data Safety completely in Play Console
- Include all third-party SDKs that collect data
- Keep synchronized with Privacy Policy
- See template in `templates/data-safety-form.md`

---

### 5. Spam / Repetitive Content
**Frequency:** Medium
**Policy:** Spam and Minimum Functionality

**Symptoms:**
- App very similar to another app from the same developer
- Minimal functionality
- Programmatically generated content

**Solutions:**
- Ensure the app has unique value and significant functionality
- Avoid publishing multiple identical apps with just different themes

---

### 6. Payment Policy Violation
**Frequency:** Medium
**Policy:** Payments

**Symptoms:**
- App with digital purchases that don't use Google Play Billing
- Link to purchase outside Google Play for digital content

**Solutions:**
- Use Google Play Billing for all digital content
- Remove links/buttons for external purchase of digital content
- UserChoice Billing available in some countries (alternative checkout)

---

### 7. Content Inadequate for Rating
**Frequency:** Medium
**Policy:** Restricted Content

**Symptoms:**
- App incorrectly classified
- Adult content in app classified for all ages

**Solutions:**
- Fill out Content Rating Questionnaire honestly
- Classify correctly (IARC)
- Don't expose adult content in apps for minors

---

### 8. Misleading Icon, Screenshot, or Description
**Frequency:** Medium
**Policy:** Store Listing and Promotion

**Symptoms:**
- Screenshots promise non-existent features
- Icon imitates famous app

**Solutions:**
- Screenshots and app preview must reflect real experience
- Icon must be original
- Description without unverifiable claims ("the best", "the only")

---

### 9. Improper Use of Accessibility Permissions
**Frequency:** Low-Medium
**Policy:** Device and Network Abuse

**Symptoms:**
- App uses AccessibilityService for undeclared data collection

**Solutions:**
- Use AccessibilityService only for real accessibility features
- Any non-standard use requires special approval

---

### 10. Intellectual Property Violation
**Frequency:** Low-Medium
**Policy:** Intellectual Property

**Symptoms:**
- App uses third-party trademark without authorization
- Content protected by copyright

**Solutions:**
- Verify that name, icon, and content don't violate third-party IP
- Obtain necessary licenses for music, images, fonts
- Remove any unauthorized references to registered trademarks

---

## General Tips to Avoid Rejections

1. **Test on real device** before any submission
2. **Read the rejection completely** — reviewers include specific details
3. **Respond with screenshots** when contesting a rejection
4. **Keep a changelog** of what was changed to facilitate re-submission
5. **Use TestFlight/Internal Testing** extensively before production
6. **Monitor the app after approval** — apps can be removed later
7. **Keep Privacy Policy updated** as the app evolves
