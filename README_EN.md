# DevNexus

[Website](https://dumking.github.io/DevNexus_Doc/) | [GitHub Releases](https://github.com/DumKing/DevNexus/releases/latest) | [中文](README.md)

DevNexus is a plugin-based desktop toolbox built with **Tauri 2 + React 19 + TypeScript + Rust**. It is designed for everyday development, operations, and data-management workflows, bringing common connection-oriented and diagnostic tools into one lightweight desktop application.

Current version: `0.10.0`

### Features

| Plugin | Status | Capabilities |
|--------|--------|--------------|
| Redis Manager | Implemented | Connection management, DB switching, key tree browsing, key editing, console, server info, import/export |
| SSH Client | Implemented | SSH profiles, multi-tab terminal, key management, quick commands, port forwarding |
| S3 Browser | Implemented | S3 profiles, bucket browsing, manual bucket lists, object browsing, upload/download, preview, presigned URLs, bucket settings |
| MongoDB Client | Implemented | Profiles, database/collection browsing, document CRUD, find/aggregate/command workspace, indexes, import/export, server status |
| MySQL Client | Implemented | Profiles, database/table browsing, table-data CRUD, SQL workspace, indexes, import/export, server status |
| Network Tools | Implemented | Ping, TCP port checks, DNS lookup, Traceroute, diagnostic history and rerun |
| API Debugger | Implemented | HTTP request builder/sender, collections/environments, response inspection, history rerun, cURL import, redacted export |
| MQ Client | Implemented | RabbitMQ/Kafka profiles, resource browsing, publish/produce, safe consume preview, templates, history rerun, and redaction |
| Confluence Publisher | Implemented | Confluence Server/Data Center profiles, Monaco Markdown editor, live Storage Format preview, Space/Page selector, one-click publish/update, LaTeX/Mermaid/local-image attachment upload, file-to-page mapping |
| LAN Chat | Iterating | Bottom-left chat launcher, floating chat window, LAN room/direct chat, online presence, group member list, inline image/audio previews, file-send progress, local history and transfer records |

### Highlights

- **Plugin-first design**: each tool keeps its UI, state, backend commands, and connection pool isolated.
- **Local-first storage**: connection profiles are stored in local SQLite; sensitive fields are encrypted with AES-GCM.
- **Lightweight desktop shell**: Tauri provides a small native shell while Rust handles protocol and system-facing work.
- **Cross-platform packaging**: GitHub Actions build Windows, macOS, and Linux packages.
- **Operational safety**: pagination, virtualized browsing, dangerous-command confirmations, and scroll-safe dashboards are built into the UX.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Tauri 2 |
| Frontend | React 19, TypeScript, Vite |
| UI | Ant Design, `@ant-design/icons` |
| State | Zustand |
| Charts | ECharts |
| Terminal | xterm.js / `@xterm/*` |
| Backend | Rust, Tokio |
| Local DB | SQLite via `rusqlite` |
| Redis | `redis` crate |
| SSH | `russh` / `russh-keys` |
| S3 | AWS Rust SDK |
| MongoDB | official `mongodb` Rust driver |
| MySQL | `mysql_async` |
| MQ | `lapin` / `rdkafka` / RabbitMQ Management HTTP API |
| Confluence | `unified` / `remark-parse` / `remark-gfm` + `@monaco-editor/react` + `reqwest` (Rust) |
| HTTP/API | `reqwest` |

### Repository Layout

```text
src/
  app/                         app shell, layout, plugin registry
  plugins/                     frontend plugins
    redis-manager/
    ssh-client/
    s3-client/
    mongodb-client/
    mysql-client/
    network-tools/
    api-debugger/
    mq-client/
    confluence/
    lan-chat/
  styles/                      global styles

src-tauri/
  src/
    db/                        SQLite schema and connection repositories
    plugins/                   Rust backend plugin commands and pools
      redis/
      ssh/
      s3/
      mongodb/
      mysql/
      network/
      api_debugger/
      mq/
      confluence/
      lan_chat/
    crypto/                    local encryption helpers
  icons/                       application icons
  tauri.conf.json              Tauri configuration

docs/releases/                 release notes (cn / en)
.github/workflows/             CI/CD workflows
tests/                         Vitest tests
PLAN.md                        roadmap and live progress log
AGENTS.md                      contributor and agent guidelines
```

### Prerequisites

- Node.js 20+
- Rust stable
- Tauri prerequisites for the target platform

References:

- https://www.rust-lang.org/tools/install
- https://tauri.app/start/prerequisites/

### Development

```bash
# Install dependencies
npm install

# Start the Vite frontend only
npm run dev

# Start the full Tauri desktop app
npm run tauri dev
```

### Verification

```bash
# Run Vitest
npm test

# Type-check and build the frontend
npm run build

# Check the Rust backend
cd src-tauri
cargo check
```

Note: the current build may report a Vite large-chunk warning and an existing unused `RedisConnectionType` Rust warning. They do not block release as long as the commands exit with code 0.

### Packaging

```bash
# Build for the current platform
npm run tauri build

# Windows NSIS installer
npm run tauri build -- --bundles nsis

# macOS .app + .dmg
npm run tauri build -- --bundles app,dmg

# Linux .deb + .AppImage
npm run tauri build -- --bundles deb,appimage
```

Windows artifact example:

```text
src-tauri/target/release/bundle/nsis/DevNexus_0.10.0_x64-setup.exe
```

### Release Process

The repository includes two GitHub Actions workflows:

- `.github/workflows/build-desktop.yml`: runs on `push main` or manual dispatch and uploads platform artifacts.
- `.github/workflows/release.yml`: runs on `v*` tags, builds Windows/macOS/Linux packages, and creates a GitHub Release.

Typical release flow:

```bash
# Update package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json
# Add docs/releases/en/vX.Y.Z.md and docs/releases/cn/vX.Y.Z.md
npm test
npm run build
cd src-tauri && cargo check

# Commit, push main, then tag
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

### Security

- Do not commit real passwords, SSH keys, tokens, object-storage credentials, or local database files.
- Do not commit `node_modules/`, `dist/`, `src-tauri/target/`, or generated installers.
- Treat Redis, SSH, S3, MongoDB, MySQL, MQ, and Confluence connection profiles, plus API Debugger environment variables, tokens, cookies, and Authorization headers, as sensitive data.
- Redact hostnames, usernames, key paths, and credentials in screenshots, fixtures, and issues.

### Known Limits

- Redis Sentinel/Cluster, S3 lifecycle editing, and in-app auto-update are still roadmap items tracked in `PLAN.md`. If an S3-compatible account cannot call `ListBuckets`, configure `Manual Buckets` in the connection advanced settings with comma- or newline-separated bucket names.
- MySQL currently targets common MySQL 5.7/8.0 workflows. MariaDB may work when protocol-compatible, but it is not the primary validation target.
- Network Tools currently support one-shot diagnostics and history reruns, not bulk port scanning or continuous monitoring. API Debugger supports HTTP debugging, collections, environments, history, cURL import, and redacted export, but does not yet promise full Postman Collection or script ecosystem compatibility. MQ Client supports RabbitMQ and Kafka daily debugging; RabbitMQ browsing requires the Management Plugin, Kafka initially supports PLAINTEXT and SASL/PLAIN, TLS fields are reserved, and destructive queue/topic/offset operations are intentionally out of scope.
- Confluence Publisher targets Confluence Server / Data Center 7.x+ via REST API v1 with Basic Auth and SSO-friendly Personal Access Token (Bearer) auth; Confluence Cloud OAuth is not in scope yet. LaTeX output relies on `mathinline` / `mathblock` macros; Mermaid is rendered to SVG, wrapped into `.drawio` attachments, and embedded through the Confluence draw.io macro, so it no longer depends on the Confluence `html` macro or raster PNG output. Unsupported code macro languages such as `http` omit the language parameter to avoid publish failures. Local image attachments only follow filesystem paths; remote `http(s)://` and `data:` URLs are left untouched.
- LAN Chat now keeps one built-in public room plus direct chats. It includes UDP discovery, TCP message delivery, online/offline presence, per-conversation unread badges, inline image/audio/video previews, and sender-hosted LAN file URLs. Chat messages carry only file metadata and download tokens; generic files are pulled from the sender service after the receiver chooses a save path.
- Large tables, buckets, or collections should be browsed with pagination, prefixes, or query filters rather than loading everything at once.

### Roadmap

The canonical roadmap is `PLAN.md`. Redis, SSH, S3, MongoDB, MySQL, Network, API Debugger, MQ Client, LAN Chat, and Confluence Publisher main tracks are implemented; future iterations will continue improving import/export, update checks, database depth, diagnostics, and user experience.
