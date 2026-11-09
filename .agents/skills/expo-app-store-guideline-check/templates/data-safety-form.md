# Guide: Filling Out Data Safety Section — Google Play

> Updated: 2026-03-28
> Source: https://support.google.com/googleplay/android-developer/answer/10787469

The Data Safety form is **mandatory** for publishing on Google Play.
Access: **Google Play Console > [Your App] > App content > Data safety**

---

## Process Overview

```
1. Data collection → 2. Data usage → 3. Sharing → 4. Security practices
```

---

## Section 1: Data Collection and Use

### Question: "Does the app collect or share any required user data types?"

**Answer based on app type:**
- App without backend, without analytics, without crashes: probably **NO**
- Most React Native apps with Firebase/Sentry: **YES**

---

## Data Categories — How to Map

### 📍 Location

| Subcategory | When to declare |
|-------------|-----------------|
| Approximate location | App uses `expo-location` with `Accuracy.Low/Balanced` |
| Precise location | App uses `expo-location` with `Accuracy.High/BestForNavigation` |

**Additional questions:**
- Processed in real time? If location in background = YES
- Shared with third parties? If sent to server or analytics = YES
- Required to function? If app doesn't work without location = YES

---

### 👤 Personal Information

| Subcategory | When to declare |
|-------------|-----------------|
| Name | Has registration with name |
| Email address | Login by email or registration |
| User IDs | Generates unique ID per user |
| Address (physical) | Has delivery or billing address |
| Phone number | Verification by SMS or WhatsApp |
| Race and ethnicity | [If relevant to the app] |
| Political or religious beliefs | [If relevant] |
| Sexual orientation | [If relevant] |
| Other information | Username, profile photo, date of birth |

---

### 💳 Financial Information

| Subcategory | When to declare |
|-------------|-----------------|
| Payment information | App processes payments directly |
| Purchase history | Stores purchase history (IAP) |
| Credit score | [Fintech] |
| Other finances | Balance, transactions, etc. |

**Note:** If using Google Play Billing, Google handles the payment — declare only if storing history.

---

### 🏥 Health and Fitness

| Subcategory | When to declare |
|-------------|-----------------|
| Health information | App collects health data (blood pressure, glucose, etc.) |
| Fitness information | Steps, exercises, calories, sleep |

---

### 📨 Messages

| Subcategory | When to declare |
|-------------|-----------------|
| Emails | App reads device emails |
| SMS or MMS | App reads SMS |
| Other in-app messages | App has internal chat |

---

### 📸 Photos and Videos

| Subcategory | When to declare |
|-------------|-----------------|
| Photos | App reads/stores user photos |
| Videos | App reads/stores user videos |

**When to declare:** If using `expo-image-picker` and SENDS the photos to a server.
If photos stay only on device: probably no need to declare.

---

### 🔊 Audio Files

| Subcategory | When to declare |
|-------------|-----------------|
| Voice or sound recordings | App records user audio |
| Music files | App accesses music library |
| Other audio files | |

---

### 📂 Files and Documents

| Subcategory | When to declare |
|-------------|-----------------|
| Files and documents | App accesses and/or stores user documents |

---

### 📅 Calendar

| Subcategory | When to declare |
|-------------|-----------------|
| Calendar events | App reads or writes to calendar (`expo-calendar`) |

---

### 👥 Contacts

| Subcategory | When to declare |
|-------------|-----------------|
| Contacts | App reads contact list (`expo-contacts`) |

---

### 📊 App Activity

| Subcategory | When to declare |
|-------------|-----------------|
| App interactions | Firebase Analytics, Amplitude, etc. collect this |
| In-app search history | App has internal search with history |
| Other user-generated content | Posts, comments, reviews |

---

### 🌐 Web Browsing History

| Subcategory | When to declare |
|-------------|-----------------|
| Web browsing history | App uses WebView and tracks visited URLs |

---

### 📈 App Information and Performance

| Subcategory | When to declare |
|-------------|-----------------|
| Crash logs | **Sentry, Firebase Crashlytics** — always declare |
| Diagnostics | Performance data, load times |

---

### 📱 Device IDs or Other

| Subcategory | When to declare |
|-------------|-----------------|
| Device ID | Advertising ID (GAID) — ad SDKs use this |

**SDKs that use Advertising ID:** Google AdMob, Firebase Analytics (in some cases),
Branch, Adjust, Appsflyer, Amplitude.

---

## Security Practices

### Data encrypted in transit?
- **YES** if using HTTPS on all APIs (should be YES)

### Do you provide a way for users to request their data be deleted?
- **YES** if Account Deletion is implemented (mandatory for Apple, recommended for Google)
- Specify if automatic (within the app) or by request (email)

---

## Practical Examples by App Type

### Personal Control App (no account, no analytics)
```
Collects data? NO
```

### App with Firebase + Sentry (no location, no camera)
```
✅ Crash logs (Sentry/Crashlytics)
✅ Diagnostics (performance)
✅ App activity (Firebase Analytics)
✅ Device IDs (Firebase — if using Analytics)

All used to improve the app.
Not shared with third parties (besides the SDKs themselves).
Encrypted in transit: YES
Data deletion: YES (if account deletion implemented)
```

### App with Camera + Location + Login
```
✅ Email (login)
✅ User ID (generated internally)
✅ Photos (if sent to server)
✅ Approximate or precise location
✅ App activity (analytics)
✅ Crash logs (crash reporting)

Location: required to function? Depends on the app.
Photos: shared with third parties? Depends.
```

---

## Final Tips

1. **Be precise, not excessive** — declare what you actually collect, not what you might collect
2. **Consistency is mandatory** — Data Safety must match the Privacy Policy
3. **Update after new SDKs** — each new SDK may require a new declaration
4. **Google may audit** — apps with inconsistent Data Safety may be removed
5. **Save draft** — the form allows saving drafts before publishing

---

## Common SDKs → Data Safety

| SDK | Data it collects | Categories to declare |
|-----|-----------------|----------------------|
| Firebase Analytics | Events, user properties | App activity, Device IDs |
| Firebase Crashlytics | Crashes, stack traces, device info | App info & performance |
| Sentry | Errors, device info, breadcrumbs | App info & performance |
| Amplitude | Events, sessions, user properties | App activity |
| Google AdMob | Advertising ID, behavior | Device IDs, App activity |
| Branch | Device ID, attribution | Device IDs, App activity |
| Expo Notifications | Push token | Device IDs |

---

## After Filling Out

- [ ] Review with Privacy Policy for consistency
- [ ] Save and publish in Play Console
- [ ] Keep local copy in `docs/data-safety.md` in the project
- [ ] Review each time a new SDK is added to the project
