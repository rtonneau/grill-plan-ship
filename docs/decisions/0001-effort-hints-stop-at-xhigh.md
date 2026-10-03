# 0001: Effort hints stop at xhigh

_Recorded 2026-10-03, version 2.4.0._

## Context

Version 2.4.0 adds an `**Effort:**` hint to each ticket, beside the `**Model:**` hint. The subagent ship modes honour it: an Agent tool call can pass a model but not an effort, so gps ships one plugin subagent per level (`agents/gps-ticket-<level>.md`, each setting `effort:` in its frontmatter) and `dispatch-prompt.js` picks the one that matches the ticket.

Claude Code offers five effort levels: `low`, `medium`, `high`, `xhigh` and `max`.

## Decision

Ticket hints offer `low`, `medium`, `high`, `xhigh` and `inherit`. `max` is not offered:

- `write-apply.js` refuses a ticket whose `**Effort:**` line says `max`, and says why;
- `dispatch-prompt.js --effort max` is a usage error with the same reason;
- a hand-edited `max` in a saved ticket is warned about by `ticket-queue.js` and runs as `inherit`;
- there is no `gps-ticket-max` subagent.

The list lives in `TICKET_EFFORTS` (`skills/gps/scripts/lib/ticket-model.js`), and the reason in `MAX_EFFORT_REASON` beside it. `tests/skill.test.js` checks that the subagents match that list, so `max` can't come back through a stray agent file.

## Why

A gps ticket is meant to be one small, independently committable change with its own Verification Step. `max` is the slowest and most expensive level, and for a change of that size it rarely pays off. A ticket that seems to need it usually hides several changes, or a design question the grill left open: the better fix is to split it in the plan, or to settle the question first.

When `max` really is wanted, the user can still have it: raise the session's own effort with `/effort max` and ship that ticket inline (`/gps ship <N>`). No hint can do that for them anyway, since a running session can't change its own effort.

## Consequences

- Hints top out at `xhigh`.
- A level the ticket's model doesn't support falls back to the highest level it does support, and a model without effort support ignores the hint. This is Claude Code's behaviour ([model configuration](https://code.claude.com/docs/en/model-config)), not gps's.
- To revisit: add `max` to `TICKET_EFFORTS`, drop the `max` checks, add `agents/gps-ticket-max.md` (the test then expects it), and update this record.
