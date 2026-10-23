# Implementation Plan

**Session:** scratch-cleanup
**Date:** 2026-10-23T16:16:35.096Z
**Estimated effort:** 1 day

## Strategy

First the shared lib (the build-tree rule and cleanup), then the config it reads, then its two callers (finish, clean), then the agent brief, then the docs. Each ticket is tested on its own and leaves `npm test` green.

## Tickets Overview

- **Ticket 1:** Build-tree rule, dir size and `cleanScratch` in `lib/scratch-dir.js`.
- **Ticket 2:** `scratch.cleanupOnFinish` / `scratch.extraDirs` validated in `project-config.js` and shown by `/gps config`.
- **Ticket 3:** `/gps finish` applies the policy, reports what it removed and the space freed, and warns on failure.
- **Ticket 4:** `/gps clean` deletes a session's scratch dir and orphan scratch dirs, with sizes in the dry run.
- **Ticket 5:** Ticket brief tells agents to copy cited logs into `<scratch>/evidence/`.
- **Ticket 6:** Decision record 0008, README, references and the CLAUDE.md decisions list.

## Sequencing Rationale

Tickets 3 and 4 call the lib from ticket 1. Ticket 3 also reads the settings from ticket 2. Ticket 5 does not depend on the others. The docs come last so they describe the behavior as built.

## Risks & Mitigation

- **Risk:** The default policy deletes evidence that a commit log cites from inside a build tree. → **Mitigation:** The brief line (ticket 5), the decision record, and the finish output naming what was removed.
- **Risk:** A file locked on Windows makes removal fail. → **Mitigation:** Failures are collected and warned; the finish never fails because of them.
- **Risk:** The name rule hits a dir that holds evidence. → **Mitigation:** The patterns are deliberately narrow (`bin`/`out` excluded, `build-*` and `build_*` rather than `build*`), and tests cover the near misses.

## Assumptions

- Scratch dirs live only at `.scratch/tests/<session-id>/` (from `ensureScratchDir`).
- `.scratch/` is git-ignored, so cleanup never touches tracked files.
