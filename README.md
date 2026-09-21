# grill-plan-ship

A structured workflow plugin for any code project.

**Workflow:** brainstorm (grill) → plan → implement (ship)

**Commands:**
- `/gps start <feature>` — Begin a feature
- `/gps write` — Save the current phase's output (brainstorm resume, or plan + tickets) to disk
- `/gps plan` — Create tickets
- `/gps ticket <N>` — Implement one ticket by hand
- `/gps ship` — Implement every remaining ticket in order, one commit each
- `/gps finish` — Archive session

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

## Example Session

See `examples/` for real-world sessions:
- `geant4-chemistry-refactor/` — Scientific project
- `react-form-validation/` — Frontend project
- `python-etl-pipeline/` — Data project

## License

MIT
