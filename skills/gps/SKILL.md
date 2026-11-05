---
name: gps
description: "grill-plan-ship: run a change through a resumable design, plan, implement, deliver workflow with session state on disk. Use when the user names gps or $gps, or asks to start or resume this workflow (init, scout, start, status, clean, config, write, plan, ship, finish, auto, handoff, release, help). Leave ordinary coding requests that don't ask for it to the host."
argument-hint: "<init|scout|start|status|clean|config|write|plan|ship|finish|auto|handoff|release|help> [args]"
allowed-tools:
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/auto-route.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/changelog-apply.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/changelog-prepare.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/clean.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/config.js *)
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
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/ticket-complete.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/ticket-queue.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/ticket-start.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/write-apply.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/write-prepare.js *)
---

# grill-plan-ship

Turn a request into verified, delivered code, with as much process as the work deserves. Each session lives in `.work/sessions/YYYY-MM-DD__<slug>/`; the scripts own every file there, so any host can resume it.

## Commands

| Command | What it does | Instructions |
|---|---|---|
| `/gps init` | Check the project and commit gps's setup once (optional) | `references/init.md` |
| `/gps scout [--from <review-file>] [direction]` | Review the codebase's architecture (or read a review file with `--from`) and turn the findings into seeds for `/gps start` | `references/scout.md` |
| `/gps start [--issue] <name>` | New session sized to the work: small changes go straight to implementation, others to the grill (`--issue`: a report, filed as a GitHub issue) | `references/start.md` |
| `/gps status` | Sessions, seeds, current phase and handoff, next command | `references/status.md` |
| `/gps clean [id...]` | Delete sessions or drop seeds, after confirmation | `references/clean.md` |
| `/gps config [--rescan]` | Show or re-detect the project's GitHub flag | `references/config.md` |
| `/gps write` | Save the approved grill or plan to disk | `references/write.md` |
| `/gps plan` | Save the grill if pending, start the plan, draft tickets | `references/plan.md` |
| `/gps ship [N] [--inline\|--delegate]` | Save the plan if pending, implement every remaining ticket (or only ticket N), inline or delegated | `references/ship.md` |
| `/gps finish` | Close the session: check leftovers, INDEX.md, PR | `references/finish.md` |
| `/gps auto [--delegate\|--inline] [plan\|ship\|finish]` | Run from the current phase to the target without stopping | `references/auto.md` |
| `/gps handoff` | Save an in-flight checkpoint (HANDOFF.md) | `references/handoff.md` |
| `/gps release` | Merge the changelog fragments (and Unreleased bullets) into a version: suggest, bump, tag, push | `references/release.md` |
| `/gps help [command\|question]` | What to do next, what a command does, how the workflow fits together | `references/help.md` |

## How to run a command

Read the command's references file before acting, on every run: script flags change between versions. There, `<name>.js` means the script under this skill's `scripts/` directory: in Claude Code `node ${CLAUDE_SKILL_DIR}/scripts/<name>.js`, in Codex the absolute path from the loaded skill directory, quoted for the host shell. Run from the target repository root. Remove `/gps` or `$gps` and the subcommand before reading arguments: `$gps config --rescan` runs `config.js --rescan`, `$gps ship 3` is the ship workflow for ticket 3. Translate `/gps` shown in shared references or script output to `$gps` for a Codex user.

## Script contract

- **stdout** is text to relay as is; with `--json` it is one JSON object.
- **`⚠️` lines** (stderr) are warnings: relay them and carry on.
- **Exit 1** prints `❌ <what failed>` and a recovery hint; **exit 2** is a usage error. Check for partial commits or saved checkpoints before retrying; follow the hint. Report it when the same cause fails twice or needs the user.
- **`Next:` lines** name the usual next command.

## Autonomy

- **Yours:** facts the code can answer, implementation choices, debugging, retries, and recovery. Decide them, and state any choice the user may want to know in one line.
- **The user's:** product decisions, ambiguous scope, and irreversible or outward actions not already requested. A typed command is the go-ahead for what its reference describes.
- **Host question rule:** ask with the host's question tool (Claude Code: `AskUserQuestion`, at most 4 questions, recommended answer first; Codex: inspect the tool and its mode, else concise numbered questions) and wait for the answer. Every question for the user goes through it, grill questions included, with concrete options instead of an open prompt (free text via "Other"). Write questions in chat only when the host has no question tool or the current mode disables it. Questions never stand in for a sandbox approval.
- **Permissions:** work inside the host's sandbox and approvals. Report a denial with the exact action, and request approval through the host.

## State

- The agent writes only the narrative a script points at: the write payload, a commit log's narrative sections, HANDOFF.md, the glossary and ADRs. Scripts own the rest (`.session-config.json`, `.current-session`, `.pending-seeds.json`, session directories) and record each change.
- Scripts refuse or resume rather than overwrite work; deleting output to force a fresh run loses it.
- Every later command acts on the current session: switch it only after the user confirms (`set-current.js <session-id> --confirmed`).
- On GitHub projects (`.work/gps-config.json`), saving a plan creates the session branch and `/gps finish` opens its pull request; small work (no plan) gets neither.
