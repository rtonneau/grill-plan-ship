# 0007: Ticket model hints use provider-neutral tiers

## Context

GPS plans are shared between Claude Code and Codex, but ticket hints used Claude family names. Codex therefore needed project mappings before it could dispatch the same plan, and the stored plan described a provider rather than the capability the ticket needed.

## Decision

Ticket `**Model:**` values are `fast`, `medium`, `heavy`, or `inherit`. GPS resolves them only when dispatching:

| Tier | Claude | Codex |
|---|---|---|
| `fast` | Haiku | Luna (`gpt-6-luna`) |
| `medium` | Sonnet | Sol (`gpt-6-sol`) |
| `heavy` | Opus | Astra (`gpt-6-astra`) |

Codex project configuration may override any tier's native model ID and supported effort levels. Omitted mappings use the built-in defaults. `inherit` continues to omit a model override.

Jev may judge using version-specific Claude choices, but GPS collapses that answer to a portable tier before writing the ticket; the raw answer remains audit metadata only.

## Alternatives rejected

- Keep Claude family names as the shared aliases: portable in mechanics, but misleading in plans and awkward for Codex users.
- Store native model IDs in tickets: couples plans to one provider and to version churn.
- Require mappings for every project: makes the common Codex path fail before its first delegated ticket.

## Consequences

Existing unshipped tickets using `haiku`, `sonnet`, or `opus` must be changed to `fast`, `medium`, or `heavy`. Dispatch output remains provider-native, and configuration stays available for installations whose model catalog differs from the built-in defaults.
