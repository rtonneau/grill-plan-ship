# Reading gps state from another tool

Outside tools such as [gps-dashboard](https://github.com/rtonneau/gps-dashboard) read gps state through two read-only commands, run with the project root as the working directory:

```
node <skill>/scripts/status.js --json     # sessions, seeds, the current session, other worktrees
node <skill>/scripts/help.js --json       # where the session stands and the command manifest
```

`<skill>` is the `skills/gps` directory of the gps copy the agents run. That is usually a host plugin cache (`~/.claude/plugins/cache/grill-plan-ship/grill-plan-ship/<version>/skills/gps`, the same under `~/.codex/`), not a checkout. Both commands change nothing, on disk or in git. Each one prints a single JSON object on stdout. `⚠️` warnings go to stderr, and a failure exits 1 with `❌ …` on stderr (the script contract in `AGENTS.md`). Use this page instead of reading files under `.work/`: those are gps's private state (see [WORK-DIR.md](WORK-DIR.md)). This page and `tests/status-json-doc.test.js` are checked against each other.

## Versions

- `schemaVersion` (integer) heads both objects. It is **2** since this page was written. If it is missing, the output came from gps 3.1.x or older: schema **1**, where tickets have `done` (a boolean) instead of `state` and `blocker`, there is no `recentEvents`, and `status.js` exits 1 when there are no sessions.
- Renaming or removing a field, or changing what it means, bumps `schemaVersion`. Adding a field does not, so readers must ignore fields they don't know.
- `gpsVersion` is the `version` of the running copy's `plugin.json`, or `null` when it can't be read. Use it for display and bug reports. Branch on `schemaVersion`, never on `gpsVersion`.

Decision 0018 records why.

## `status.js --json`

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | integer | see *Versions* |
| `gpsVersion` | string or null | see *Versions* |
| `sessions` | array | every session folder, as *Session* below |
| `seeds` | array | `/gps scout` findings not started yet, strongest first, as *Seed* below |
| `seedsProblem` | string or null | why the seeds file could not be read |
| `finishRecovery` | object or null | a `/gps finish` that stopped before delivery: `{ sessionId, branch, path }` |
| `current` | object or null | the current session, as *Current* below; null when there is none |
| `currentProblem` | object | present only when `current` is null: `{ code, message, hint }` |
| `suggestedNext` | object | `{ command, why }`: the command to run next; absent when there is nothing to suggest |
| `worktrees` | array | unfinished sessions current in the repository's other git worktrees, as *Worktree* below |

`currentProblem.code` is one of:

- `no-work-dir`: no `.work/sessions` folder. The report is empty and the exit code is 0 (text mode exits 1).
- `no-sessions`: no session yet. Seeds may exist.
- `no-pointer`: sessions exist but none is selected.
- `invalid-pointer`: `.current-session` holds something that is not a session id.
- `missing-session`: the selected session is gone, often because it lives on a branch that isn't checked out.
- `finished-session`: the selected session is finished.

### Session

`sessionId`, `featureName`, `createdAt`, `finishedAt` (null while open), `phase`, `currentPhase` (the phase gps last recorded), `phaseDrift` (`{ recorded, derived }` when the two differ, else null), `branch`, `prUrl`, `issueUrl`, `configReadable` (false when `.session-config.json` is unreadable), `lastActivityAt`, `idleDays`, `staleness` (null, `stale` after 14 idle days, `very-stale` after 28).

`phase` is derived from the session's files, never from what was recorded. It is one of `grill`, `plan-not-started`, `plan`, `ship`, `finish-pending`, `plan-complete`, `finished`.

### Seed

`slug`, `strength`, `severity`, `problem`, `sourceReport`, `sourcePath`, `createdAt`, `startCommand` (the `/gps start <slug>` to run).

### Current

| Field | Meaning |
|---|---|
| `sessionId`, `phase`, `suggestedNext` | as above |
| `writeTarget` | `{ target, … }`: `grill` or `plan` when that phase still has to be written (`/gps write`), else `none` with a `reason` |
| `tickets` | the tickets in execution order, as *Ticket* below |
| `nextPending` | the first ticket not done, as *Ticket*, or null |
| `skippedTicketFiles` | ticket file names gps ignores (not `NN-<slug>.md`) |
| `gitLog` | one-line commits since the session started, newest first |
| `handoff` | the saved `HANDOFF.md`: `{ meta, sections, drift }` (`drift` is a sentence or null), or null |
| `recentEvents` | the last 10 recorded events, oldest first, as *Event* below |

### Ticket

`num` (string, `"01"`), `slug`, `ticketPath`, `implDir`, `commitLogPath`, `model` (`fast|medium|heavy|inherit`), `modelInvalid`, `effort` (`low|medium|high|xhigh|inherit`), `effortInvalid` (the unknown value of a hand-edited hint line, else null), plus:

- `state`: `pending`, `started`, `blocked` or `done`. `done` means the commit log reads `**Status:** ✅ Done`. `blocked` means the ticket's last `ticket_blocked` event has no later `ticket_resumed`, `ticket_done` or `session_finished`. `started` means it has a commit log or a `ticket_started` event. Otherwise it is `pending`.
- `blocker`: `{ reason, at }` while `state` is `blocked`, else null.

### Event

`{ at, event, phase, detail }`. `at` is an ISO time. `phase` is the phase after the event. `detail` is an object or null: ticket events carry `detail.ticket` (`"NN-<slug>"`), `ticket_blocked` adds `reason`, and `ticket_done` adds `commit`. Event names:

`session_started`, `grill_written`, `plan_started`, `plan_written`, `branch_created`, `branch_renamed`, `ticket_started`, `ticket_blocked`, `ticket_resumed`, `ticket_done`, `handoff_saved`, `auto_started`, `changelog_written`, `scratch_cleaned`, `pr_opened`, `issue_created`, `issue_commented`, `issue_closed`, `session_finished`.

Readers must accept names that aren't on this list.

### Worktree

`path` (absolute), `branch` (null on a detached HEAD), `sessionId`, `phase` (the phase recorded in that worktree, or null). To get that session's full status, run `status.js --json` with `path` as the working directory. gps commands for it must run there too.

## `help.js --json`

| Field | Meaning |
|---|---|
| `schemaVersion`, `gpsVersion` | see *Versions* |
| `sessionId`, `phase` | the current session and its phase, or null |
| `suggestedNext` | `{ command, why }` |
| `commands` | every command, as *Command* below |
| `command` | only with a command name argument: that command |

### Command

`name`, `usage` (as SKILL.md writes it), `summary`, `when`, `examples`, plus the manifest from `skills/gps/scripts/lib/commands.js`:

- `sendable`: true when the command can be queued on an agent thread that lacks the conversation which built the session. The sendable commands are `status`, `help`, `handoff`, `ship`, `auto` and `finish`. The rest need that conversation or the user's decisions: `start`, `plan`, `write`, `scout`, `release`, `clean`, `config` and `init`.
- `args`: the argument grammar. Each argument is `{ name, kind, optional }`, with:
  - `kind` `flag`: `values` lists the switches; at most one is given (`["--inline", "--delegate"]`).
  - `kind` `enum`: `values` lists the words it may be.
  - `kind` `ticket`: a ticket number from 1 to 99.
  - `kind` `text` or `path`: free text or a file path.
  - `flag`: set when the value follows a switch (`--from <path>`). Otherwise the argument is positional.
  - `repeat`: true when the argument may be given several times.

A message that runs a command on an agent thread is `/gps <name> [args]` in Claude Code and `$gps <name> [args]` in Codex. The plugin-qualified forms are `/grill-plan-ship:gps` and `$grill-plan-ship:gps`.
