# grill-plan-ship

A structured workflow plugin for any code project.

**Workflow:** brainstorm (grill) → plan → implement (ship)

**Commands:**
- `/gps scout [--from <review>]` — Turn an architecture scan, or a review you already have, into ready-to-run `/gps start` seeds
- `/gps start <feature>` — Begin a feature
- `/gps issue <title>` — Report a problem as a GitHub issue (local session without GitHub) and work on it
- `/gps handoff` — Save an in-flight checkpoint before stopping
- `/gps resume` — Catch up on a session using its checkpoint plus live state
- `/gps write` — Save the current phase's output (brainstorm resume, or plan + tickets) to disk
- `/gps plan` — Create tickets
- `/gps ticket <N>` — Implement one ticket by hand
- `/gps ship` — Implement every remaining ticket in order, one commit each
- `/gps finish` — Archive session (open the pull request of a planned session, or comment on / close the issue of a bounded `/gps issue` session)

## Workflow Visualization

<img src="docs/gps-workflow.svg" alt="Diagram of GPS workflow phases: GRILL, PLAN, SHIP/IMPLEMENT, and FINISH with command, activity, and output columns." />

GPS phases and outputs at a glance, including `/gps write` checkpoints after GRILL and PLAN.

## Installation

```
/plugin marketplace add rtonneau/grill-plan-ship
/plugin install grill-plan-ship
```

Restart Claude Code. To update later:

```
/plugin marketplace update rtonneau/grill-plan-ship
```

## Quick Start

```
# In any project:
/gps start add-dark-mode
# ...grill conversation happens automatically (grill-with-docs if installed, else brainstorming)...
/gps write   # once approved, saves the resume to 01-grill/resume.md

# Plan tickets
/gps plan
# ...writing-plans + unslop happen automatically...
/gps write   # once approved, saves plan.md + tickets to disk

# Implement every ticket, one commit each
/gps ship

# Finish
/gps finish
```

### Start from an existing review

Already have a code review or audit? Turn its findings into seeded sessions instead of retyping them:

```
/gps scout --from docs/reviews/2026-09-22-dotfiles-review.md
# -> one candidate per group of related findings, e.g. "safe-bootstrap-linking  Critical · Strong"
/gps start safe-bootstrap-linking   # the grill opens with those findings already loaded
```

Add a direction to narrow it: `/gps scout --from review.md only Critical and High`, or `… one candidate per finding`.

## Session Structure

```
.work/sessions/YYYYMMDD__<feature>/
├── 01-grill/           ← Brainstorm output
├── 02-plan/            ← Plan + tickets
├── 03-implement/       ← Implementation logs
├── .session-config.json
└── INDEX.md

.scratch/tests/YYYYMMDD__<feature>/   ← Build/run/test artifacts for the whole session
```

`/gps start` creates the scratch directory, records it as `scratch_dir` in `.session-config.json`, and adds `.scratch/` to the project's `.gitignore` if missing. `/gps ticket` prints its path so agents keep build logs and run output there (prefixed with the ticket number, e.g. `03-build.log`). To enforce a stricter policy (capture stdout, never write to the source tree), add it to your project's CLAUDE.md.

## Session history

Every `.session-config.json` records the life of its session, so a timeline can be built from that file alone:

- `history` — append-only events `{ at, event, phase, files, detail }`: `session_started`, `grill_written`, `plan_started`, `plan_written`, `ticket_started`, `ticket_done`, `handoff_saved`, `session_finished`, plus on GitHub projects `branch_created`, `issue_created`, `pr_opened`, `issue_commented`, `issue_closed`. `files` point at the session's `.md` files, relative to its directory.
- `current_phase` — the phase after the last event. `/gps status` still derives the phase from the files and reports `phaseDrift` when the two disagree (typically a ticket set to `✅ Done` without `ticket-done.js <N>`).
- `ticket-done.js <N>` records the exact time a ticket was completed; `/gps ship` and `/gps ticket` run it after the Status line is set.
- `/gps finish` renders the history as a `## Timeline` table in `INDEX.md`, with links to the files.

Sessions created before this feature are backfilled from their stored timestamps (`created_at`, phase start times, `finished_at`) and shown as "(reconstructed)".

## Project config

Whichever of `/gps start`, `/gps issue` or `/gps write` (plan phase) runs first in a project writes `.work/gps-config.json`:

```json
{ "version": 1, "github": { "enabled": true, "detected_at": "2026-09-25T09:00:00.000Z" } }
```

`github.enabled` is true when `origin` is on github.com **and** `gh auth status` succeeds. It is detected once and only read afterwards. Edit the file by hand to force GitHub features on or off (GitHub Enterprise, a `gh auth login` done later, opting out). It lives under `.work/`, so it is per checkout.

## Branches and Pull Requests

When `github.enabled` is true, **planned** sessions get their own branch and end with a pull request:

- **`/gps write` (plan phase)** asks for a `**Branch:**` name shaped like `<feat|fix|refactor|docs|chore|perf|test>/<short-slug>` (e.g. `feat/dark-mode-toggle`), which Claude picks from the approved plan. The branch is created from whatever is checked out (uncommitted changes come along), and that branch becomes the PR's base.
- **Bounded sessions** (grill only, no plan) create no branch and open no PR: the work lands on the branch you already have checked out.
- **`/gps finish`** must run on the session branch. It pushes it (`git push -u origin <branch>`) and runs `gh pr create` against the base branch, with the resume's problem statement, the tickets and the commits as the PR body. The PR link goes into `INDEX.md` (`## Branch & PR`), `.session-config.json` (`git.pr_url`) and `/gps status`.
- If the push or `gh` fails (not installed, not logged in), the session still finishes and `INDEX.md` lists the commands to run by hand.

Projects with `github.enabled` false work exactly as before: no branch, no PR.

## Issues

`/gps issue <title>` starts a session like `/gps start`, framed as a report (problem, reproduction, expected result). On a GitHub project, `/gps write` on the grill phase files the GitHub issue from the resume and records it in `.session-config.json` (`issue`) and `/gps status`.

- **Bounded work:** no branch, no PR. Reference the issue in your commits. `/gps finish` comments a summary on the issue; Claude asks whether to close it too and passes `--close-issue` on yes.
- **Planned work:** `/gps plan` as usual. The plan write creates the branch and `/gps finish` opens a PR that says `Closes #N`, so merging it closes the issue.
- With `github.enabled` false it is a local session: same grill, no issue.

## Features

✅ Language-agnostic (works with any tech stack)
✅ Composable (uses superpowers + unslop)
✅ Documented (every session has INDEX.md)
✅ Versionable (.session-config.json tracks state)
✅ Token usage tracked per phase (grill, plan, each ticket)

## Token Usage

Every phase output (`01-grill/resume.md`, `02-plan/plan.md`, each ticket's `03-implement/NN-*/commit-log.md`) ends with a `## Token Usage` section reporting that phase's real input/output/cache token totals, parsed from Claude Code's own session transcripts. If the transcript can't be found or parsed, the section reads `unavailable` instead of blocking the write.

Totals include sub-agent transcripts and count each API response once. This relies on Claude Code's undocumented transcript layout (`~/.claude/projects/<cwd with non-alphanumerics as ->/<session-id>.jsonl` and `<session-id>/subagents/*.jsonl`), so `unavailable` is a known possible outcome if that layout changes.

## Example Session

See `examples/` for real-world sessions:
- `geant4-chemistry-refactor/` — Scientific project
- `react-form-validation/` — Frontend project
- `python-etl-pipeline/` — Data project

## License

MIT
