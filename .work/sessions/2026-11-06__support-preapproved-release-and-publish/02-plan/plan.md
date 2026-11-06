# Implementation Plan

**Session:** Support preapproved release and publish
**Date:** 2026-11-06T09:00:57.460Z
**Estimated effort:** 2 hours

## Strategy

One ticket: add `--publish` to `release.js` (suggest, cut, push, GitHub Release in one call), then update the reference and user docs. The behavior and its docs ship together so they never disagree.

## Tickets Overview

- **Ticket 1:** `release.js --publish [--version X.Y.Z]` with tests, `references/release.md`, SKILL.md/README/help text and a changelog-relevant docs note.

## Sequencing Rationale

A single reviewable change; the docs describe exactly what the code does.

## Risks & Mitigation

- **Risk:** publishing without a human check pushes a wrong version → **Mitigation:** `--publish` is only taken when the user typed it; all existing refusals (branch, clean tree, behind origin, invalid fragment) still stop before any write.
- **Risk:** interrupted run leaves a release commit unpushed → **Mitigation:** re-running `--publish` detects HEAD as the release commit with its tag and goes straight to the push.

## Assumptions

- `--publish` and `--push` cannot be combined; `--publish --version X.Y.Z` is allowed.
- `/gps auto` never passes `--publish`.
