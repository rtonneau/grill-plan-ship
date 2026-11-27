# Session: agent definitions for gps

**Date:** 2026-11-27T09:33:33.976Z
**Status:** Grill phase complete

## Problem Statement

gps delegates work to children only through prompt briefs sent to a generic `general-purpose` agent, and only for two roles (ticket implementer and reviewer). Role restrictions such as "reviewers never edit" or "do not delegate further" are instructions, not enforced. Other jobs that would benefit from a fresh, read-only child (checking a drafted plan, reviewing the whole branch, exploring architecture areas during scout) have no role at all.

## Context & Constraints

- **Current behavior:** `dispatch-prompt.js <N> --role implementer|reviewer --host claude|codex` renders `assets/role-context.md` plus `role-implementer.md` or `role-reviewer.md` and builds a host spawn call: Claude `Agent` with `subagent_type: general-purpose`, Codex `spawn_agent` with `fork_turns: none`. Decision 0014 removed the old per-effort agent files; decision 0016 rejected host agent definitions to avoid drift.
- **Pain point:** restrictions are behavioral only; no plan checker, branch reviewer or scout explorer role exists.
- **Dependencies:** keep 0014 (parent owns Git writes and session state, sequential tickets, per-call model/effort resolved live, no model tables, xhigh cap from 0001) and 0016's identical role text on both hosts and bounded recovery. Supersede only 0016's "no agent definitions" line, in a new decision record. Claude plugin agents are documented; Codex plugins cannot bundle agents per docs/COMPATIBILITY.md and its recorded `spawn_agent` schema has no agent-type field.
- **Tech stack:** Node.js built-ins (CommonJS scripts with `lib/cli.js`), markdown assets, Claude Code plugin `agents/` directory, Codex `spawn_agent`.

## Success Metrics

- Five Claude plugin agent definitions exist (`gps-implementer`, `gps-reviewer`, `gps-branch-reviewer`, `gps-scout`, `gps-plan-checker`); each body only points at the gps brief in its prompt, carries no model/effort, and read-only roles disallow Edit, Write, NotebookEdit and Agent; the implementer disallows Agent.
- `dispatch-prompt.js` emits the matching namespaced agent type on Claude (with a `general-purpose` fallback described in its notes) and the same brief on Codex, for all five roles; a test fails when an agent file and the known roles diverge.
- `/gps plan` runs the plan checker for High-risk work or plans of 4+ tickets before showing or saving them; `/gps finish --review` and `/gps auto [finish] --review` run the branch reviewer with one fix pass and stop before the PR on unresolved findings; a plain or chained finish never runs it; `/gps scout` may fan out read-only explorers per area.
- A new decision record, README/ARCHITECTURE updates and live COMPATIBILITY evidence (plugin agent with tool limits, and fallback) are in place; `npm test`, the size check and `claude plugin validate .` pass.

## Architecture & Approach

Thin Claude wrappers over the shared briefs. `agents/<role>.md` holds frontmatter (name, a description stating it is only for gps-dispatched briefs, `disallowedTools`) and a one-line body: follow the gps brief in your prompt. The brief still comes from `dispatch-prompt.js` on both hosts, so text cannot drift. New role templates go in `assets/role-*.md`; `dispatch-prompt.js` gains the non-ticket roles (plan checker, branch reviewer, scout explorer) with the inputs each needs. `lib/host-dispatch.js` maps a role to its Claude agent type; Codex is unchanged except for the new briefs. If the plugin agent type is unavailable, the parent uses `general-purpose` with the same brief and notes that limits are behavioral only. Plan checker: read-only critique of drafted tickets against the resume; the parent revises. Branch reviewer: opt-in via `--review` on finish (passed through by auto); actionable findings get one parent fix pass and a fresh re-review; unresolved findings stop before the PR. Scout explorer: one read-only child per architecture area at the parent's discretion; the parent alone writes seeds.

## Assumptions & Trade-offs

Bash stays available to read-only roles for git; a write through Bash is forbidden only by the brief, and the docs say so. Codex keeps behavioral restrictions only. Not doing: Codex custom-agent installation, parallel implementers, model or effort in agent frontmatter, model tables. Branch review is opt-in so a chained finish still asks nothing (0011).

## Open Questions

None for the user. To verify while implementing: the exact frontmatter keys Claude Code accepts for plugin agents (`disallowedTools` vs `tools`) and the namespaced `subagent_type` form, checked against current docs and a live run.

## Notes

Glossary gained **Role** and **Agent definition**. Plan checker triggers on High-risk or 4+ tickets (decision 0013's proportional process).
