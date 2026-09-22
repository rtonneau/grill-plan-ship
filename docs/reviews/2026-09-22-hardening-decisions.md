# Hardening decisions (2026-09-22)

Maintainer answers to the clarifying questions for M1–M3 of
[the MVP hardening review](2026-09-22-mvp-hardening-review.md). These are
binding for autonomous work; where a decision was delegated, the choice
made is recorded here.

## Re-runs and finish (T-02, T-03, T-04, T-06)

- No `--force` flag anywhere.
- `/gps start` on an existing session: exit with an error, change nothing.
- `/gps plan` when a plan is already written: exit with an error, change nothing.
- `/gps ticket N` when the log exists: keep the log, re-print the spec. If the ticket is Done, say so and change nothing.
- `/gps finish` with unfinished tickets: always refuse.
- `/gps finish` on an already-finished session: error.
- Bounded sessions (resume only, no plan) may finish with no tickets.
- After finishing: clear `.current-session`, list unfinished sessions; SKILL.md tells Claude to ask the user whether to switch to one.
- Switching is done by an internal `scripts/set-current.js <session-id>` (no public `/gps` command), run by Claude only after the user confirms. It is also the recovery path for an invalid pointer.
- Rejected commands leave no log; exit code + stderr message only.

## Names and paths (T-02, T-08)

- Slug rule: `^[a-z0-9]+([._-][a-z0-9]+)*$` (`.`/`_`/`-` only between alphanumerics — blocks `.`, `..`, leading dots).
- Names are auto-cleaned (NFKD, accents stripped to plain letters, lowercased, invalid runs → `-`), with a notice when changed.
- Empty after cleanup → `untitled-<local HHMMSS>`.
- Max slug length 64, truncated at a separator.
- Session date uses the local date.
- Ticket files not matching `NN-<slug>.md`: skipped with a warning.
- Duplicate ticket numbers: all kept, run in alphabetical filename order.

## Session state (T-09, T-11)

- Files are the source of truth for phase. Config holds only non-derivable facts: `session_id`, `feature_name`, `created_at`, `scratch_dir`, `usage`, `finished_at`. `status`/`phases_completed` are no longer read; existing ones are left in place.
- `status.js` outputs computed `phase` and `suggestedNext`.
- Invalid/stale `.current-session`: fail with a recovery hint. No silent fallback.
- No `/gps use` command.
- Legacy sessions: backfill missing fields, with a warning.
- Placeholder syntax may be changed (F-019).

## Git (T-10)

- Recent commits: project-wide, since session `created_at`, max 10.
- Handoff git status: project-wide and session-scoped, shown separately.
- No extra path exclusions (`.work/` and `.scratch/` are gitignored).
- Outside a git repo: empty lists, as today.
- `.work/` is expected to be gitignored; `/gps start` adds it to `.gitignore` like `.scratch/`.
- All git calls use `execFileSync` (no shell).

## Handoff/resume (M4, spec work only in M1–M3)

- Redesign before M4: `HANDOFF.md` + `HANDOFF.json`; back up `HANDOFF.md` on overwrite, max 10 copies.
- Update `docs/superpowers/specs|plans` handoff documents to reflect these decisions.

## Token usage (T-12)

- Fix `mangleCwd` to replace every non-alphanumeric with `-`; no cross-folder search.
- "Unavailable" is an acceptable known limitation.
- Sub-agent usage should be counted; verify the transcript layout on disk first, and document the gap if it can't be verified.

## Scout and seeds (T-05)

- Corrupt `.pending-seeds.json`: rename to `.pending-seeds.json.corrupt-<ts>`, start fresh, warn.
- Required candidate fields: `slug`, `strength`, `problem`, `solution`. Optional: `files`, `benefits`.
- `strength` ∈ `Strong` | `Worth exploring` | `Speculative`.
- Duplicate slugs in one run: keep first, warn.
- Report filename collision: add a numeric suffix.
- Scout skill: use `improve-codebase-architecture` if available, else `mattpocock-skills:codebase-design`, else stop and tell the user what to install.
- `unslop` (not answered; judgment call per rule below): use if available, otherwise skip with a notice.

## Release (T-19)

- Next version `1.1.0`; `package.json`, `plugin.json`, `marketplace.json` kept in sync.
- Add `CHANGELOG.md` (Keep a Changelog).
- Remove `peerDependencies`.

## Tests and CI (T-13 – T-15)

- `npm test` = `node --test scripts/` (built-in; existing assert files run unchanged).
- `engines.node >= 20`; CI on Node 20 and 22.
- CI on `windows-latest` only; runs on push and pull_request.
- E2E tests may create temp git repos.

## Process

- Continue M1 → M2 → M3 while tests pass. T-07 is part of M1.
- Base branch: `worktree-handoff-resume`.
- One PR per milestone, one commit per ticket. Agent may push and open PRs. PRs are stacked (M2 on M1, M3 on M2) and left unmerged for maintainer review.
- No off-limits files. Template wording may change if clearer. Docs may be updated per ticket.
- Unanswered ambiguity: make a judgment call and flag it in the PR description.
- A ticket that can't pass its tests: stop the whole run.
- Work from the review's ticket table directly (not via `/gps`).
- Each PR ends with a findings table (F-001…F-023: fixed / deferred / out of scope) and before/after output of the review's manual reproductions.
