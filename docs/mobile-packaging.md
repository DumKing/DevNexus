# DevNexus Mobile Packaging Branch

This branch is an experimental starting point for building DevNexus with Tauri mobile targets.

The desktop app has several features that need mobile review before a production release:

- LAN Chat UDP/TCP listeners and local file sharing need Android/iOS permission checks.
- SSH terminal behavior should be reviewed on small touch screens.
- Native file dialogs, local filesystem paths, and background networking differ on mobile.
- macOS/Windows titlebar behavior is desktop-only and should remain hidden or ignored on mobile.

## Prerequisites

Android:

- Android Studio
- Android SDK and NDK
- Java toolchain compatible with the installed Android Gradle Plugin
- Rust Android targets installed by Tauri when prompted

iOS:

- macOS
- Xcode
- Apple Developer signing setup for device builds
- Rust iOS targets installed by Tauri when prompted

## First-Time Android Setup

```bash
npm install
npm run mobile:android:init
npm run mobile:android:dev
```

Build an Android package:

```bash
npm run mobile:android:build
```

Tauri will generate Android project files under `src-tauri/gen/android` after initialization.

CI uses:

```bash
npm run mobile:android:init -- --ci
npm run mobile:android:build -- --ci --apk --aab --target aarch64
```

## First-Time iOS Setup

```bash
npm install
npm run mobile:ios:init
npm run mobile:ios:dev
```

Build an iOS package:

```bash
npm run mobile:ios:build
```

Tauri will generate iOS project files under `src-tauri/gen/apple` after initialization.

CI builds an unsigned iOS device IPA:

```bash
npm run mobile:ios:init -- --ci
rustup target add aarch64-apple-ios
npm run mobile:ios:build -- --ci --target aarch64 --open &
TAURI_IOS_BUILD_PID="$!"
# Wait for Tauri's Xcode options server addr file before running xcodebuild.
ADDR_FILE="${TMPDIR:-/tmp/}com.devnexus.desktop-server-addr"
while [ ! -s "$ADDR_FILE" ]; do sleep 1; done
cd src-tauri/gen/apple
xcodebuild -project devnexus.xcodeproj -scheme devnexus_iOS -configuration release -sdk iphoneos -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" DEVELOPMENT_TEAM="" build
kill "$TAURI_IOS_BUILD_PID"
```

The workflow packages the generated device `.app` into `DevNexus-ios-aarch64-unsigned.ipa` by creating a standard `Payload/<App>.app` archive. This artifact is for later manual signing only and cannot be installed on an iPhone until it is signed with a certificate and provisioning profile that match the app bundle ID.

The provisioning profile used when re-signing must match `src-tauri/tauri.conf.json` `identifier`, currently `com.devnexus.desktop`.

## GitHub Actions

`.github/workflows/build-mobile.yml` runs automatically when `experiment-mobile-packaging` is pushed and can also be started manually.

It produces:

- Android aarch64 APK/AAB artifacts
- iOS aarch64 unsigned IPA artifact for manual signing

The Android job runs on Ubuntu with Java, Android SDK, Rust, and Node. The iOS job runs on macOS with Xcode, Rust, and Node.

The mobile build uses a reduced Rust backend so Android/iOS do not compile the desktop-only plugin dependency graph. This avoids native desktop dependencies such as OpenSSL, librdkafka, and libcurl blocking mobile CI before the mobile product surface is ready.

## Recommended Mobile Scope

For the first usable mobile build, keep the surface small:

- LAN Chat text messaging
- WebSocket-assisted LAN discovery
- Read-only or lightweight network tools after mobile backend review

Defer or hide until tested:

- API Debugger native request sending
- SSH terminal
- Local file server attachment sharing
- Redis, S3, MongoDB, MySQL, and MQ desktop plugin surfaces
- Desktop-specific window controls
- Large database table views without mobile layout work

## Current Mobile UI Adjustments

- Desktop titlebar and resize handles are disabled on mobile runtime.
- Sidebar becomes a bottom navigation rail on phone-sized screens.
- Footer status bar is hidden on phone-sized screens to preserve vertical space.
- LAN Chat opens as a full-screen touch-oriented panel on mobile.
- Viewport uses `viewport-fit=cover` for safe-area aware layouts.

## Notes

This branch intentionally does not commit generated Android/iOS projects yet. Run the init commands on a machine with the required SDKs, inspect the generated files, then decide whether the generated platform projects should be committed.
