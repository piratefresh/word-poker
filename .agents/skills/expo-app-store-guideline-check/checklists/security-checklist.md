# Data Security Checklist

> Version: 1.0 | Updated: 2026-03-28
> Based on OWASP Mobile Top 10 and best practices for React Native/Expo

---

## 1. Data Storage

### Sensitive Data
- [ ] Authentication tokens stored in `expo-secure-store` (encrypted)
- [ ] Passwords NEVER stored locally
- [ ] Credit card data NEVER stored locally (use tokenization)
- [ ] Health information and documents in encrypted storage
- [ ] `AsyncStorage` used ONLY for non-sensitive data (preferences, cache)

### Storage Verification
```typescript
// ✅ Correct — sensitive data
import * as SecureStore from 'expo-secure-store';
await SecureStore.setItemAsync('authToken', token);

// ❌ Incorrect — sensitive data
import AsyncStorage from '@react-native-async-storage/async-storage';
await AsyncStorage.setItem('authToken', token); // DO NOT do this
```

- [ ] Search for `AsyncStorage.setItem` with words like token/auth/password finds no matches
- [ ] No user data in unencrypted cookies

---

## 2. Secure Communication

### HTTPS / TLS
- [ ] All API endpoints use HTTPS
- [ ] No `http://` URLs hardcoded in code (except localhost)
- [ ] Minimum TLS version: TLS 1.2 (TLS 1.3 recommended)
- [ ] Valid and non-expired SSL certificates on endpoints

### Android Network Security
- [ ] `android:usesCleartextTraffic="false"` in AndroidManifest (default on Android 9+)
- [ ] `network_security_config.xml` does not allow cleartext for production domains
- [ ] No global `cleartextTrafficPermitted="true"` in production build

### iOS App Transport Security (ATS)
- [ ] No `NSAllowsArbitraryLoads: true` in production Info.plist
- [ ] ATS exceptions documented and justified (if necessary)

---

## 3. Secrets and API Keys

### In Source Code
- [ ] No hardcoded API keys in `.ts`, `.tsx`, `.js`, `.jsx` files
- [ ] No tokens or passwords in source code
- [ ] No exposed database connection strings
- [ ] Search for common secret patterns finds no matches:
  ```bash
  grep -rn "api_key\|secret_key\|private_key" src/ --include="*.ts"
  ```

### In Configuration Files
- [ ] `.env` files with real values not committed to git
- [ ] `.gitignore` includes: `.env`, `.env.local`, `.env.production`, `.env.staging`
- [ ] `.env.example` present with placeholder values (no real secrets)
- [ ] `eas.json` does not contain secrets (use EAS Secrets)
- [ ] `app.json` does not contain secrets in `expo.extra`

### Correct Environment Variables
```bash
# Check .gitignore
cat .gitignore | grep "\.env"

# Check if .env is tracked (it shouldn't be)
git status .env
```

---

## 4. Authentication and Session

- [ ] JWT tokens with short expiration time (access token: 15min-1h)
- [ ] Refresh tokens with longer expiration (e.g., 30 days) and rotation
- [ ] Logout invalidates tokens on the server (not just on client)
- [ ] No tokens in URLs (use Authorization header)
- [ ] "Revoke all sessions" implementation available for user
- [ ] Rate limiting on login endpoint (brute force protection)
- [ ] Multi-factor authentication (MFA) for sensitive accounts (recommended)

---

## 5. Injection and Validation

- [ ] User inputs validated before sending to API
- [ ] No usage of `eval()` or `new Function()` in code
- [ ] No unsanitized string interpolation in queries
- [ ] No XSS in WebViews (if using user HTML rendering)
- [ ] Deep linking verifies origin before executing actions

---

## 6. Privacy in Logs

- [ ] Production logs do not include personal data
- [ ] Logs do not include tokens, passwords, or secrets
- [ ] `console.log` with sensitive data removed before release
- [ ] Crash reporters (Sentry, Crashlytics) with PII scrubbing configured
- [ ] Different logging configuration for dev/production

```typescript
// Recommended library for secure logging
import * as Logger from 'react-native-logs';
// Configure to disable in production
```

---

## 7. Code Protection (Production Build)

- [ ] Release/production mode active in build (not debug)
- [ ] Minification and obfuscation enabled in production build
- [ ] `__DEV__` and development code removed from build
- [ ] Remote Debugger disabled in production
- [ ] Flipper disabled in production

### EAS Build — check eas.json:
```json
{
  "build": {
    "production": {
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

---

## 8. Biometrics and Local Authentication

- [ ] Face ID/Touch ID via `expo-local-authentication` (not custom implementation)
- [ ] Fallback to PIN/password if biometrics not available
- [ ] Local authentication does not replace server authentication for critical operations
- [ ] Re-authentication requested for sensitive actions (payments, account deletion)

---

## 9. Updates and Dependencies

- [ ] `npm audit` or `yarn audit` with no critical/high vulnerabilities
- [ ] Dependencies up to date (check with `npx npm-check-updates`)
- [ ] React Native on latest LTS version
- [ ] Expo SDK on latest version (or LTS)
- [ ] Dependency update process documented (e.g., monthly)

---

## 10. Handling Sensitive Data in Memory

- [ ] Passwords cleared from memory after use (difficult in JS, but avoid unnecessary persistence)
- [ ] Clipboard cleared after copying sensitive data (optional, but good practice)
- [ ] Screenshots blocked on screens with financial or health data (Android: `FLAG_SECURE`, iOS: similar)

---

## 11. SSL Pinning (Recommended for Critical Apps)

For financial, health, or highly sensitive data apps:

- [ ] SSL Pinning implemented for critical endpoints
- [ ] Certificate includes backup pins (for secure rotation)
- [ ] Pin update process documented

```bash
# Install
npm install react-native-ssl-pinning
```

---

## Automatic Verification

Run the security check:
```bash
bash scripts/check-security.sh .
```

---

## OWASP Mobile Top 10 (2023) — Coverage

| Risk | Covered | How |
|------|---------|-----|
| M1: Improper Credential Usage | ✅ | Sections 1, 3, 4 |
| M2: Inadequate Supply Chain Security | ✅ | Section 9 |
| M3: Insecure Authentication/Authorization | ✅ | Section 4 |
| M4: Insufficient Input/Output Validation | ✅ | Section 5 |
| M5: Insecure Communication | ✅ | Section 2 |
| M6: Inadequate Privacy Controls | ✅ | Section 6, `checklists/privacy-compliance.md` |
| M7: Insufficient Binary Protections | ✅ | Section 7 |
| M8: Security Misconfiguration | ✅ | Sections 2, 3 |
| M9: Insecure Data Storage | ✅ | Section 1 |
| M10: Insufficient Cryptography | ✅ | Sections 1, 2, 4 |

---

## References

- [OWASP Mobile Top 10](https://owasp.org/www-project-mobile-top-10/)
- [React Native Security](https://reactnative.dev/docs/security)
- [Expo Security Guide](https://docs.expo.dev/guides/security/)
- [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/)
