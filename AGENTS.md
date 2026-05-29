# AGENTS.md

This file provides guidance to the AI agent when working with code in this repository.

## Project Skills

Before DevNexus release, version iteration, plugin, README, release notes, RepoWiki, website, or `PLAN.md` work, read and follow:
- `.agents/skills/devnexus-release-workflow/SKILL.md`

## Verification

After meaningful changes, run all three:
- `npm test`
- `npm run build` (runs `tsc && vite build`, not just vite)
- `cd src-tauri && cargo check`

`npm run lint` is `tsc --noEmit` only — there is no ESLint/Prettier.

## Plugin Registration (Two Sides Required)

Adding a plugin requires changes in both stacks:
1. Frontend: `src/plugins/<id>/index.tsx` exports a `PluginManifest`, registered in `src/app/plugin-registry/builtin.ts`
2. Backend: `src-tauri/src/plugins/<id>/mod.rs` with `commands.rs`/`types.rs`, commands added to `tauri::generate_handler![]` in `src-tauri/src/lib.rs`

Plugins are compile-time registered (no runtime loading). Only one plugin visible at a time. `sidebarOrder: number` — lower value appears higher in sidebar.

## Tauri Command Conventions

- Rust command naming: `cmd_<verb>_<noun>` (e.g. `cmd_scan_keys`, `cmd_hset`)
- All commands return `Result<T, String>` (errors serialize cleanly to JS)
- Rust structs use `#[serde(rename_all = "camelCase")]` to match TS conventions
- Frontend calls use `invoke()` from `@tauri-apps/api/core`

## Sensitive Data

Connection passwords/credentials must be encrypted via the AES-256-GCM helper (`src-tauri/src/crypto/`) before persisting to SQLite. Applies to: Redis passwords, SSH credentials/passphrases, S3 secrets, MongoDB URIs/passwords, MySQL passwords.

Redact hostnames, usernames, access keys, private-key paths, and passwords in fixtures/tests/docs.

## Release & Versioning

Version must stay synchronized across all three files: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.

Release notes are bilingual:
- English: `docs/releases/en/vX.Y.Z.md`
- Chinese: `docs/releases/cn/vX.Y.Z.md`

The GitHub release workflow uses the English file at `docs/releases/en/${{ github.ref_name }}.md`, so the file name must still match the pushed tag exactly.

Tag format: `git tag -a v0.5.0 -m "Release v0.5.0"`

## PLAN.md

Update `PLAN.md` during implementation, not only at the end. Group entries by date under `## 开发进度（实时）`. Do not mix progress from different dates under one heading.

## Key Gotchas

- Path alias: `@/` maps to `src/` (configured in vite.config.ts and tsconfig.json)
- Window has no native decorations — custom `Titlebar.tsx` handles minimize/maximize/close
- Vite port 1420 is fixed (`strictPort: true`); `src-tauri/` is excluded from Vite watch
- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` all on
- Expected non-blocking warnings: Vite chunk size >500 kB, Rust `RedisConnectionType` unused
- Tauri builds can exceed default command timeouts; use long timeouts before treating them as failed
- Commit style: Conventional Commits (`feat:`, `fix:`, `ci:`, `docs:`) — imperative, scoped to one change
