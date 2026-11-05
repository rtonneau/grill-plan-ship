# GPS architecture

GPS turns a request into verified, delivered code and keeps enough state on disk that any host can resume it. The host agent does the judgment; scripts do what must be exact.

## Workflow

```text
/gps start  ── size the work
   ├─ small ──────► implement ─ verify ─ commit ─────────────► finish
   ├─ standard ───► grill ─ approve design ─ plan ─ ship ────► finish ─► release
   └─ high-risk ──► grill + rollback ─ approve ─ plan ─ approve ─ ship ─► finish ─► release
```

| Layer | Owns | Where |
|---|---|---|
| Host agent | Investigation, design questions, tickets, implementation, review, recovery | `skills/*/SKILL.md`, `references/<command>.md` |
| Scripts | Session state, write transactions, git and gh calls, changelog, release | `skills/*/scripts/` (Node built-ins only) |
| Host adapter | Mapping one ticket brief to a spawn call | `lib/host-dispatch.js` |
| Session files | Resume on any host or machine | `.work/sessions/<id>/` |

**The user decides** product questions, ambiguous scope, and irreversible or outward actions not already requested. A typed command is the go-ahead for what its reference describes. **The agent decides** everything else, including how to recover from a failure.

**Delegation.** A ticket runs inline or in one child that gets the same brief on both hosts. The child implements, verifies and fills the commit log. The parent reviews the diff and is the only process that touches git and session state. See [decision 0014](decisions/0014-one-brief-parent-commits.md).

## Component audit

Each row answers: what problem it solved, whether that problem remains, and the verdict.

| Component | Problem it solved | Still exists? | Verdict |
|---|---|---|---|
| Session files, history, phase derivation | Work lost between sessions and hosts | Yes: native resume is per-host | KEEP |
| `write-prepare` / `write-apply` payload | Half-written or malformed phase files | Yes | KEEP |
| `ticket-start`, `ticket-complete`, `ticket-block`, `ticket-queue` | Resumable tickets with scoped commits | Yes | KEEP |
| `finish`, `release`, changelog fragments, `github.js` | Exact delivery, no fragment conflicts | Yes | KEEP |
| Allowed-tools list, one rule per script | Scripts run unprompted, nothing else | Yes | KEEP |
| One-commit-per-ticket | Review and resume granularity | Yes, but over-rigid | SIMPLIFY: follow-up fix commits are normal |
| Ticket granularity guidance | Oversized changes | Yes | SIMPLIFY: one reviewable change, one-ticket plans are fine |
| Grill and plan as mandatory phases | Under-specified work | Only for non-trivial work | SIMPLIFY: three sizes |
| Router and references | Progressive disclosure | Yes | SIMPLIFY: 21–34% fewer bytes per flow |
| `/gps auto` | Unattended runs | Yes, smaller | SIMPLIFY: no questions in the route |
| `idea` skill | Backlog separate from sessions | Yes | KEEP independent; SIMPLIFY its grill and question rule |
| Jev hints | Optional outside model judgment | Optional | KEEP (opt-in, decision 0005) |
| "Never retry" stop rules | Runaway retries | Bounded recovery covers it | REPLACE: bounded recovery |
| Hardcoded Codex model and effort table | Mapping tiers to IDs | The spawn tool lists them live | REPLACE: parent resolves; optional project pin |
| `gps-ticket-<effort>` agents | Agent calls could not set effort | No: `effort` is a call parameter | DELETE |
| `subagent` / `subagent+inline` modes | Trading context for review | Merged | DELETE: one `delegate` mode |
| Child commits, `ticket-check.js` | Verifying a child's commit claim | No: children no longer commit | DELETE |
| `dispatch-preflight.js`, `--parent-effort` | Static validation of the table above | No | DELETE |
| Ship-mode and hint questions | Choosing delegation | Agent can judge it | DELETE: flags override |
| Separate ticket approval | Reviewing tickets | Only for high-risk work | DELETE elsewhere: design approval covers it |
| External grill and plan skill chains, `unslop` | Better conversations | Built-in covers it; chains needed override rules | DELETE from the workflow; a user can still name a skill |
| Review, audit and superseded plan docs | History | Git holds them | DELETE |

## Considered and left out

- **Parallel tickets in worktrees.** Tickets are ordered to build on committed work, and they share session state. Claude's worktree isolation branches from the default branch, not the session branch, and the Codex subagent docs offer no equivalent. The cost exceeds the benefit today. Read-only helpers may run in parallel.
- **Lifecycle hooks.** Codex documents plugin hooks only for manually installed desktop plugins, so hooks could not be shared. Nothing in the workflow needs one.
- **`allow_implicit_invocation: false`.** It made explicit `$gps` unreliable under `codex exec`. See [COMPATIBILITY.md](COMPATIBILITY.md).

## Measured change

Static footprint: bytes an agent loads for a flow (SKILL.md body plus the references it reads), computed from `main` and this tree.

| Measure | Before | After | Change |
|---|---|---|---|
| gps router body (bytes) | 5794 | 4641 | -20% |
| Small change flow (bytes) | 13879 | 11029 | -21% |
| Planned change flow (bytes) | 23091 | 15773 | -32% |
| Auto run flow (bytes) | 20654 | 13734 | -34% |
| gps description, always loaded (bytes) | 250 | 365 | +46% |
| idea description, always loaded (bytes) | 324 | 284 | -12% |
| gps scripts (files) | 26 | 24 | -8% |
| gps script code (lines) | 7192 | 7046 | -2% |
| Dispatch code (lines) | 309 | 155 | -50% |
| Agent definitions (files) | 4 | 0 | -100% |

The gps description grew on purpose: it now states its negative trigger.

Live runs: Claude Code 2.1.318, Sonnet parent at low effort, one disposable repo each. **Each row is one sample,** so treat cost and turns as indicative. Bytes and behavior are the firmer evidence.

| Prompt | Version | Outcome | Questions | Turns | Cost |
|---|---|---|---|---|---|
| Add a one-line comment | Before | Stopped at "Ready for me to implement this?", no code | 1 | 5 | $0.12 |
| Add a one-line comment | After | Implemented, verified, committed, finished | 0 | 14 | $0.18 |
| Two tickets, `auto --delegate` | Before | Complete; no session record committed (CRLF bug) | 0 | 31 | $0.52 |
| Two tickets, `auto --delegate` | After | Complete, record committed | 0 | 20 | $0.39 |

The old delegated run included a hung command the agent had to stop, which inflates its numbers. Token totals per run were not compared, so this document claims no token savings beyond the byte counts.
