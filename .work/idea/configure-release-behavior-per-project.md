---
status: grilled
scope: project
created: 2026-11-06
reviews: 0
promoted_to: null
---

## Problem

`/gps release` bumps only the version files it detects. On a Cargo workspace (`[workspace.package]` version, internal dependencies pinned to that version, `Cargo.lock`) it updated the changelog and tagged `v0.3.0` while the build still reported `0.1.0`. Detection reads only `[package]`, and nothing refreshes lockfiles or pins. A project has no way to say what else a release must update.

## Decisions

- Detect automatically a root `Cargo.toml` with `[workspace.package] version`. `pyproject.toml` stays detected (`[project]`, `[tool.poetry]`). An explicit `release.versionFiles` wins over detection.
- Add a per-project `release.postBump` list of commands (e.g. `cargo update -w`). They run after the version files are written and before the release commit, and their changes join that commit.
- The user approves the exact commands once per config; consent is stored in `.work/gps-config.json` like `jev.consent`. A changed command list asks again.
- A failing command aborts the release before any commit or tag and leaves the working tree as it is for inspection.
- The setting that lets a plain `/gps release` push and publish without the question is a separate Idea.

## Open questions

- Pinned internal dependency versions (path dependencies carrying `version = "x.y.z"`): a built-in rewrite, or left to `postBump`?
- How the release commit picks up the files a command changed: a declared `release.postBumpFiles` list, or everything modified by the commands.

## Risks

- Arbitrary shell in committed config; consent per config limits it but a shared config can still change under a user.
- A build tool the hook needs may be missing on the machine that releases.
- An already published tag pointing at the wrong commit (orket `v0.3.0`) is not repaired by this.

## Changelog

- 2026-11-06 — capture — Configure release behavior per project (grill-plan-ship @ feat/release-publish-flag)
- 2026-11-06 — grill
