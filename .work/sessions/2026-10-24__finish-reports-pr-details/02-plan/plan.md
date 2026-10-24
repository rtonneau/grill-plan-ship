# Implementation Plan

**Session:** finish reports PR details
**Date:** 2026-10-24T07:20:29.684Z
**Estimated effort:** 1 hour

## Strategy

One ticket: extend `openPullRequest` to return the PR's details, then format them once for the finish output and INDEX.md.

## Tickets Overview

- **Ticket 1:** finish reports the PR's number, title, branch → base and URL, in its output, INDEX.md and --json.

## Sequencing Rationale

A single change; the helper and its two consumers must land together.

## Risks & Mitigation

- **Risk:** `gh pr view` fails or the stub doesn't answer it → **Mitigation:** fall back to the number from the URL; tests cover the failing view.

## Assumptions

- PR URLs end in `/pull/<number>`.
