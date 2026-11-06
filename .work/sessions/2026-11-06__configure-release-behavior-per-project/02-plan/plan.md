# Implementation Plan

**Session:** configure-release-behavior-per-project
**Date:** 2026-11-06T09:52:51.026Z
**Estimated effort:** 1 day

## Strategy

Fix what a release bumps first (workspace version, pins), then which files it bumps (re-detection), then add the post-bump commands with their consent and restore path. Each ticket leaves `npm test` passing.

## Tickets Overview

- **Ticket 1:** Cargo `[workspace.package]` is detected and bumped, and matching path-dependency pins are rewritten.
- **Ticket 2:** A version-file list saved by detection is re-detected each release; a manual list stays authoritative.
- **Ticket 3:** `release.postBump` commands run under per-list consent, their changes join the release commit, and a failure restores the tree; docs and decision record.

## Sequencing Rationale

Ticket 1 gives re-detection in ticket 2 something new to find. Ticket 3 changes the release transaction, so it builds on the settled bump and file list.

## Risks & Mitigation

- **Risk:** a pin rewrite touches an unrelated dependency → **Mitigation:** rewrite only path dependencies whose `version` equals the previous workspace version, with negative tests.
- **Risk:** a failed command leaves the tree dirty and blocks the rerun → **Mitigation:** restore tracked changes from HEAD before refusing, with a regression test.
- **Risk:** shell in committed config → **Mitigation:** exact-list consent; a changed list refuses until approved again.

## Assumptions

- Node.js built-ins only; TOML is edited by token replacement, as today.
- Commands run from the project root on a machine that has the tools they need.
- Out of scope: the push/publish setting, repairing published tags.
