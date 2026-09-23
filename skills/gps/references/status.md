# /gps status

**When:** Reorienting after returning to a project, losing context, switching machines, after `/gps scout`, or any time you need a "where did I leave off?" answer. Takes no arguments. Read-only — it never writes or modifies any session file.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/status.js`, which:
   - Lists every session under `.work/sessions/` with its feature name, creation date, `finishedAt`, and `phase` (computed from the session's files: `grill`, `plan-not-started`, `plan`, `ship`, `finish-pending`, `plan-complete` or `finished`; old `status` / `phases_completed` config fields are ignored).
   - Lists every scouted idea not started yet as `ideas` (from `.work/sessions/.pending-seeds.json`; `/gps start <slug>` removes an idea once it becomes a session), strongest first: `slug`, `strength`, `severity`, `problem`, `sourceReport`, `sourcePath`, `createdAt`, `startCommand`. If that file is unreadable, `ideas` is empty and `ideasProblem` says why — status never moves or repairs it.
   - Resolves the current session from `.work/sessions/.current-session` (same logic as every other command — there is no fallback to "the most recent session"). If the pointer is missing, invalid, points at a deleted session or at a finished one, `current` is `null` and `currentProblem` explains why and lists the unfinished sessions: show that to the user, ask which session to use, and only after they confirm run `node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>`.
   - Otherwise, for the current session only, adds:
     - `phase` and `suggestedNext` (`{ command, why }`) — the next command to run and why.
     - `writeTarget` — whether `/gps write` has something pending (`grill`, `plan`, or `none`), same detection `/gps write` itself uses.
     - `tickets` / `nextPending` — the ticket queue, same detection `/gps ship` itself uses; `skippedTicketFiles` lists files in `02-plan/tickets/` that aren't named `NN-<slug>.md` and are ignored.
     - `gitLog` — up to 10 project-wide commits (oneline) made since the session was created, so recent implementation activity is visible even without opening `commit-log.md` files.
     - `hasHandoff` — whether a saved checkpoint exists for this session (`HANDOFF.md` present). When true, Claude Code's rendered report should mention `/gps resume` is available for full context.
2. Claude Code renders that JSON as a short human-readable report:
   - One line per session: feature name and phase.
   - If `ideas` is non-empty: a table of the scouted ideas not started yet (slug, `severity · strength` or just the strength, one-line problem), each with its `/gps start <slug>` line to copy. Show `ideasProblem` if set.
   - For the current session: which phase is pending and why, ticket progress (`X/Y done`, next pending ticket if any), and the recent commits.
   - Ends with `suggestedNext.command` and its `why`, verbatim — do not work out the next command yourself. With no sessions but pending ideas, `suggestedNext` sits at the top level of the report and names the first-ranked idea; you may add one sentence on why another idea could come first (e.g. a dependency the review names), but still print `suggestedNext` as given.
   - It exits with `No sessions found.` only when there are neither sessions nor ideas.

**Output:** A status report printed in chat. No files are created or changed.

**Example:**

```
/gps status
```
