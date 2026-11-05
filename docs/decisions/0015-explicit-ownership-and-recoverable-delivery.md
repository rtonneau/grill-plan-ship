# 0015: Explicit ownership and recoverable delivery

## Evidence

The v3 second-pass audit reproduced unrelated tracked edits swept into finish commits, pathspec expansion and partial staging loss, hook-added files escaping commit scope, failed delivery recorded as finished, interrupted writes corrupting phase or ticket state, and key-only activation sending ticket contents to Jev. See [the audit](../SECOND-PASS-AUDIT.md) for regressions and host evidence.

## Decision

- Finish has no authority to infer ownership of leftover code. It refuses tracked leftovers unchanged; named ticket files are literal individual paths, with partial staging protected.
- Hooks remain enabled. GPS checks the resulting commit. Unexpected paths leave history intact and create a per-worktree publication guard; the user reviews the commit before explicitly removing it. GPS push paths honor this guard.
- Finish checkpoints local delivery in a Git-private journal and reconciles remote PR/comment state before retrying. Required delivery failures return failure and retain a recovery route. The journal is local to the checkout, including linked worktrees; it is not a portable session replacement.
- Phase and ticket state use atomic replacement. A denied rename stops the operation without truncating the destination. Interrupted code-commit bookkeeping recovers with the existing `--commit` option.
- Jev requires explicit project consent in addition to credentials and enablement. Legacy auto-enabled flags cannot establish consent; `/gps config --enable-jev` records it after disclosure of the destination and complete ticket content.
- User-required model/effort capabilities cannot be silently downgraded. High-risk ticket approval remains meaningful under auto.

## Consequences

Routine implementation and bounded recovery remain autonomous. Dirty ownership, unsupported requirements, denied operations and missing transmission consent stop only the affected action. Two small Git-private records are justified by safety and crash recovery; there is no new orchestrator or dependency. Same-checkout cross-host resume can use them; a clone cannot recover uncommitted local work or local journals. Small changes may still commit locally on the current branch after review, with no automatic default-branch push.
