# Session: start-resumes-open-session

**Date:** 2026-10-26T09:10:29.337Z
**Status:** Grill phase complete

## Problem Statement

`/gps start <name>` on a session that was started but never finished stops with "Session … already exists; nothing was changed" and hints "Run /gps status to see where it left off". The user wants gps to jump straight to that session, report where it stands and ask whether to continue, with no detour through `/gps status`. Other scripts send the user to `/gps status` when they already know the next command; those detours go too.

## Context & Constraints

- **Current behavior:** `lib/session-init.js` throws a `GpsError` when `.work/sessions/<date>__<slug>/` exists, hinting at `/gps status`. Because the session id holds the date, on another day the same name silently creates a duplicate session next to the open one. `set-current.js` ends with `Next: /gps status to see where it left off.`; `write-apply.js` (complete) and `write-prepare.js` (nothing to write) also point at `/gps status`.
- **Pain point:** an extra round trip (error, then status, then set-current, then status again) to resume work that gps could identify itself; and duplicate sessions across days.
- **Dependencies:** router rule: the current session is switched only after the user confirms (`set-current.js`). Scripts never overwrite work. `lib/status.js` / `lib/phase.js` (`computeSessionState`, `suggestNext`) and `lib/staleness.js` (`computeIdleness`) already compute phase, tickets, idleness and next command.
- **Tech stack:** Node.js built-ins only; `lib/cli.js` script contract; `node --test` tests in `tests/`.

## Success Metrics

- `/gps start <name>` with an unfinished session of the same slug (same day or an earlier day; newest if several) exits 0, changes nothing on disk, and prints a short summary: session id, phase, tickets x/y when any, idle time / last activity, and a `Next:` line. `--json` includes `resumable: true` and the session id.
- A same-day id collision with a finished session refuses with a hint to pick another name (no `/gps status`); a finished session with the same slug on another day does not block creating a new session.
- `--issue` against an existing feature session (or the reverse) resumes it with a `⚠️` warning that the existing kind is kept.
- `references/start.md`: when the match is not the current session, ask "Continue session X?"; yes → `set-current.js <id>` then continue from its phase; no → stop and suggest another name. When it is already current, no question: continue directly. In the grill phase, rerun the grill opening with the feature name, HANDOFF.md if any, and the glossary/ADRs, saying the earlier conversation was not saved.
- `set-current.js` prints the session's phase and its real next command instead of `Next: /gps status`; `write-apply.js` (complete) and `write-prepare.js` (nothing to write) name the real next command (`/gps ship` / `/gps finish`).
- Tests cover: same-day resume, cross-day resume, finished same-day collision, finished different-day, kind mismatch warning, and the new set-current / write messages.

## Architecture & Approach

Move the existence check out of the throw path: `start.js` (with a helper in `lib/`, e.g. in `session-store.js` or a new `lib/session-resume.js`) scans `listSessionDirs` for sessions whose slug part equals the cleaned slug, drops finished ones (`isFinished`), and picks the newest. If found, it returns a resume report built from `computeSessionState` + `computeIdleness` without touching any file or history. Otherwise `initSession` runs as now; its own collision error (now only reachable for a finished same-day session) gets the "pick another name" hint. `set-current.js` and the write scripts reuse `computeSessionState`'s `suggestedNext` for their `Next:` line. `references/start.md` gains the confirm/continue branch.

## Assumptions & Trade-offs

- Short summary rather than the full status "Current" block (commits and handoff stay in `/gps status`).
- The script never switches the current session for a resume; the agent does after confirmation, except when it is already current.
- A grill conversation that was never saved cannot be recovered; the grill restarts with what is on disk.
- No resumption of finished sessions.

## Open Questions

None.

## Notes

Reported from a Codex run: `$gps start crate-domain-ownership` stopped because session `2026-10-26__crate-domain-ownership` already existed.
