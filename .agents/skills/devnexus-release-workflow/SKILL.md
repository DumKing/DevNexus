---
name: devnexus-release-workflow
description: Use when working on DevNexus releases, version iterations, plugin additions, README/release docs, PLAN.md progress, RepoWiki, or the DevNexus_Doc website from D:\rdmm.
---

# DevNexus Release Workflow

## Overview
DevNexus work has synchronized product, docs, release, website, and progress rules. Treat docs and plan updates as part of the feature, not cleanup after coding.

## When to Use
Use for work in `D:\rdmm` or `D:\dumking\DevNexus_Doc` involving:
- A new version, tag, release, or publish workflow.
- New plugins or changes to visible plugin inventory.
- README, release notes, RepoWiki, website, or PLAN.md changes.
- Any PLAN.md-driven iteration.

## Required Rules
- Version plans: add or update the phase plan in `PLAN.md` before implementation.
- Live progress: while developing, update `PLAN.md`; under `## 开发进度（实时）`, append entries by date and exact time, stating what changed and what verification ran.
- README split: keep Chinese docs in `README.md`; keep English docs in `README_EN.md`. Update both for user-visible capability changes.
- Release notes: write both `docs/releases/cn/vX.Y.Z.md` and `docs/releases/en/vX.Y.Z.md`. The GitHub Release body uses the English file.
- RepoWiki: when regenerating wiki docs, generate both `.qoder/repowiki/zh/...` and `.qoder/repowiki/en/...` content when possible.
- Plugin toolbox: when adding or renaming a plugin, update `D:\dumking\DevNexus_Doc\src\data\plugin-toolbox.json` with Chinese and English summaries.
- Website generation: DevNexus_Doc reads Chinese README/release docs from `README.md` and `docs/releases/cn`, English from `README_EN.md` and `docs/releases/en`.
- Release discipline: merge feature work to `main` before tagging; tags and releases should be based on `main`.

## Verification
After meaningful DevNexus app changes, run:
- `npm test`
- `npm run build`
- `cd src-tauri && cargo check`

After website/doc generation changes, also run from `D:\dumking\DevNexus_Doc`:
- `npm run build -- D:\rdmm`
- `git diff --check` scoped to touched files when generated RepoWiki files contain unrelated whitespace noise.

## Common Mistakes
- Updating only one language of README or release notes.
- Adding a plugin without updating `plugin-toolbox.json`.
- Writing progress under the wrong date or without a concrete time.
- Leaving release workflows pointed at old `docs/releases/vX.Y.Z.md` paths.
- Treating RepoWiki Chinese output as enough when English output is expected too.
