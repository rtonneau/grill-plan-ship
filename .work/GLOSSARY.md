# grill-plan-ship glossary

A workflow plugin for Claude Code and Codex that takes a piece of work through grill, plan, ship and finish, with scripts doing every deterministic step.

<!-- Format adapted from mattpocock-skills' domain-modeling (GLOSSARY-FORMAT.md): https://github.com/mattpocock/skills.git -->

<!--
How to add a term (the moment it is resolved, not in a batch at the end):

**Term**:
One or two sentences: what it IS, not what it does.
_Avoid_: the other words people use for it

- Be opinionated: one word per concept; list the others under _Avoid_.
- Only terms specific to this project. General programming concepts and
  implementation details don't belong here: this is a glossary, not a spec.
- Group terms under "### <area>" subheadings once natural clusters emerge.
-->

## Language

**Chained finish**:
A `/gps finish` the user did not type, run automatically after `/gps ship` (with `ship.autoFinish` on) or by `/gps auto`. It asks nothing and uses the defaults (keep the issue open, no session switch).
_Avoid_: auto-finish (that is the setting, not the run)

**Ticket state**:
Where one ticket stands, derived from its files and the session history: `pending`, `started`, `blocked` or `done`.
_Avoid_: ticket status (that is the `**Status:**` line of its commit log)

**Blocked ticket**:
A ticket whose latest `ticket_blocked` event has no later `ticket_resumed`, `ticket_done` or `session_finished` event, and whose commit log is not Done. It means stuck now, not blocked once.
_Avoid_: stuck ticket

**Sendable command**:
A gps command that can be queued on an agent thread without the conversation that built the session: `status`, `help`, `handoff`, `ship [N]`, `auto [target]`, `finish`.
_Avoid_: safe command, remote command

**Status schema**:
The versioned shape of `status.js --json` and `help.js --json` that outside tools read, numbered by `schemaVersion` and documented in `docs/STATUS-JSON.md`.
_Avoid_: status API
