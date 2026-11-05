# 0016: Shared behavioral roles; the parent accepts and delivers

## Context

Decision 0014 removed host-specific agents that existed only to set effort. Its one implementer brief left independent review and finding recovery implicit. Reusable responsibilities are useful without reintroducing model tables or separate host prompts.

## Decision

- Extend 0014's **one brief** to **one shared brief per behavioral role**, assembled from a common context template plus implementer/reviewer templates by the existing read-only `dispatch-prompt.js`. No agent definitions or new scripts. The default remains implementer for existing callers.
- Implementers execute one ticket, verify it and fill only narrative sections of its existing commit log. Reviewers independently inspect the actual stable diff against criteria and conventions, reporting actionable findings with severity/file/line and verification gaps. Reviewers never edit, including the log. Neither role commits, changes session state, delivers or delegates.
- The parent records the immutable review base and pre-existing changes before implementation, owns acceptance and every Git write/state transition, and freezes all writers during review. A reviewer report is evidence, never a completion signal to a script.
- Review delegated changes affecting security, persisted state, migrations, public APIs or delivery, or interacting behavior across components. Localized low-risk changes use parent review. Preserve explicit inline/delegate choices; unavailable spawning permits inline fallback unless delegation or independent review was required.
- The parent records findings, gaps, dispositions and a recovery count in existing Review Notes. Actionable findings return to implementation for at most one correction/recovery pass, then verification and fresh review. Retain the count on resume; unresolved findings or missing evidence block and are reported. A later resume requires new evidence or a resolved blocker, not a reset retry loop. Permission denials keep 0015's stop behavior.
- Both hosts receive identical role text in a fresh child context. Adapters describe native spawning and final-result handling, without claiming identical tool/permission contracts. Resolve models/efforts live, preserving project pins and explicit requirements. Role restrictions are instructions under host permissions, not a security boundary.

## Alternatives rejected

- Separate Claude agent definitions and Codex prompts: duplicate responsibilities and drift; no demonstrated need for role-specific host definitions.
- Review every tiny edit: contradicts decision 0013's proportional process.
- Parse a review verdict into ticket completion: acceptance is judgment; an empty or optimistic report cannot prove criteria or verification.
- New review-state files or a review orchestrator: the existing narrative log supports handoff and bounded recovery without changing the session schema. Tests and live probes distinguish scripts' guarantees from agent behavior.
- Researcher roles or parallel implementation: outside this change; tickets still share one ordered checkout.

## Consequences

0014's parent ownership, sequential tickets, native model resolution and lack of host agent definitions remain. Only its single-brief choice is superseded. Older in-progress logs remain readable; before first review, reconstruct a missing base/ownership from history and the actual diff, and block if ambiguous. Reports and correction counts are parent-maintained narrative, so tests cannot prove every host follows them. Compatibility evidence states that limit explicitly.
