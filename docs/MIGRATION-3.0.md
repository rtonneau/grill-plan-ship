# Migrating to GPS 3.0

Nothing needs doing to keep working. Existing sessions, configs, backlogs and session files stay valid, and unfinished sessions resume where they stopped.

## Commands

| Before | Now |
|---|---|
| `/gps ship` asks inline, subagent, or subagent + inline | Chooses per ticket and says which. Override with `--inline` or `--delegate` |
| `/gps ship` asks to accept model and effort hints | Hints apply as written |
| `/gps ship N` always inline | Same choice as a full ship |
| `/gps auto --delegate` meant subagent + inline | Means `delegate`. `--inline` is new |
| `/gps start` always grills | Sizes the work first: small changes skip the grill. Say so if you disagree with the size |
| `/gps plan` asks you to approve tickets | Only for high-risk work. Otherwise it shows them, and `/gps ship` is the go-ahead |

**Delegated behavior.** The old `subagent` mode let the child commit. Now the parent reviews and commits every ticket.

**Failures.** A failed ticket no longer stops at the first attempt. The agent fixes what it can, tries one fresh child at most, then blocks and reports.

## Configuration

| Key in `.work/gps-config.json` | Status |
|---|---|
| `delegation.codex.models.<tier>` | Still read. Now also accepts a plain string. Without it, the parent picks from its spawn tool instead of a built-in table |
| `delegation.codex.models.<tier>.efforts` | Still read. An effort it rules out is dropped with a note instead of failing |
| `delegation.codex.inheritEfforts` | No longer read. `/gps config` tells you it can go |

All other keys are unchanged, and `ship.autoFinish` behaves as before.

## Persistent state

| State | Migration |
|---|---|
| `ship_mode: subagent` or `subagent+inline` in `.session-config.json` | Read as `delegate`, without rewriting the file. The next `ticket-start.js --mode` stores the new name |
| Ticket `**Model:**` and `**Effort:**` lines | Unchanged |
| Session layout, history, seeds, changelog fragments, Ideas | Unchanged |

**Session records on Windows.** If a CRLF global gitignore affected you, older sessions may hold uncommitted `.work/` files, and `/gps start` may have warned that `.work/` was ignored. The next `chore(gps)` commit picks up what's under `.work/sessions`, including those older files. Check `git status` first if you want them committed separately.

## Removed

- `agents/gps-ticket-*.md`: tickets use a general-purpose child with `effort` on the call. **Requires Claude Code 2.1.292 or later for delegated effort.**
- `dispatch-preflight.js`, `ticket-check.js`, and the `--mode` and `--parent-effort` flags of `dispatch-prompt.js`.
- `/gps init`'s note about helper skills. External skills are no longer called automatically; name one in your request if you want it for the grill or plan. `/gps scout` still uses `improve-codebase-architecture` or `codebase-design` when present and now works without them.
- `docs/superpowers/`, `docs/REVIEW-*`, `docs/AUDIT-*` and `docs/CODEX-SMOKE-TEST.md`. They remain in git history; [COMPATIBILITY.md](COMPATIBILITY.md) holds current results.

## Unchanged by choice

A full `/gps ship` still chains a finish that pushes and opens the PR (decision 0011). Set `ship.autoFinish` to `false` if you want to review before anything leaves your machine.
