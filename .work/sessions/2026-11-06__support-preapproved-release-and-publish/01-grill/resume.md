# Session: Support preapproved release and publish

**Date:** 2026-11-06T08:55:35.559Z
**Status:** Grill phase complete

## Problem Statement

`/gps release` always asks twice ("Release X.Y.Z?" and "Push and publish?"). A user who already knows they want the suggested version pushed and published has no way to preapprove it.

## Context & Constraints

- **Current behavior:** `release.js` suggests; `release.js --version X.Y.Z` cuts (CHANGELOG, version files, commit, tag); `release.js --push` pushes and creates the GitHub Release by policy. The agent asks a question between each step (references/release.md).
- **Pain point:** two mandatory questions even when the release is already decided.
- **Dependencies:** keep existing `--version` and `--push` behavior and their refusals (base branch, clean tree, up to date, valid fragments). Decision 0003 says a release is the user's call and never runs under `/gps auto`; that stays.
- **Tech stack:** Node.js built-ins, CommonJS, `lib/cli.js` contract, `lib/git.js`, `lib/github.js`.

## Success Metrics

- `release.js --publish` cuts the suggested version, pushes the commit and tag, and creates the GitHub Release (per `release.githubRelease` policy) in one call, with no questions.
- `release.js --publish --version X.Y.Z` does the same for the given version.
- Any refusal or failure stops before later steps and leaves a resumable state (re-running resumes: tag/push/release already done are skipped).
- `/gps auto` still never releases; tests cover `--publish`, the combined `--publish --version`, a refusal, and resume after a failed push.

## Architecture & Approach

Add a `--publish` flag to `release.js`. It computes the suggestion (reusing the suggest logic), runs the existing cut with the suggested or given version, then the existing `push()`. `--publish` is the user's preapproval: typing it is the go-ahead. `references/release.md` gains a short "preapproved" path: when the user typed `--publish`, run `release.js --publish [--version X.Y.Z]`, relay output, ask nothing. Update the `SKILL.md` command table, README, `help` text, and `docs/WORK-DIR.md` or a decision note if relevant (a short note in decision 0003 or a new decision recording that the flag, not config, carries preapproval).

## Assumptions & Trade-offs

- Preapproval is per-run via the flag; no persistent config key (keeps each release deliberate).
- Covers both the version and push+publish; not split into separate switches.
- Not available under `/gps auto`.
- Resume of an interrupted `--publish`: if HEAD is already the release commit with its tag, skip the cut and continue to push.

## Open Questions

None.

## Notes

The user wrote `--deletate` for auto; read as `--delegate`. Size: standard.
