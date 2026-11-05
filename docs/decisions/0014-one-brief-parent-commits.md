# 0014: One ticket brief; the parent commits; the host resolves models

## Context

GPS shipped four Claude agents only to set effort, a Codex model and effort table with a preflight validating it, a `--parent-effort` input, and three ship modes. Claude's Agent tool now takes `effort` per call (v2.1.292+). Codex's `spawn_agent` lists each available model with its efforts. That live list showed the table was wrong: it mapped `medium` to a previous-generation model and claimed `xhigh` for a model that doesn't list it. Codex also keeps `.git` read-only under `workspace-write`, so a child's commit is the step most likely to fail. On Windows that was compounded by a `safe.directory` bug.

## Decision

- **One brief, no agent definitions.** Both hosts spawn a fresh general-purpose child with the same prompt from `dispatch-prompt.js`.
- **Two modes: `inline` and `delegate`.** The agent chooses per ticket; `--inline` or `--delegate` overrides.
- **The child implements, verifies and fills the commit log. The parent reviews the diff and runs `ticket-complete.js`.** Git and session state have one writer, so a sandboxed child needs no `.git` access and an interrupted child loses no state.
- **Claude tiers stay family aliases** (decision 0004). **Codex tiers are intent** ("the most capable model offered"), resolved by the parent against its spawn tool. A project may pin a tier in `delegation.codex.models`.
- **Ticket hints are preferences.** When one can't be honored, it may be dropped with disclosure. Explicit user overrides are requirements: the parent verifies current host support and blocks rather than silently lowering them (decision 0015).
- **One writer at a time.** Tickets stay sequential.

## Alternatives rejected

- **Keeping a default Codex table:** it went stale within weeks, and the host already has the truth.
- **Reading Codex's model cache file:** undocumented, so it could break without notice.
- **Children commit in their own worktrees, in parallel:** Claude's worktree starts from the default branch, not the session branch; the Codex subagent docs offer no equivalent; tickets are ordered; and `.work/` would need merging.
- **Re-running every verification in the parent:** redundant when the child reports the result. The parent re-runs when the result is missing or doubtful or the ticket is risky.

## Consequences

The parent's context holds one diff per delegated ticket. Choosing a Codex model is now model judgment, checked live for one `fast` ticket (see `docs/COMPATIBILITY.md`). This supersedes the agent files of decision 0001 and the mappings of decisions 0006 and 0007; the `xhigh` cap of 0001 still holds.
