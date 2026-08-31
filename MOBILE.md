# BatFIN Mobile Testing Guide

BatFIN is wrapped with Capacitor 7 for Android and iOS. The native projects reuse the existing React application and REST API without duplicating business logic.

## What is included

- Android project: `frontend/android/`
- iOS project: `frontend/ios/`
- Capacitor configuration: `frontend/capacitor.config.ts`
- Android-emulator debug APK: `frontend/mobile-builds/BatFIN-android-emulator-debug.apk`
- Native asset generator: `frontend/scripts/generate-mobile-assets.py`
- Generated app icon and splash sources: `frontend/mobile-assets/`

Native application ID:

```text
in.batfin.customer
```

The supplied `public/LOGO.png` is the source for the Android and iOS icons and splash screens.

## Important: the backend is still required

The APK and iOS project contain the frontend only. Authentication, PostgreSQL, assets, plans, ledger, health, payments, and support tickets still use the BatFIN Express API.

## Android emulator quick test

The provided debug APK is configured for:

```text
http://10.0.2.2:3000/api/v1
```

`10.0.2.2` is the Android emulator alias for the host computer.

1. Start PostgreSQL and the BatFIN backend on the host:

   ```bash
   cd backend
   npm ci
   npm run prisma:generate
   npx prisma migrate deploy
   npm run prisma:seed
   npm run dev
   ```

2. Start an Android emulator.

3. Install the APK:

   ```bash
   adb install -r frontend/mobile-builds/BatFIN-android-emulator-debug.apk
   ```

4. Open BatFIN and sign in:

   - Mobile: `9876543210`
   - OTP: `123456`

The backend must listen on `0.0.0.0:3000`, which the existing server configuration already does.

## Rebuild the Android emulator APK

Requirements:

- Android Studio or Android SDK Platform 35
- Android Build Tools 35
- JDK 21

From `frontend/`:

```bash
npm ci
npm run mobile:assets
npm run mobile:apk:emulator
```

Output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Copy it to a persistent deliverable path if needed:

```bash
cp android/app/build/outputs/apk/debug/app-debug.apk \
  mobile-builds/BatFIN-android-emulator-debug.apk
```

## Physical Android phone

A physical phone cannot use `10.0.2.2`. Use one of these options.

### Stable deployed HTTPS API

Build with your API URL:

```bash
cd frontend
VITE_API_BASE_URL=https://api.example.com/api/v1 \
  npm run mobile:build:sandbox
npx cap sync android
cd android
./gradlew assembleDebug
```

Ensure the backend allows the Capacitor Android origin:

```dotenv
CORS_ORIGIN=http://localhost:5173,https://localhost,capacitor://localhost
```

### API on the same Wi-Fi network

Use the host computer's LAN address:

```bash
VITE_API_BASE_URL=http://192.168.1.50:3000/api/v1 \
  npm run mobile:build:sandbox
npx cap sync android
cd android
./gradlew assembleDebug
```

The Android testing manifest permits cleartext traffic for emulator/LAN development. Use HTTPS for production.

### Current Arena/E2B sandbox API

The prepared sandbox mode points to:

```text
https://3000-i67kt9pxnnu0qfuvascko.e2b.app/api/v1
```

This Arena sandbox is protected by an E2B traffic-access token. The token is not available inside the workspace and is not embedded in the project. A physical build requires the sandbox owner's temporary token:

```bash
cd frontend
VITE_API_ACCESS_TOKEN='<temporary-e2b-traffic-token>' \
  npm run mobile:apk:sandbox
```

The app sends the token as `e2b-traffic-access-token`. `CapacitorHttp` is enabled so native requests are not blocked by browser CORS preflight behavior.

Sandbox IDs and traffic tokens are temporary. Rebuild after the sandbox changes, or use a stable deployed HTTPS API.

## iOS simulator

An iOS build requires macOS, Xcode, and CocoaPods. The Linux sandbox can generate and synchronize the Xcode project but cannot compile or sign an iOS application.

On a Mac:

```bash
cd frontend
npm ci
npm run mobile:assets
npm run mobile:sync:ios:simulator
cd ios/App
pod install
cd ../..
npm run mobile:open:ios
```

The simulator mode uses:

```text
http://localhost:3000/api/v1
```

Run the BatFIN backend on the Mac before launching the app.

## Physical iPhone or iPad

Use a stable HTTPS API or the token-protected sandbox build:

```bash
cd frontend
VITE_API_BASE_URL=https://api.example.com/api/v1 \
  npm run mobile:build:sandbox
npx cap sync ios
cd ios/App
pod install
open App.xcworkspace
```

For the current secured sandbox:

```bash
VITE_API_ACCESS_TOKEN='<temporary-e2b-traffic-token>' \
  npm run mobile:sync:ios:sandbox
```

Open the workspace in Xcode, select your Apple development team, choose the physical device, and run. An installable IPA requires Apple signing credentials and must be built on macOS.

## Mobile build modes

| Mode | API address | Intended target |
|---|---|---|
| `mobile-android-emulator` | `http://10.0.2.2:3000/api/v1` | Android emulator |
| `mobile-ios-simulator` | `http://localhost:3000/api/v1` | iOS simulator |
| `mobile-sandbox` | Current E2B HTTPS URL | Physical test with traffic token |

Environment files:

- `frontend/.env.mobile-android-emulator`
- `frontend/.env.mobile-ios-simulator`
- `frontend/.env.mobile-sandbox`

Shell variables override values in these files during a build.

## Mobile scripts

Run from `frontend/`:

| Script | Purpose |
|---|---|
| `npm run mobile:build:android-emulator` | Build web assets for Android emulator |
| `npm run mobile:build:ios-simulator` | Build web assets for iOS simulator |
| `npm run mobile:build:sandbox` | Build web assets for the current sandbox or an overridden API |
| `npm run mobile:sync:android:emulator` | Build and copy emulator assets into Android |
| `npm run mobile:sync:ios:simulator` | Build and copy simulator assets into iOS |
| `npm run mobile:sync:android:sandbox` | Build and sync Android sandbox assets |
| `npm run mobile:sync:ios:sandbox` | Build and sync iOS sandbox assets |
| `npm run mobile:apk:emulator` | Build an Android emulator debug APK |
| `npm run mobile:apk:sandbox` | Build an Android sandbox debug APK |
| `npm run mobile:open:android` | Open the project in Android Studio |
| `npm run mobile:open:ios` | Open the project in Xcode on macOS |
| `npm run mobile:assets` | Regenerate icons and splash screens from `LOGO.png` |
| `npm run mobile:doctor` | Inspect the Capacitor development environment |

## Native configuration

The Capacitor wrapper enables:

- Native HTTP request handling
- Native splash screen
- Status-bar styling
- Keyboard resize handling
- Android cleartext traffic for local emulator/LAN testing
- iOS local-network transport for simulator testing

Application configuration is in:

```text
frontend/capacitor.config.ts
```

## Refresh native projects after frontend changes

Android emulator:

```bash
npm run mobile:sync:android:emulator
```

iOS simulator:

```bash
npm run mobile:sync:ios:simulator
```

Physical sandbox build:

```bash
VITE_API_ACCESS_TOKEN='<token>' npm run mobile:build:sandbox
npx cap sync android
npx cap sync ios
```

## Debug APK checksum

The generated checksum is stored at:

```text
frontend/mobile-builds/BatFIN-android-emulator-debug.apk.sha256
```

The APK is debug-signed and intended only for testing. A production release requires a private Android signing key, release build configuration, a stable HTTPS API, and replacement of all development providers.
