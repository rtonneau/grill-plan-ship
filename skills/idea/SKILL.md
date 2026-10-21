---
name: idea
description: "Backlog of future-work Ideas, kept apart from gps sessions. Use to capture an Idea in seconds, grill or plan it later, review it, promote it into a gps session, drop it, list the Backlog, or configure the Global root: /idea capture, /idea start, /idea plan, /idea review, /idea promote, /idea drop, /idea list, /idea config."
argument-hint: "<capture|start|plan|review|promote|drop|list|config> [args]"
allowed-tools:
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/idea-config.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/idea-find.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/idea-list.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/idea-promote-check.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/idea-resolve.js *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/idea-save.js *)
---

# idea

An **Idea** is future work written down so it isn't lost, but not started. Each Idea is one file, `<slug>.md`, in a **Backlog**: Project scope is `<repo>/.work/idea/`, Global scope is the `.work/idea/global/` of your configured personal repo (`/idea config`). An Idea moves `captured` → `grilled` → `planned` → `promoted` or `dropped`; every save adds a dated Changelog entry and commits only that file.

## Commands

| Command | What it does | Instructions |
|---|---|---|
| `/idea capture <name> [note] [--global]` | Capture an Idea in seconds, no grill (status `captured`) | `references/capture.md` |
| `/idea start <name\|slug> [--global]` | Grill a new or captured Idea (status `grilled`) | `references/start.md` |
| `/idea plan [slug]` | Add a 3–8 milestone plan to a grilled Idea (status `planned`) | `references/plan.md` |
| `/idea review <slug>` | Revisit a grilled or planned Idea: re-grill what is open or stale | `references/review.md` |
| `/idea promote <slug>` | Promote an Idea into a gps session, grill saved on the default branch | `references/promote.md` |
| `/idea drop <slug>` | Mark an Idea `dropped` with a reason; the file stays | `references/drop.md` |
| `/idea list [--all]` | Show the Project and Global Backlogs (`--all` adds promoted and dropped) | `references/list.md` |
| `/idea config [--set-global-root <path>]` | Show or set which personal repo holds Global Ideas | `references/config.md` |

## How to run a command

Read the command's references file (in this skill's directory) before doing anything else, every time: it holds the steps and the exact script calls, in order. In those files, `<name>.js` means the matching script under this skill's `scripts/` directory. In Claude Code, use `node ${CLAUDE_SKILL_DIR}/scripts/<name>.js`, with that exact path, unquoted, so it matches the pre-approved command; in Codex, use the absolute script path resolved from the loaded idea skill directory, quoted for the host shell.

This skill is shared by Claude Code and Codex. Translate `/idea` shown in shared references or script output to `$idea` when speaking to a Codex user.

The slug comes from the name: lowercase it, turn every run of characters outside `a-z0-9` into one `-`, trim `-` from both ends. Every script taking a slug refuses an empty slug and `global`.

## Script contract

- **stdout** is text to relay; with `--json` it is one JSON object. Add `--json` wherever the next step reads a field.
- **`⚠️` lines** (stderr) are warnings: relay them and carry on.
- **Exit 1** prints `❌ <what failed>`; **exit 2** is a usage error. Show it and stop the command, unless the references file says how to recover. A refusal changes nothing on disk.

## Idea body

`idea-save.js --body-file <file>` replaces the body with the file's content. Write the file outside every repo (the OS temp directory, e.g. `<tmp>/idea-<slug>-body.md`) with these sections, in this order, and nothing else:

1. `## Problem`
2. `## Decisions`
3. `## Open questions`
4. `## Plan`: 3–8 ordered milestones, no tickets (added by `plan`; absent before)
5. `## Risks`
6. `## Terms`: Global Ideas only

When rewriting an existing Idea, start from its current body and keep what still holds.

## Rules for every command

- **Host question rule:** In Claude Code use `AskUserQuestion`, one question per call, recommended answer first marked "(Recommended)"; keep free text for open-ended answers. In Codex inspect the available question tool, its schema and mode restrictions; never assume Claude Code tool availability. If no suitable tool is available, ask concise numbered conversational questions. Inside a grill skill (`grilling`, `domain-modeling`, `brainstorming`) this overrides the skill's own "ask in chat".
- Take every fact about scope, path, status and branch from `idea-resolve.js` or `idea-find.js`, run in this conversation, never from memory or a directory listing.
- `idea-save.js` alone writes the frontmatter (`status`, `scope`, `created`, `reviews`, `promoted_to`) and the Changelog: never hand-edit them. You write only the body file.
- `idea-save.js` commits the one Idea file it wrote; leave pushing to the user and never push.
- Scope is Project unless the user passes `--global` or picks Global in a save check; never infer it from what the Idea is about.
