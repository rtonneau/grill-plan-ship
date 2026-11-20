# Implementation Plan

**Session:** stacked session finish merged into its open base branch deletes the base session pointer
**Date:** 2026-11-20T07:52:05.219Z
**Estimated effort:** 2 hours

## Strategy

One change in pointer resolution: in the `no-pointer` case, look for the single unfinished session whose `git.branch` is the checked-out branch, write the pointer to it and warn. Every caller (`resolveSession`, `status.js`, `help.js`) goes through `resolveCurrentPointer`, so they all benefit. A regression test reproduces the stacked merge through the real scripts.

## Tickets Overview

- **Ticket 1:** Restore a missing pointer from the busy branch, with the stacked-merge regression test and the decision recorded.

## Sequencing Rationale

A single reviewable change: the behavior and its test belong together.

## Risks & Mitigation

- **Risk:** A restore picks the wrong session → **Mitigation:** restore only on exactly one match, only for `no-pointer`; every other problem is unchanged and tested.
- **Risk:** `status`/`help` now write a file → **Mitigation:** the write is the pointer only, with a `⚠️` line, and only in the case that was already an error state.

## Assumptions

- `currentBranch` in `lib/git.js` returns null on a detached HEAD or outside git, which gives no match.
