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

## Recommended Mobile Scope

For the first usable mobile build, keep the surface small:

- API Debugger basics
- LAN Chat text messaging
- WebSocket-assisted LAN discovery
- Read-only or lightweight network tools

Defer or hide until tested:

- SSH terminal
- Local file server attachment sharing
- Desktop-specific window controls
- Large database table views without mobile layout work

## Notes

This branch intentionally does not commit generated Android/iOS projects yet. Run the init commands on a machine with the required SDKs, inspect the generated files, then decide whether the generated platform projects should be committed.
