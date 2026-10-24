# Session: finish reports PR details

**Date:** 2026-10-24T07:17:46.072Z
**Status:** Grill phase complete

## Problem Statement

At the end of `/gps finish`, the user only sees the pull request URL. Finish should report the PR's number, title, branch and base too.

## Context & Constraints

- **Current behavior:** `finish.js` prints `🔀 Pull request[ (already open, updated by the push)]: <url>`; INDEX.md's "Branch & PR" section has `- **Pull request:** <url>`. `openPullRequest` (`lib/github.js`) returns `{ ok, url, existing }`; for an existing PR it knows only the URL.
- **Pain point:** the URL alone doesn't say which PR it is or what it's called.
- **Dependencies:** gh calls stay in `lib/github.js` via `execFileSync`; the GitHub flow tests use a stub `gh` (`GPS_GH_BIN`). The failure path (commands to run by hand) is unchanged.
- **Tech stack:** Node.js built-ins; `node --test`.

## Success Metrics

- A new PR prints `🔀 Pull request #N (new): <title> (<branch> → <base>)` then the URL on the next line; number parsed from the URL, title/branch/base from what finish passed.
- An already-open PR prints the same with `(already open, updated by the push)`, with details from one `gh pr view <url> --json number,title,headRefName,baseRefName,url` call; if that call fails, it shows `#N` from the URL and the URL, no error and no warning-stop.
- INDEX.md's Pull request line carries the same details, and `--json` data includes them under `pr`.
- Stub-gh tests cover new, existing, and failed-view cases; `npm test` passes.

## Architecture & Approach

`lib/github.js`: a `pullRequestDetails(projectRoot, url)` helper (gh pr view, null on failure) and a URL-number parser; `openPullRequest` returns `{ ok, url, existing, number, title, head, base }`, filling them from what it passed (new) or from the view (existing, with fallback). `finish.js` formats the console line and INDEX.md line from those fields via one shared formatter.

## Assumptions & Trade-offs

- New PRs need no extra gh call; existing ones need one, which may fail (fallback).
- Not reporting PR state, reviews or CI checks.

## Open Questions

None.

## Notes

Follows session 2026-10-24__at-end-og-ship-phase-on-last-ticket-completion-gps-finish-should (PR #48), where the user saw only the URL.
