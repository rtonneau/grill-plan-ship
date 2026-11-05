# /gps ship [N] [--inline|--delegate]

**When:** the tickets are drafted and the user wants them built. With `N`, only ticket N.

## Before the loop

1. **Save the plan if pending:** `write-prepare.js`. Plan phase pending: finish `references/write.md` steps 2–3 for the tickets drafted in this conversation, and relay its `✅`/`🌿` lines. Grill pending, or no plan started: stop and suggest `/gps plan`.
2. **Queue:** `ticket-queue.js`. Relay it. It may say all tickets are done: go to *When all are done*.

## The loop, one ticket at a time

`ticket-start.js [N] --mode <inline|delegate>`, then run the ticket in the mode that fits:

- A typed `--inline` or `--delegate` holds for the run.
- Otherwise choose per ticket and say which in one line. **Delegate** when its hints differ from this session (a running session can't change its own model or effort) or when it is large enough to crowd this context. **Inline** otherwise, and when no spawn tool is available.

**Inline:** implement and debug it yourself, artifacts in the scratch dir. Run its Verification Step, fill the log's Local Test Result, Review Notes and Blockers / Challenges, then complete it.

**Delegate:** `dispatch-prompt.js <N> --host <claude|codex> [--model <m>] [--effort <e>] --json` (flags only when the user asked for an override). Spawn one child with its `call`: Claude's Agent tool, or Codex's `spawn_agent` applying its `notes` against the models and efforts the tool lists. Wait for the final line.
- Check model and effort support at invocation, including project pins and Claude aliases. Ticket hints are preferences; explicit user requirements must be honored or reported BLOCKED, never lowered or omitted. An unavailable required delegation also blocks.
- `READY`: read `git status` and the diff against the Acceptance Criteria. Re-run the Verification Step when the reported result is missing or doubtful or the ticket is risky. Fix small gaps yourself; note them, and the model used, in Review Notes. Then complete it.
- `BLOCKED`, failed child, missing final line, or failed/incomplete verification: go to *Recovery*; never treat these as success.

**Complete:** `ticket-complete.js <N> --message "<type>: <summary> (ticket NN)" --file <path>...` with only this ticket's files. It commits the session record on its own; relay its `🗂️` line. A later fix to a Done ticket is a normal follow-up commit.

Keep one writer live at a time: tickets are ordered and share the working tree and session state (decision 0014). Read-only helpers are fine.

## Recovery

A permission or sandbox denial in any child blocks the parent too: do not retry that action in another shell, tool or agent, verify it yourself, or complete the ticket. Run `ticket-block.js <N> --reason "<denied action>"` if permitted, report the denial, and stop for the host's normal approval path.
For other failures, ensure the old child has stopped; inspect its edits and log before continuing the same ticket. Fix a technical failure yourself, or spawn a fresh child with the remaining work and existing changes, at most once, one tier or effort higher when capacity was the problem and requirements allow. Preserve user edits. A rerun of `ticket-start.js` resumes the log. When verification still fails, or only the user can settle a product decision or credentials: `ticket-block.js <N> --reason "<one line>"`, report why, and stop. A stopped ship never chains a finish.

## When all are done

With `N`: suggest `/gps finish`. Under `/gps auto`: back to `references/auto.md`. Otherwise, when the script's `Next:` line says `ship.autoFinish` is on, run `references/finish.md` now as a chained finish; else suggest `/gps finish`.

**Examples:** `/gps ship` · `/gps ship 3` · `/gps ship --delegate`
