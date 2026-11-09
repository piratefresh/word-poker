# Guide: Filling Out App Privacy Labels — Apple App Store

> Updated: 2026-03-28
> Access: **App Store Connect > [Your App] > App Privacy**

Privacy Labels are displayed on the app's page in the App Store before the user downloads it.
They are mandatory and must accurately reflect the data collected.

---

## The Three Main Categories

### 1. Data Used to Track You
Data **combined with data from other apps, websites, or third-party apps** for advertising purposes,
or shared with data brokers.

**Declare here if:**
- The app uses IDFA (Identifier for Advertisers)
- The app uses cookies for cross-app tracking
- The app shares data with advertising platforms
- The app uses attribution SDKs (Branch, Adjust, Appsflyer)

**Requires:** App Tracking Transparency (ATT) for iOS 14.5+

### 2. Data Linked to You
Data collected and **associated with the user's identity** (account, name, email, etc.)

**Declare here if:**
- The app has a login/account system
- Data can be traced back to the user

### 3. Data Not Linked to You
Data collected but **not associated** with the user's identity (anonymous or pseudo-anonymized).

**Declare here if:**
- Crash logs without identifying information
- Analytics with anonymous IDs
- Technical diagnostics

---

## Data Types — When to Declare

### Contact Info
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Name | ✓ if has profile | | |
| Email Address | ✓ if uses email for login | | |
| Phone Number | ✓ if collects phone | | |
| Physical Address | ✓ if collects address | | |
| Other User Contact Info | ✓ if collects other contact data | | |

### Health & Fitness
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Health | ✓ if health app with account | | |
| Fitness | ✓ if fitness app with account | | |

### Financial Info
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Payment Info | ✓ if stores payment data | | |
| Credit Info | | | |
| Other Financial Info | ✓ if stores transaction history | | |

### Location
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Precise Location | ✓ if stored with account | ✓ if anonymous | ✓ if for advertising |
| Coarse Location | ✓ if stored with account | ✓ if anonymous | |

### Sensitive Info
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Sensitive Info | ✓ if collects sensitive data (race, religion, etc.) | | |

### Contacts
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Contacts | ✓ if syncs or stores contacts | | |

### User Content
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Emails or Text Messages | ✓ if app has chat | | |
| Photos or Videos | ✓ if stores user-uploaded photos | | |
| Audio Data | ✓ if stores recordings | | |
| Gameplay Content | ✓ if has game content | | |
| Customer Support | ✓ if has support chat | | |
| Other User Content | ✓ if has other UGC | | |

### Browsing History
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Browsing History | ✓ if tracks URLs in WebView | | |

### Search History
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Search History | ✓ if stores user searches | | |

### Identifiers
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| User ID | ✓ for almost all apps with account | | |
| Device ID | | ✓ for anonymous analytics | ✓ if for advertising (IDFA) |

### Purchases
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Purchase History | ✓ if stores IAP history | | |

### Usage Data (Most common)
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Product Interaction | ✓ if analytics linked to account | ✓ if anonymous analytics | |
| Advertising Data | | | ✓ always |
| Other Usage Data | ✓ or ✓ depending on case | | |

### Diagnostics (Very common — Sentry/Crashlytics)
| Type | Linked | Not Linked | Track |
|------|--------|------------|-------|
| Crash Data | | ✓ usually anonymous | |
| Performance Data | | ✓ usually anonymous | |
| Other Diagnostic Data | | ✓ usually anonymous | |

---

## Examples by App Type

### Simple app without account (e.g., calculator, offline app)
```
Data Not Collected ✅
(no data collection)
```

### App with account + Firebase Analytics + Sentry
```
Data Linked to You:
  - User ID (Account identifier generated internally)
  - Email Address (login)
  - Product Interaction (Firebase Analytics → app events)

Data Not Linked to You:
  - Crash Data (Sentry — no PII if configured correctly)
  - Performance Data (Sentry)
```

### Social app + camera + location
```
Data Linked to You:
  - Name (profile)
  - Email Address (login)
  - Photos or Videos (uploaded photos)
  - Precise Location (if geotag in photos)
  - User ID
  - Product Interaction (analytics)

Data Not Linked to You:
  - Crash Data
  - Coarse Location (if region analytics)

Data Used to Track You:
  (only if uses IDFA for advertising)
```

---

## Data Purposes

For each declared data type, inform the purpose:

| Purpose | Description |
|-----------|-----------|
| Third-Party Advertising | Display third-party ads |
| Developer's Advertising or Marketing | Your own marketing |
| Analytics | Understand app usage |
| Product Personalization | Personalize experience |
| App Functionality | Required for app to function |
| Other Purposes | Other specific purposes |

---

## Filling Process

1. **Access** App Store Connect > [App] > App Privacy
2. **Click** "Edit" or "Get Started"
3. For each data type the app collects:
   - Select the category
   - Indicate if it's Linked, Not Linked, or Tracking
   - Select the purpose(s)
   - Indicate if it's required or optional for the app
4. **Save** and publish with the next version

---

## Common SDKs → Privacy Labels

| SDK | Typical Categories |
|-----|-------------------|
| Firebase Analytics | Product Interaction (Linked or Not Linked) |
| Firebase Crashlytics | Crash Data (Not Linked) |
| Sentry | Crash Data, Performance Data (Not Linked) |
| Firebase Authentication | User ID, Email (Linked) |
| expo-notifications | Device ID (Linked if push token stored) |
| expo-location | Precise/Coarse Location (Linked or Not Linked) |
| Google Sign-In | Name, Email, User ID (Linked) |
| Apple Sign-In | Email (optionally), User ID (Linked) |

---

## Important Tips

1. **Privacy Labels ≠ Privacy Policy** — Labels are a visual summary, not the complete document
2. **Must be consistent with Privacy Policy** — data declared in one must be in the other
3. **Update with each version** that introduces new data collection
4. **Apple verifies** — incorrect Privacy Labels are grounds for rejection
5. **"Not Collected" is not an option** — if not collected, simply don't declare that category
6. **Tracking requires ATT** — if declaring "Used to Track You", must have ATT implemented

---

## After Filling Out

- [ ] Review against Privacy Policy for consistency
- [ ] Verify that ATT is implemented if declared "Used to Track You"
- [ ] Save screenshot of settings for future reference
- [ ] Review whenever a new SDK or feature is added to the app
