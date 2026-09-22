# grill-plan-ship

A structured workflow plugin for any code project.

**Workflow:** brainstorm (grill) → plan → implement (ship)

**Commands:**
- `/gps scout [--from <review>]` — Turn an architecture scan, or a review you already have, into ready-to-run `/gps start` seeds
- `/gps start <feature>` — Begin a feature
- `/gps handoff` — Save an in-flight checkpoint before stopping
- `/gps resume` — Catch up on a session using its checkpoint plus live state
- `/gps write` — Save the current phase's output (brainstorm resume, or plan + tickets) to disk
- `/gps plan` — Create tickets
- `/gps ticket <N>` — Implement one ticket by hand
- `/gps ship` — Implement every remaining ticket in order, one commit each
- `/gps finish` — Archive session

## Workflow Visualization

<img src="docs/gps-workflow.svg" alt="Diagram of GPS workflow phases: GRILL, PLAN, SHIP/IMPLEMENT, and FINISH with command, activity, and output columns." />

GPS phases and outputs at a glance, including `/gps write` checkpoints after GRILL and PLAN.

## Installation

```
/plugin marketplace add rtonneau/grill-plan-ship
/plugin install grill-plan-ship
```

Restart Claude Code.

## Quick Start

```
# In any project:
/gps start add-dark-mode
# ...brainstorming conversation happens automatically...
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
/gps start safe-bootstrap-linking   # brainstorming opens with those findings already loaded
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
