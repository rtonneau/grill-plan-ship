# 0005: Jev model/effort hints stay optional and family-level

_Recorded 2026-10-08, version 2.6.2._

## Context

TypeSafe's Jev (a System One model, reachable over HTTP with a `TYPESAFE_API_KEY`) can judge a ticket's `**Model:**`/`**Effort:**` hint during `/gps plan` instead of leaving the choice to Claude's own heuristic (`references/plan.md`). Not every gps user has a TypeSafe account, so the integration must change nothing for a project that never sets the key.

Decision 0004 already fixed the vocabulary a ticket's `**Model:**` line may hold: `haiku`, `sonnet`, `opus` or `inherit`, never a version-pinned build, because the `Agent` tool's `model` parameter only ever accepts a family alias. Adding Jev doesn't change that constraint — it only changes who decides which family to write.

## Decision

Jev is gated by `TYPESAFE_API_KEY` (presence detected by `diagnoseJev`, `lib/jev.js`) and a `jev.enabled` flag in `.work/gps-config.json`, detected and re-detected exactly like `github.enabled` (`lib/project-config.js`: seeded on first creation, re-detected only by `/gps config --rescan`, hand-overridable). Neither the env var's value nor anything else secret is ever written to the config file.

When enabled, `/gps plan` pipes every drafted ticket into `jev-hints.js` once per plan run. Jev judges each ticket's Model among five version-named criteria (`haiku-5.5`, `sonnet-5`, `sonnet-5.5`, `opus-5`, `opus-5.5`) so its reasoning has real nuance, and its Effort among the four `TICKET_EFFORTS` levels directly. The version-named answer is always collapsed to its family (`*-haiku* → haiku`, `sonnet-* → sonnet`, `opus-* → opus`) before it is written to the ticket's `**Model:**` line — the line `dispatch-prompt.js` actually reads stays exactly what decision 0004 constrains it to. Nothing Jev said is discarded: the raw answer and its confidence are recorded verbatim in a `**Model (Jev):**` line, kept purely for audit — nothing downstream reads it.

Any Jev failure (not enabled, missing key, timeout, network error, non-2xx, a malformed or unrecognized response) is a warning, never a `GpsError`: `jev-hints.js` reports `{ used: false }` and `/gps plan` falls back to Claude's own judgment for that ticket, unchanged from before this feature existed.

## Alternatives rejected

- **Write the raw version-pinned value straight to `**Model:**`:** asked for directly in the 2026-10-08 brainstorm that produced this record. Rejected: it hits the same wall decision 0004 already hit — the `Agent` tool's `model` parameter only accepts `sonnet | opus | haiku | fable`, never a version-pinned ID, so `dispatch-prompt.js` has nowhere to put a pinned version.
- **A 5×4 pinned-version-by-effort agent-file grid:** store the version pin in a subagent file's frontmatter instead, one file per (model version × effort level) pair. Rejected for the same two reasons decision 0004 already gives for this shape: it contradicts the one-file-per-`TICKET_EFFORTS`-level invariant `tests/skill.test.js` checks, and it hardcodes first-party Anthropic model IDs that break Claude Code users on Bedrock, Vertex, or Foundry, who need a provider-specific ID instead.

## Consequences

- `TICKET_MODELS`, `TICKET_EFFORTS`, `dispatch-prompt.js`, and the four effort subagents are unchanged; Jev only ever feeds a value into the same two lines Claude's own judgment already filled.
- A project that never sets `TYPESAFE_API_KEY` sees no behavior change at all: `jev.enabled` is `false`, `jev-hints.js` reports `{ used: false }` immediately, and `/gps plan`'s existing heuristic text decides every ticket, exactly as before this feature existed.
- `**Model (Jev):**` is informational only. If a future ticket format ever needs to act on the raw version (not just display it), that is a new decision, not an extension of this one — acting on it still runs into the `Agent` tool constraint decision 0004 and this record both describe.
- To revisit: this depends on the `Agent` tool's `model` parameter staying family-alias-only, same as decision 0004. If Claude Code changes that, re-open both records together before letting `**Model (Jev):**` drive dispatch.
