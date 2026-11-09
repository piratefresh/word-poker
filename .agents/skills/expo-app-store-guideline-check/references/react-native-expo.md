# React Native / Expo — Specific Checks

> Last updated: 2026-03-28
> Expo Documentation: https://docs.expo.dev

---

## Expo SDK — Versions and Compatibility

| SDK | Status | iOS Support | Android Support |
|-----|--------|-------------|-----------------|
| SDK 52 | Current | iOS 16+ | Android 7+ (API 24+) |
| SDK 51 | LTS | iOS 15.1+ | Android 6+ (API 23+) |
| SDK 50 | Deprecated | iOS 13+ | Android 6+ |
| SDK 49 and earlier | EOL | Not recommended | Not recommended |

**Check:** `expo upgrade` to update to the latest SDK.

---

## Privacy Manifest (iOS) in Expo

### Configuration in app.json

```json
{
  "expo": {
    "ios": {
      "privacyManifests": {
        "NSPrivacyTracking": false,
        "NSPrivacyTrackingDomains": [],
        "NSPrivacyCollectedDataTypes": [],
        "NSPrivacyAccessedAPITypes": [
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
            "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
            "NSPrivacyAccessedAPITypeReasons": ["C617.1"]
          },
          {
            "NSPrivacyAccessedAPICategorySystemBootTime": "35F9.1",
            "NSPrivacyAccessedAPITypeReasons": ["35F9.1"]
          }
        ]
      }
    }
  }
}
```

### APIs used by React Native Core
React Native core uses internally:
- `NSPrivacyAccessedAPICategoryUserDefaults` (reason: CA92.1)
- `NSPrivacyAccessedAPICategoryFileTimestamp` (reason: C617.1)
- `NSPrivacyAccessedAPICategorySystemBootTime` (reason: 35F9.1)
- `NSPrivacyAccessedAPICategoryDiskSpace` (reason: E174.1)

**Always declare all 4 APIs above** even without using additional modules.

---

## expo-secure-store

Encrypted storage for sensitive data:

```bash
npx expo install expo-secure-store
```

```typescript
import * as SecureStore from 'expo-secure-store';

// Save
await SecureStore.setItemAsync('authToken', token);

// Read
const token = await SecureStore.getItemAsync('authToken');

// Delete
await SecureStore.deleteItemAsync('authToken');
```

**Rule:** Use expo-secure-store for tokens, passwords, API keys.
Use AsyncStorage only for non-sensitive data (preferences, cache).

---

## expo-tracking-transparency (ATT)

```bash
npx expo install expo-tracking-transparency
```

```typescript
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

// Before initializing Firebase Analytics, Amplitude, etc.
const { status } = await requestTrackingPermissionsAsync();
if (status === 'granted') {
  // Initialize tracking SDKs
}
```

In `app.json`, add:
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSUserTrackingUsageDescription": "We use your data to personalize the experience and improve the app."
      }
    }
  }
}
```

---

## Common Permissions in Expo

### Camera
```json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera to take photos."
        }
      ]
    ]
  }
}
```

### Location
```json
{
  "expo": {
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "We use your location to show nearby points.",
          "locationWhenInUsePermission": "We use your location to show nearby points."
        }
      ]
    ]
  }
}
```

### Push Notifications
```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff",
          "sounds": ["./assets/notification-sound.wav"]
        }
      ]
    ]
  }
}
```

---

## Expo OTA Updates (Over-The-Air)

### Store Limitations
- OTA updates **cannot** change core app functionality
- Cannot add new permissions via OTA
- Can: fix bugs, update content, adjust UI
- Apple: OTA that changes primary functionality = rejection
- Google: OTA allowed with more flexibility

### Configuration
```json
{
  "expo": {
    "updates": {
      "enabled": true,
      "fallbackToCacheTimeout": 0,
      "url": "https://u.expo.dev/your-project-id"
    },
    "runtimeVersion": {
      "policy": "sdkVersion"
    }
  }
}
```

---

## Deep Linking and Universal Links

### Basic Configuration
```json
{
  "expo": {
    "scheme": "myapp",
    "ios": {
      "associatedDomains": ["applinks:myapp.com"]
    },
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "myapp.com",
              "pathPrefix": "/app"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

### apple-app-site-association file (iOS)
Host at `https://myapp.com/.well-known/apple-app-site-association`:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.company.app",
        "paths": ["/app/*"]
      }
    ]
  }
}
```

---

## EAS Build

### eas.json Configuration
```json
{
  "cli": {
    "version": ">= 7.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "production": {
      "ios": { "resourceClass": "m-medium" },
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "123456789"
      },
      "android": {
        "serviceAccountKeyPath": "./play-store-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

### EAS Secrets (for build credentials)
```bash
# Add secret
eas secret:create --scope project --name MY_API_KEY --value "secret_value"

# Use in app.config.js
export default {
  expo: {
    extra: {
      apiUrl: process.env.API_URL,  // DO NOT use process.env for client secrets!
    }
  }
}
```

**Warning:** `expo.extra` is included in the app bundle — don't put secrets there!
Secrets should only be on the server/backend.

---

## React Native New Architecture (Fabric + TurboModules)

Starting from React Native 0.74+, New Architecture is the default.
For Expo SDK 52+, New Architecture is enabled by default.

```json
{
  "expo": {
    "newArchEnabled": true
  }
}
```

Check native module compatibility with New Architecture before enabling.

---

## Store Configuration

### Complete app.json (Recommended Example)
```json
{
  "expo": {
    "name": "My App",
    "slug": "my-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "myapp",
    "privacyPolicyUrl": "https://myapp.com/privacy",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.company.myapp",
      "buildNumber": "1",
      "privacyPolicyUrl": "https://myapp.com/privacy",
      "infoPlist": {
        "NSCameraUsageDescription": "We use the camera for you to take profile photos.",
        "NSPhotoLibraryUsageDescription": "We access the gallery for you to choose a profile photo."
      },
      "privacyManifests": {
        "NSPrivacyTracking": false,
        "NSPrivacyAccessedAPITypes": [
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
            "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
            "NSPrivacyAccessedAPITypeReasons": ["C617.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime",
            "NSPrivacyAccessedAPITypeReasons": ["35F9.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace",
            "NSPrivacyAccessedAPITypeReasons": ["E174.1"]
          }
        ]
      }
    },
    "android": {
      "package": "com.company.myapp",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [
        "CAMERA",
        "READ_MEDIA_IMAGES"
      ]
    },
    "plugins": [
      "expo-router",
      [
        "expo-camera",
        {
          "cameraPermission": "We use the camera for you to take profile photos."
        }
      ]
    ]
  }
}
```

---

## Resources

- [Expo Documentation](https://docs.expo.dev)
- [Expo Apple Privacy Manifest Guide](https://docs.expo.dev/guides/apple-privacy/)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Expo Security Best Practices](https://docs.expo.dev/guides/security/)
- [React Native Security](https://reactnative.dev/docs/security)
