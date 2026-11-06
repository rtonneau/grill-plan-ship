# Session: configure-release-behavior-per-project

**Date:** 2026-11-06T09:48:37.572Z
**Status:** Grill phase complete

## Problem Statement

`/gps release` bumps only the version files it detects. On a Cargo workspace (`[workspace.package]` version, internal path dependencies pinned to that version, `Cargo.lock`) it wrote the changelog and tagged `v0.3.0` while the build still reported `0.1.0`. A project has no way to say what else a release must update.

## Context & Constraints

- **Current behavior:** `release.js` bumps `release.versionFiles`, or the files `detectVersionFiles` finds. `Cargo.toml` is read only under `[package]`. The first release saves the detected list into `release.versionFiles`, and a saved list is never re-detected. Nothing refreshes lockfiles or pins. A release requires a clean tree and runs the changelog write, version bumps and release commit as one transaction; a failed commit restores the fragments from HEAD.
- **Pain point:** the tag and the build disagree on the version; the fix was done by hand and left uncommitted, while the published tag points at the earlier commit.
- **Dependencies:** `release.js`, `lib/version-files.js`, `lib/project-config.js` (`releaseSettings`, `saveVersionFiles`, consent pattern of `jev.consent`), `references/release.md`, `docs/WORK-DIR.md`, `docs/COMPATIBILITY.md`. `release.versionFiles` and `release.githubRelease` keep working unchanged.
- **Tech stack:** Node.js built-ins only, CommonJS; Cargo and pyproject TOML edited by token replacement like today.

## Success Metrics

- A root `Cargo.toml` with `[workspace.package] version` is detected and bumped with no configuration; `[package]`, `pyproject.toml` (`[project]`, `[tool.poetry]`) behave as before.
- A list saved by detection is re-detected on every release (`release.versionFilesSource: detected|manual`, legacy configs count as detected); a manual list stays authoritative.
- Path dependencies (including `[workspace.dependencies]` entries with a path) whose `version` equals the previous workspace version are rewritten to the new version.
- `release.postBump` commands run after the bump and before the release commit; every tracked file they modify joins the release commit.
- The exact command list is approved once and the consent stored in `.work/gps-config.json`; a changed list asks again.
- A failing command restores the changelog, version files and fragments from HEAD, commits and tags nothing, and reports the command and its output.

## Architecture & Approach

- `lib/version-files.js` gains `[workspace.package]` for `Cargo.toml` and the path-dependency pin rewrite.
- `lib/project-config.js` gains `release.postBump`, `release.versionFilesSource` and the consent field, validated like the existing keys.
- `release.js` re-detects when the source is `detected`, runs the approved commands between the version writes and `commitFiles`, adds the tracked files they changed (the tree was clean at the start, so `git diff` is exact), and on failure restores through the existing HEAD-restore path.
- Consent follows the `jev.consent` pattern: the config stores the approved command list, the script refuses an unapproved or changed list, and `references/release.md` shows the commands and asks once.
- Docs: `references/release.md`, config docs, `docs/WORK-DIR.md`, `docs/COMPATIBILITY.md`, and a decision record.

## Assumptions & Trade-offs

- Not doing: the setting that lets a plain `/gps release` push and publish without the question (separate Idea); repairing already published tags (orket `v0.3.0`).
- Assumes releases run on a machine that has the build tools the commands need.
- Trade-off: arbitrary shell in committed config, limited by per-config consent.
- Trade-off: no declared file list, so any tracked file a command modifies is committed.

## Open Questions

None.

## Notes

Promoted from the Idea `configure-release-behavior-per-project`. Its two open questions are settled: pins are rewritten by a built-in, and changed files are every tracked file the commands modified. Two Idea decisions changed in the grill: a saved detected list is re-detected, and a failing command restores the tree instead of leaving it for inspection.
