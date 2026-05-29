# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Skills

Before DevNexus release, version iteration, plugin, README, release notes, RepoWiki, website, or `PLAN.md` work, read and follow:
- `.agents/skills/devnexus-release-workflow/SKILL.md`

## Commands

| Intent | Command |
|--------|---------|
| Frontend dev server | `npm run dev` (Vite on port 1420) |
| Full desktop app (dev) | `npm run tauri dev` |
| Type-check + frontend build | `npm run build` |
| Type-check only (lint) | `npm run lint` |
| Run all tests | `npm test` |
| Watch mode tests | `npm run test:watch` |
| Rust type-check | `cargo check` (inside `src-tauri/`) |
| Production build | `npm run tauri build` |

Run a single test file: `npx vitest run tests/app/plugin-registry/registry.test.ts`

## Release Notes

Keep app versions synchronized across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Release notes are bilingual: English files live at `docs/releases/en/vX.Y.Z.md` and Chinese files live at `docs/releases/cn/vX.Y.Z.md`. The GitHub release workflow reads the English file matching the pushed tag name.

## Architecture

### Plugin System

Plugins are registered at compile time — there is no runtime plugin loading. Every plugin is a React component wrapped in a `PluginManifest`:

```typescript
// src/app/plugin-registry/types.ts
interface PluginManifest {
  id: string;
  name: string;
  icon: ReactNode;        // Ant Design icon
  version: string;
  component: () => ReactNode;
  sidebarOrder: number;   // lower = higher in sidebar
}
```

Registration flow: `src/plugins/<name>/index.tsx` exports a manifest → `src/app/plugin-registry/builtin.ts` calls `registerBuiltinPlugins()` → `src/main.tsx` calls it on startup → `PluginRouter.tsx` reads `selectedPluginId` from `useSettingsStore` and renders the active plugin.

Only one plugin is visible at a time. To add a new plugin: create `src/plugins/<name>/index.tsx`, export a manifest, add it to `builtin.ts`.

### Tauri Command Layer

All backend logic lives in Rust and is exposed via Tauri commands. Naming convention: `cmd_<verb>_<noun>` (e.g. `cmd_scan_keys`, `cmd_hset`, `cmd_execute_raw`).

Commands are registered in `src-tauri/src/lib.rs` inside `.invoke_handler(tauri::generate_handler![...])`. All commands return `Result<T, String>` so errors serialize cleanly to JavaScript.

Frontend calls use `invoke()` from `@tauri-apps/api/core`. Rust structs use `#[serde(rename_all = "camelCase")]` so field names match TypeScript conventions automatically.

### Rust Backend Layout

```
src-tauri/src/
├── lib.rs                    # Tauri builder + all command registrations
├── crypto/mod.rs             # AES-256-GCM encrypt/decrypt (DevNexus key file with legacy migration)
├── db/
│   ├── init.rs               # SQLite schema (7 tables, run on startup)
│   ├── connection_repo.rs    # Redis connection CRUD
│   └── ssh_connection_repo.rs
└── plugins/
    ├── redis/
    │   ├── commands.rs       # ~45 Tauri command handlers
    │   ├── pool.rs           # OnceLock<Mutex<HashMap<id, redis::Client>>>
    │   └── types.rs          # Serde structs for all Redis data types
    └── ssh/
        ├── session_pool.rs   # SSH session pool (Phase 2, not yet wired up)
        └── types.rs
```

Redis client pool uses `OnceLock<Mutex<HashMap<String, redis::Client>>>` — clients persist in memory until `cmd_disconnect` is called. All Redis I/O is synchronous at the command level.

### Frontend State (Zustand)

Each plugin owns its own Zustand stores under `src/plugins/<name>/store/`. Global stores live in `src/app/store/`:
- `useThemeStore` — `mode: 'light' | 'dark'`, persisted to localStorage
- `useSettingsStore` — `selectedPluginId`, persisted to localStorage

Redis plugin stores: `useConnectionsStore`, `useWorkspaceStore` (active view + connection), `useKeyBrowserStore`, `useConsoleStore`, `useServerInfoStore`.

### Database

SQLite is initialized on startup from `db/init.rs`. Tables include Redis, SSH, S3, MongoDB, MySQL, and Network diagnostic storage. Connection passwords are encrypted with AES-256-GCM before storage using the app-wide DevNexus key file. Startup migrates legacy local database/key filenames to the DevNexus names when needed.

### Testing

Tests mirror `src/` layout under `tests/`. Currently only plugin registry is covered (`tests/app/plugin-registry/registry.test.ts`). Test framework is Vitest; tests use `beforeEach` to clear registry state between cases.

## Key Conventions

- **Directories**: `kebab-case`; **Components**: `PascalCase`; **Store/util files**: `camelCase`
- TypeScript strict mode: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` are all on
- Path alias `@/` maps to `src/`
- Tauri window has no native decorations — the custom `Titlebar.tsx` handles minimize/maximize/close via `appWindow` API
