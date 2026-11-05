# Session: Encourage AskUserQuestion for questions

**Date:** 2026-11-05T20:28:14.266Z
**Status:** Grill phase complete

## Problem Statement

The agent sometimes asks grill questions as plain chat text instead of the host's question tool (`AskUserQuestion` in Claude Code, its equivalent in Codex). The host question rule exists in the router but the grill wording does not make it binding.

## Context & Constraints

- **Current behavior:** `skills/gps/SKILL.md` has a host question rule; `references/start.md` grill says "(host question rule)" only in passing.
- **Pain point:** grill questions drift into free-form chat, with no options and no recommended answer to click.
- **Dependencies:** `tests/skill.test.js`, the SKILL.md size check (< 200 lines), the Codex tool name is unverified (docs/COMPATIBILITY.md says question tools are not tested live), so it is not named.
- **Tech stack:** markdown skill files.

## Success Metrics

- gps router rule states every question, grill included, goes through the question tool with concrete options; chat only when the tool is missing or disabled by mode.
- The grill's "Ask the frontier" bullet asks for one tool call per round, 2-4 options, recommended first, no bare chat question.
- The idea skill's rule says the same; size check and `npm test` pass.

## Architecture & Approach

Wording changes only: `skills/gps/SKILL.md` (host question rule), `skills/gps/references/start.md` (grill frontier bullet), `skills/idea/SKILL.md` (host question rule).

## Assumptions & Trade-offs

- No new script or test; behavior is agent judgment.
- Codex equivalent stays described as "inspect the tool and its mode" rather than naming an unverified tool.

## Open Questions

None.

## Notes

Sized small by the agent: three wording edits, no product decision.
