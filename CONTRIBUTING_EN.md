# Contributing to DevNexus

[中文](./CONTRIBUTING.md) | English

Thanks for helping improve DevNexus. This project is a Tauri 2 desktop toolbox with a React + TypeScript frontend and a Rust backend.

## Development Setup

1. Install Node.js 20 and Rust stable.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the frontend dev server:

   ```bash
   npm run dev
   ```

4. Run the full Tauri app:

   ```bash
   npm run tauri dev
   ```

## Pull Requests

Before opening a pull request, run the lightweight verification checks:

```bash
npm test
npm run build
cd src-tauri && cargo check
```

For packaging or release changes, also run the relevant Tauri bundle command for the target platform when possible.

## Security and Secrets

Do not commit secrets, local databases, private keys, generated installers, `node_modules/`, `dist/`, or `src-tauri/target/`.

When adding tests, logs, screenshots, or issue details, redact hostnames, usernames, access keys, private-key paths, passwords, and tokens.

Sensitive connection fields must use the existing encryption helpers before they are persisted.

## Project Conventions

- Keep frontend plugin code under `src/plugins/<plugin-id>/`.
- Keep backend plugin code under `src-tauri/src/plugins/<plugin-id>/`.
- Follow existing plugin patterns before adding new abstractions.
- Keep `PLAN.md` and release notes current when behavior, packaging, or release flow changes.
