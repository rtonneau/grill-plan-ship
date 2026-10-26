---
name: gps
description: "grill-plan-ship: workflow plugin. Use for /gps init, /gps scout, /gps start, /gps status, /gps clean, /gps config, /gps write, /gps plan, /gps ship, /gps finish, /gps auto, /gps handoff, /gps release, /gps help, or the matching $gps command in Codex."
argument-hint: "<init|scout|start|status|clean|config|write|plan|ship|finish|auto|handoff|release|help> [args]"
allowed-tools:
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/auto-route.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/changelog-apply.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/changelog-prepare.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/clean.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/config.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/dispatch-preflight.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/dispatch-prompt.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/domain-doc.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/finish.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/handoff.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/help.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/init.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/jev-hints.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/plan.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/release.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/scout-merge.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/set-current.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/start.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/status.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/ticket-block.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/ticket-check.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/ticket-complete.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/ticket-queue.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/ticket-start.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/write-apply.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/write-prepare.js *)
---

# grill-plan-ship

Grill (spec the work) → Plan (atomic tickets) → Ship (one commit per ticket) → Finish (summary, and a PR on GitHub projects). Each session lives in `.work/sessions/YYYY-MM-DD__<slug>/`; the scripts own every file there.

## Commands

| Command | What it does | Instructions |
|---|---|---|
| `/gps init` | Check the project and commit gps's setup once (optional) | `references/init.md` |
| `/gps scout [--from <review-file>] [direction]` | Review the codebase's architecture (or read a review file with `--from`) and turn the findings into seeds for `/gps start` | `references/scout.md` |
| `/gps start [--issue] <name>` | New session, then the grill (`--issue`: a report, filed as a GitHub issue) | `references/start.md` |
| `/gps status` | Sessions, seeds, current phase and handoff, next command | `references/status.md` |
| `/gps clean [id...]` | Delete sessions or drop seeds, after confirmation | `references/clean.md` |
| `/gps config [--rescan]` | Show or re-detect the project's GitHub flag | `references/config.md` |
| `/gps write` | Save the approved grill or plan to disk | `references/write.md` |
| `/gps plan` | Save the grill if pending, start the plan, draft tickets | `references/plan.md` |
| `/gps ship [N]` | Save the plan if pending, implement every remaining ticket (or only ticket N) | `references/ship.md` |
| `/gps finish` | Close the session: leftovers committed, INDEX.md, PR | `references/finish.md` |
| `/gps auto [--delegate] [plan\|ship\|finish]` | Run from the current phase to the target without stopping | `references/auto.md` |
| `/gps handoff` | Save an in-flight checkpoint (HANDOFF.md) | `references/handoff.md` |
| `/gps release` | Merge the changelog fragments (and Unreleased bullets) into a version: suggest, bump, tag, push | `references/release.md` |
| `/gps help [command\|question]` | What to do next, what a command does, how the workflow fits together | `references/help.md` |

## How to run a command

Read the command's references file (in this skill's directory) before doing anything else, every time: the steps and script flags change between versions, so a remembered step can call something that no longer exists. In those files, `<name>.js` means the matching script under this skill's `scripts/` directory. In Claude Code, use `node ${CLAUDE_SKILL_DIR}/scripts/<name>.js`; in Codex, use the absolute script path resolved from the loaded gps skill directory, quoted for the host shell. Run scripts with the target repository root as the working directory. Remove `/gps` or `$gps` and the subcommand before interpreting arguments; follow the reference's script calls and flags. For example, `$gps config --rescan` runs `config.js --rescan`, while `$gps ship 3` runs the ship workflow for ticket 3, following its reference. Every deterministic step is a script: run it rather than doing its work by hand, because the script also validates its input and records the step in the session history.

This skill is shared by Claude Code and Codex. Use the host's available question interface for choices and confirmations. For ticket delegation, pass `--host claude` or `--host codex` to `dispatch-prompt.js` and follow `references/ship.md` one ticket at a time. Codex mappings and supported efforts are explicit project settings; never invent a mapping or silently drop a hint. Translate `/gps` shown in shared references or script output to `$gps` when speaking to a Codex user.

## Script contract

- **stdout** is text to relay to the user as is; with `--json` it is one JSON object instead.
- **`⚠️` lines** (stderr) are warnings: relay them; they never stop a command.
- **Exit 1** prints `❌ <what failed>` and a hint; **exit 2** is a usage error. Show both and stop the command. Don't retry with other arguments or work around it, unless the references file says how to recover: a failing script means a precondition isn't met, and a workaround leaves the session in a state the other scripts don't expect.
- **`Next:` lines** name the command to run next. Follow them unless the references file says otherwise (e.g. under `/gps auto`).

## Rules for every command

- Never create, edit or delete session state by hand (`.session-config.json`, `.current-session`, `.pending-seeds.json`, session directories). The scripts validate that state and record each change in its history; a hand edit skips both, and `status`, `auto` and `finish` then disagree with what is on disk. The agent writes only the narrative a script points at: the write payload, a commit log's narrative sections, HANDOFF.md, the glossary and ADRs.
- Scripts never overwrite work: re-running a command against existing output refuses (changing nothing) or resumes. So re-running is always safe; deleting output to force a fresh run is not.
- **Host question rule:** In Claude Code use `AskUserQuestion`, at most 4 questions per call and 2-4 options each, recommended answer first marked "(Recommended)". In Codex inspect the available question tool, its schema and mode restrictions; never assume Claude batching or tool availability. If no suitable tool is available, ask concise numbered conversational questions. Wait for answers to required decisions; asynchronous invocation, preselected options and elapsed time are not confirmation. Preserve already authorized auto-run choices and approval gates. Question tools do not replace sandbox escalation. Apply this rule inside external grill skills too.
- Switch the current session only after the user confirms it (`set-current.js <session-id> --confirmed`): every later command acts on the current session.
- On GitHub projects (flag in `.work/gps-config.json`), saving the plan creates the session branch and `/gps finish` opens its pull request; bounded work (no plan) gets neither.
