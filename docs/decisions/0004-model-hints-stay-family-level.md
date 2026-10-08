# 0004: ticket model hints stay family-level

_Recorded 2026-10-08, version 2.6.2._

## Context

A ticket's `**Model:**` line names a family — `haiku`, `sonnet`, `opus` or `inherit` — not an exact model version. The request that prompted this record asked for five options instead: Haiku 5.5, Sonnet 5, Sonnet 5.5, Opus 5 and Opus 5.5, so that a ticket could pin not just a family but a specific build within it.

That turns out to collide with how `/gps ship`'s subagent modes already work (decision 0001). `dispatch-prompt.js` builds an `Agent` tool call per ticket: `subagent_type` picks the effort-level plugin subagent (`agents/gps-ticket-<level>.md`, one file per `TICKET_EFFORTS` level), and `model` is passed alongside it as a family alias. Both axes are independent today because the `Agent` tool's own `model` parameter only accepts `sonnet | opus | haiku | fable` — never a version-pinned ID — so a ticket's effort and its model family can be set separately without either mechanism touching the other.

Claude Code subagent frontmatter can hold a version-pinned `model:` value (e.g. `claude-sonnet-5`), and docs say a per-invocation `model` parameter on the dispatch call overrides that frontmatter value when both are set. Pinning a ticket to an exact version therefore means leaving the per-invocation `model` out of the call and letting a subagent file's frontmatter carry the version instead — but that file is the same one `subagent_type` already uses to carry the effort level. The two hints would have to share one selector.

## Decision

`TICKET_MODELS` stays `haiku`, `sonnet`, `opus`, `inherit` (`skills/gps/scripts/lib/ticket-model.js`). No version-pinned values are added, and no new agent files are introduced for this axis. Which exact build a family alias resolves to (Sonnet 5 vs. Sonnet 5.5, Opus 5 vs. Opus 5.5) is controlled by the user's own Claude Code setup — the `/model` command, `settings.json`, or the `ANTHROPIC_DEFAULT_SONNET_MODEL` / `_OPUS_MODEL` / `_HAIKU_MODEL` environment variables — never by a gps ticket.

Within that, `/gps plan`'s guidance (`skills/gps/references/plan.md`) leads with `haiku` as the default pick, not just one of four equal options:

- **`haiku`** — the default for any ticket that is small, clear and of a kind that recurs often in a plan: renames, docs, config, one file with an obvious pattern. Most mechanical tickets qualify, and a plan with several such tickets should hint `haiku` on most of them.
- **`sonnet`** — once the ticket needs ordinary multi-step implementation judgment that a mechanical pass can't cover.
- **`opus`** — only for cross-file design judgment or genuinely tricky debugging.
- **`inherit`** — only when truly unsure; the ticket then runs at the session's own model.

## Alternatives rejected

- **Version-pinned model hints, exclusive with effort:** add pinned-version agent files (e.g. one per Haiku 5.5 / Sonnet 5 / Sonnet 5.5 / Opus 5 / Opus 5.5) and let a ticket set either a pinned version or an effort hint, since both would ride on the same `subagent_type` selector. Rejected: it quietly removes effort control from every version-pinned ticket, which is a sharp, easy-to-miss edge case for something as small as a model preference.
- **A full cross-product grid:** one agent file per (model version × effort level) pair, roughly twenty files. Rejected: it directly contradicts the documented one-file-per-`TICKET_EFFORTS`-level invariant (decision 0001, checked by `tests/skill.test.js`), for a benefit — pinning an exact version per ticket — that the next alternative shows isn't safely gps's to make anyway.
- **Pinning a first-party model ID in plugin code regardless:** rejected on its own terms even where the grid problem wouldn't apply. A version-pinned ID is provider-specific (Bedrock wants an inference-profile ARN, Vertex a version name, Foundry a deployment name), so a plugin shipping a hardcoded Anthropic-first-party ID breaks for anyone running Claude Code through another provider.

## Consequences

- `TICKET_MODELS`, `dispatch-prompt.js` and the four effort subagents are unchanged.
- A ticket's model hint stays a family-level preference (how deep a model the ticket needs), not a version pin (exactly which build runs it). Picking the build is the user's model configuration, outside any ticket.
- To revisit: this depends on the `Agent` tool's `model` parameter staying family-alias-only and on frontmatter version-pinning staying lower precedence than it. If Claude Code changes either, re-open this record before adding version-pinned values to `TICKET_MODELS`.
