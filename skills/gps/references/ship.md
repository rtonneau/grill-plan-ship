# /gps ship [N] [--inline|--delegate]

**When:** the tickets are drafted and the user wants them built. With `N`, only ticket N.

## Before the loop

1. **Save the plan if pending:** `write-prepare.js`. Plan pending: finish `references/write.md` steps 2–3 and relay its `✅`/`🌿` lines. Grill pending or no plan: suggest `/gps plan` and stop.
2. **Queue:** `ticket-queue.js`. Relay it. All done: go to *When all are done*.

## The loop, one ticket at a time

Choose inline or delegate, then `ticket-start.js [N] --mode <inline|delegate>`; it resumes an existing log. Typed `--inline` or `--delegate` holds for the run. Otherwise delegate when hints differ from this session or the ticket crowds its context; inline for small work or unavailable spawning. Required delegation unavailable: block, never silently substitute.
Keep one writer live at a time: tickets are sequential in the shared checkout. Before implementation, record the full `git rev-parse HEAD` base and pre-existing changes/ownership in Review Notes; on resume preserve that base, evidence and recovery count. For older logs missing a base, reconstruct it from history and the diff; block if ownership/base is ambiguous.
**Inline:** implement, run the Verification Step with artifacts in scratch, fill Local Test Result, Review Notes and Blockers / Challenges, then inspect the diff against Acceptance Criteria before acceptance. No child is required by `--inline`.
**Delegate:** `dispatch-prompt.js <N> --role implementer --host <claude|codex> [--model <m>] [--effort <e>] --json` (override flags only for user requirements). Invoke its `call` with the host's native spawn tool, following `notes` and `lifecycle`; wait for the actual final result and stopped child.
- Resolve model/effort against the live tool, including project pins and aliases. Ticket hints are preferences; explicit requirements must be honored or reported BLOCKED, never lowered or omitted.
- `READY`: inspect status, actual diff and log. Re-run verification if missing, doubtful or risky. `BLOCKED`, failed child, missing final line or incomplete verification: *Recovery*, never success.

## Independent review and acceptance

For delegated work, spawn a fresh reviewer when it changes security, persisted state, migrations, public APIs or delivery, or spans multiple components with interacting behavior. Skip it for a localized low-risk change whose diff and checks the parent can assess directly; record the reason. If independent spawning is unavailable, inspect inline and record that limitation; an explicit user requirement for independent review blocks instead.
Stop implementation and freeze the diff (including untracked files); no parent edits, commits or other writers until review ends. `dispatch-prompt.js <N> --role reviewer --base <recorded-full-sha> --host <claude|codex> --json`; apply the same override rules, `notes` and `lifecycle`. Never reuse the implementer's context for review.
- `REVIEWED`: assess the findings and verification gaps yourself; it never completes a ticket. Missing/malformed report, `BLOCKED` or unstable diff: *Recovery*. A changed diff needs a fresh review before acceptance.
- After the reviewer stops, record its scope/base, findings (file/line and severity), gaps and your dispositions in Review Notes. Reject a finding only with evidence. Send actionable items back through the implementer brief (or fix inline when allowed); record one correction pass before starting it, verify, then re-review the stable diff. The recovery allowance below covers this pass too.
- Accept only with Acceptance Criteria met, credible verification and no unresolved actionable findings. Record the acceptance rationale and actual/requested model when known. Otherwise record unresolved findings/gaps in the log and `ticket-block.js <N> --reason "<remaining issue>"`; report and stop.
**Complete (parent only):** `ticket-complete.js <N> --message "<type>: <summary> (ticket NN)" --file <path>...` with only ticket-owned files. It commits the session record separately; relay `🗂️`. Later fixes to Done tickets are normal follow-up commits.

## Recovery

A permission or sandbox denial in either role blocks the parent too: do not retry the action through another shell/tool/agent, verify it yourself or complete the ticket. If permitted, `ticket-block.js <N> --reason "<denied action>"`, report and stop for the host approval path.
For other failures, first ensure every old child has stopped; inspect edits and log, preserve user work. Allow at most one recovery/correction pass per ticket, inline or with a fresh child; a capacity retry may go one tier/effort higher only if requirements permit. Record the attempt and remaining work in Review Notes before starting; resume never resets the count. On exhausted recovery, missing review/verification, or a product/access decision, record unresolved findings and `ticket-block.js <N> --reason "<why>"`, report and stop. Resume only after new evidence or the blocker is resolved; do not repeat an exhausted loop. A stopped ship never chains finish.

## When all are done

With `N`: suggest `/gps finish`. Under `/gps auto`: back to `references/auto.md`. Otherwise, when `Next:` says `ship.autoFinish` is on, run `references/finish.md` as a chained finish; else suggest `/gps finish`.

**Examples:** `/gps ship` · `/gps ship 3` · `/gps ship --delegate`
