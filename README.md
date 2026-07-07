# Trendzo Mockup — Mobile App

React Native **CLI** (bare, TypeScript) app for the Trendzo AI catalog + virtual
try-on flows. Talks to the existing backend in the sibling `../backend` folder.
Editorial / Swiss / brutalist-minimal design — warm-gray canvas, one chartreuse
accent, giant stacked grotesk headlines on an 8pt grid.

> Not Expo. Uses native modules (vision-camera, reanimated, fast-image, etc.),
> so you need the full RN native toolchain.

## Stack

- React Native 0.86 (New Architecture) · TypeScript
- Navigation: `@react-navigation/native` + native-stack
- Camera: `react-native-vision-camera` (4.x) · Picker: `react-native-image-picker`
- Save to gallery: `@react-native-camera-roll/camera-roll` + `react-native-blob-util`
- Animation: `react-native-reanimated` v4 (+ `react-native-worklets`) · `react-native-gesture-handler`
- Images: `@d11/react-native-fast-image` (maintained fork; React 19 / New-Arch safe)
- Data: `axios` + `@tanstack/react-query` · State: `zustand` (persisted via AsyncStorage)
- Env: `react-native-config` · Fonts: bundled Inter (asset-linked)
- Resize/compress: done at pick time via image-picker `maxWidth`/`maxHeight`/`quality`

## Prerequisites

- Node ≥ 20, Watchman, JDK 17
- iOS: Xcode + CocoaPods (`sudo gem install cocoapods` or `bundle`)
- Android: Android SDK, an emulator or device, `ANDROID_HOME` set

## Install

```bash
cd mobile
npm install

# Bundle fonts into the native projects (already run once; re-run if fonts change)
npx react-native-asset

# iOS pods
cd ios && pod install && cd ..
```

## Configure the backend URL (READ THIS — it will bite you otherwise)

The app resolves its base URL as: **Dev Settings override → `.env` `API_BASE_URL` →
platform default**. Copy `.env.example` to `.env` if you want to pin a value.

| Target | Base URL |
|---|---|
| iOS simulator | `http://localhost:5055` |
| Android emulator | `http://10.0.2.2:5055` (localhost inside the emulator = the emulator) |
| Physical device | your dev machine's LAN IP, e.g. `http://192.168.1.20:5055` |

**Physical device gotcha:** also set the backend's `PUBLIC_BASE_URL` to that same
LAN IP, or the `/files/...` image URLs the API returns won't load on the device.

You can change the base URL live at runtime from the in-app **Dev Settings**
screen (tap "Dev" on the Home floating nav) and hit **Test connection**.

### Cleartext HTTP (local dev)

- Android: `usesCleartextTraffic` is `true` for **debug** builds only
  (`android/app/build.gradle` → `buildTypes.debug.manifestPlaceholders`).
- iOS: `NSAllowsArbitraryLoads` + `NSAllowsLocalNetworking` are enabled in
  `Info.plist` for dev. **Remove `NSAllowsArbitraryLoads` before shipping.**

## Run

```bash
# Start the backend first (in ../backend)
cd ../backend && node server.mjs   # listens on :5055

# Metro
npm start

# iOS
npm run ios         # or open ios/TrendzoMockup.xcworkspace in Xcode

# Android (emulator/device running)
npm run android
```

## Mock mode (no backend needed)

Flip **Mock mode** on in Dev Settings, or set `MOCK=true` in `.env` and rebuild.
Every screen works against placeholder data (picsum images) — great for UI work.

## Permissions

Requested at runtime on both platforms:
- Camera (garment/person capture)
- Photo library (upload) + add-to-library (save mockups)

If a permission is blocked, the UI shows a primer and an **Open Settings** link.

## Project structure

```
src/
  api/          axios client, typed endpoints, React Query hooks, error norm, mock data
  components/   HeroHeadline, Card, TwoCardGrid, FloatingNavBar, PrimaryButton,
                SkeletonCard, StatusTicker, MockupGrid, ImageViewer, Toast, AppImage, …
  config/       env resolution (platform base URL)
  navigation/   RootNavigator + typed params
  screens/      Home → Capture → ReviewPhoto → Configure → Generating →
                ReviewResults → Publish → PublishSuccess; TryOn → TryOnResult; DevSettings
  store/        zustand: settings (baseUrl/mock), session (recent submissions)
  theme/        design tokens (colors, spacing, radii, type scale)
  types/        enums (mirrors backend contract) + request/response types
  utils/        money (paise), image (resize/FormData), gallery (save/share),
                permissions, haptics
```

## Backend flows (see `../backend/API_CONTRACT.md`)

- Catalog: `POST /api/catalog/submissions` → `decision` (accept/reject) → `publish`.
- Quick mockups: `POST /api/mockups`. Try-on: `POST /api/tryon`.
- Money is integer **paise** (₹1 = 100 paise) — see `utils/money.ts`.
- Button gating enforces preconditions: decision needs `ready_for_review`,
  publish needs `accepted`.

## Notes / deviations from the original spec

- `react-native-fast-image` (unmaintained, React ≤18) → swapped for the
  maintained `@d11/react-native-fast-image` fork, isolated behind `AppImage`.
- Reanimated pinned to v4 (RN 0.86 default) with `react-native-worklets`; the
  Babel plugin is `react-native-worklets/plugin` (must be last).
- vision-camera pinned to stable 4.x (the 5.x alpha has an undocumented API).
- `@bam.tech/react-native-image-resizer` was dropped — its podspec references the
  removed `React-Codegen` pod and fails under RN 0.86 New Arch. Client-side
  downscaling now happens at pick time via image-picker options; `prepareUpload`
  stays async so a native re-encode step can be reintroduced later.
