# Implementation Plan

**Session:** agent definitions for gps
**Date:** 2026-11-27T12:14:17.787Z
**Estimated effort:** 1 day

## Strategy

First bind the two existing roles to Claude plugin agent definitions and route `dispatch-prompt.js` to them, recording the decision that supersedes 0016's "no agent definitions" line. Then add the three new roles one at a time (branch reviewer, plan checker, scout explorer), each with its brief, agent file, dispatch support, reference wiring and tests. Finish with the architecture docs and live compatibility evidence.

## Tickets Overview

- **Ticket 1:** Agent definitions for implementer and reviewer; Claude dispatch uses them with a general-purpose fallback; decision 0019.
- **Ticket 2:** Branch reviewer role, run by `/gps finish --review` and `/gps auto [finish] --review`.
- **Ticket 3:** Plan checker role, run by `/gps plan` for High-risk work or plans of 4+ tickets.
- **Ticket 4:** Scout explorer role for `/gps scout`, usable without a session.
- **Ticket 5:** README, ARCHITECTURE and live COMPATIBILITY evidence for plugin agents and the fallback.

## Sequencing Rationale

Ticket 1 introduces the role-to-agent mapping, the agent-file test and the decision every later ticket relies on. Tickets 2 to 4 each add one independent role on top of it; branch review comes first because it changes delivery. Docs and live evidence come last, so they describe the final shape.

## Risks & Mitigation

- **Risk:** the scoped `subagent_type` form (`grill-plan-ship:gps-<role>`) is inferred from docs, not stated → **Mitigation:** lifecycle notes tell the parent to fall back to `general-purpose` with the same brief when the type is unknown; ticket 5 verifies the form live.
- **Risk:** Claude auto-selects a gps agent for unrelated work → **Mitigation:** each description says it is only for gps-dispatched briefs.
- **Risk:** branch review changes delivery and could block a chained finish → **Mitigation:** opt-in only; plain and chained finishes never run it; a test covers auto's passthrough.
- **Risk:** references exceed 40 lines or SKILL.md grows → **Mitigation:** keep additions to one or two lines per reference; run the size check.

## Assumptions

- Claude Code auto-discovers `agents/` at the plugin root and honors `disallowedTools` for plugin agents (docs: plugins/components, sub-agents).
- Codex ignores `agents/`; its root `plugin.json` needs no change.
- No new script: `dispatch-prompt.js` gains the new roles; `auto-route.js` gains `--review`.
