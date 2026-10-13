# Shared core with host dispatch adapters

## Context

Claude Code and Codex can continue the same GPS session. Their delegation tools use different fields and model names. Claude agent definitions encode effort in the selected subagent; dropping that field in Codex loses the requested effort.

## Decision

Keep session state, ticket aliases, validation, Git operations, and ticket prompts shared. `dispatch-prompt.js --host claude|codex` uses `lib/host-dispatch.js` to build the host's call. The default remains Claude for compatibility.

Ticket model values remain `haiku`, `sonnet`, `opus`, and `inherit`. In Codex these are portable preference aliases resolved through `delegation.codex.models` in the project's `.work/gps-config.json`. Each entry supplies a model ID and supported effort levels. Explicit effort with an inherited model requires `delegation.codex.inheritEfforts`. Missing mappings or unsupported effort stop dispatch without changing state. The host must also check that its current tool and account can honor the emitted overrides. GPS does not choose a replacement silently.

Codex receives the complete brief with `fork_turns: none`, explicit model and reasoning overrides when requested, and one ticket per agent. Claude retains its existing effort agents. Both use the same DONE, READY, BLOCKED, review, and completion checks.

The portable root manifest is a known release version file; no additional compatibility manifest was required by the verified CLI installation route. Existing explicit release file lists remain authoritative; this repository includes its new root manifest in the saved list. GitHub attribution names GPS because sessions may span hosts.

For a mapped Codex model with effort `inherit`, GPS requires `--parent-effort <low|medium|high|xhigh>` from authoritative current runtime context, validates it and emits it explicitly. Unknown parent effort requires an explicit ticket effort choice; do not infer it from settings, transcripts, model IDs or declared support. Explicit ticket effort takes precedence. Parent effort is runtime input and is never stored in session state. Native `inherit/inherit` omits both overrides; the host resolves these fields, including any host agent defaults.

Delegated execution saves the approved plan, reads the pending queue, accepts mode/overrides, resolves effort, runs read-only whole-queue `dispatch-preflight.js`, and verifies actual runtime capabilities before ticket-start. Preflight and dispatch share `resolveCodexHints`; each dispatch revalidates current settings. Accepted overrides and parent effort are passed unchanged. Config output exposes stored delegation declarations without discovering account capabilities. Auto uses this same sequence and stops before implementation/finish on failure; inline skips delegation validation.

## Consequences

Codex delegation requires configuring available models or explicitly choosing `inherit/inherit`. Inline execution requires no mappings. Model availability remains a client capability check; configuration records the intended mapping rather than discovering account access. No host-specific session format is introduced.
