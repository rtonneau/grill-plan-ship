# /gps ship [N]

**When:** the tickets are approved. With `N`, implement only ticket N, inline.

## Before the loop

1. **Save the plan if pending:** `write-prepare.js`. Plan phase pending: finish `references/write.md` steps 2–3 (only for tickets approved in this conversation) and relay its `✅`/`🌿` lines, not its `Next:`. Grill pending, or no plan started: stop and suggest `/gps plan`.
2. **Queue:** `ticket-queue.js`. Relay it.
3. **Mode:** ask "inline, subagent, or subagent + inline follow-up?" using the router's host question rule, putting the `Last ship mode` it printed first as "(Recommended)". Ask on every `/gps ship`, never mid-run. With `N`: inline, no question. Under `/gps auto`: the run gives it.
4. **Model and effort hints** (subagent modes only): show the queue's hint lines (`<N>: <model>/<effort>`) and ask once: accept them (Recommended) or override (Other, as `<N>=<model>/<effort>`), with model `fast|medium|heavy|inherit` and effort `low|medium|high|xhigh|inherit` (either part alone works). GPS resolves the portable model tier at dispatch: Claude uses Haiku/Sonnet/Opus and Codex uses Luna/Sol/Astra. Optional `delegation.codex.models` entries in `.work/gps-config.json` override the Codex defaults and list supported `efforts`; `inheritEfforts` lists supported levels for the current session model. Unsupported effort: stop and ask for configuration or an explicit hint override; never guess. Inline: say once that hints are ignored (a running session can't switch its model or effort). Under `/gps auto`: take them as drafted, subject to the adapter validation.

5. **Resolve effort** (delegated modes only): in Codex, mapped model + inherited effort needs known `--parent-effort <low|medium|high|xhigh>` from authoritative current runtime context. Never infer it from settings, transcripts, supported levels or prior tickets. If unknown or unrepresentable, require an explicit supported effort choice using the host question rule; native inherit/inherit needs neither mapping nor parent input. Expand partial numeric overrides with each ticket's original hints; duplicate numbers must share a complete override or be resolved explicitly.
6. Delegated modes: run `dispatch-preflight.js --host <claude|codex> --mode <subagent|subagent+inline> [--parent-effort <level>] [--override <N>=<model>/<effort>]... --json` for the whole pending queue before ticket-start. Expand accepted overrides to both model/effort parts and retain them in memory with the parent effort for identical per-ticket dispatch inputs. A failure stops before the loop and finish. Inline skips this check.
7. **Runtime check before ticket-start** (delegated modes only): inspect the actual native spawn tool schema and available model/effort information for every pending ticket. Preflight validates project declarations, not account access. If capability cannot be established, stop with the precise missing tool/model/effort; never drop overrides. Recheck after any client/model change. No guessed mapping or automatic mode switch.

## The loop, one ticket at a time

Start each ticket with `ticket-start.js [N] --mode <inline|subagent|subagent+inline>` (the mode is recorded so the next `/gps ship` offers it). "All tickets are done": suggest `/gps finish` and stop (under `/gps auto`: back to `references/auto.md`). Then follow your mode:

**inline:** implement and debug it yourself, artifacts in the scratch dir, then run its Verification Step. Fill the log's Local Test Result, Review Notes and Blockers / Challenges, then `ticket-complete.js <N> --message "<type>: <summary> (ticket NN)" --file <path>...` with only the files this ticket touched, so each commit holds one ticket. It then commits the session record (`.work/`) on its own; relay its `🗂️` line.

**subagent:** `dispatch-prompt.js <N> --mode subagent [--model <m>] [--effort <e>] --host <claude|codex> --json [--parent-effort <level>]`, using the identical effective hints and parent effort validated above; dispatch revalidates current settings. Then use its `call` with Claude's Agent tool or Codex's native spawn tool. In Codex, pass `message`, `task_name`, `fork_turns`, and any emitted `model` and `reasoning_effort` fields. Keep `fork_turns: none` and the complete brief. If runtime capabilities changed, stop before dispatch. Never silently omit overrides. Keep one native subagent live at a time. Wait for its final line. `DONE`: `ticket-check.js <N>`; a `❌` means the DONE was false, so stop. `BLOCKED`: stop. The subagent fills its own log and commits.

**subagent + inline follow-up:** `dispatch-prompt.js <N> --mode subagent+inline [--model <m>] [--effort <e>] --host <claude|codex> --json [--parent-effort <level>]`, using the identical effective hints and parent effort validated above; dispatch revalidates current settings. Then use its `call` with Claude's Agent tool or Codex's native spawn tool. In Codex, pass `message`, `task_name`, `fork_turns`, and any emitted `model` and `reasoning_effort` fields. Keep `fork_turns: none` and the complete brief. If runtime capabilities changed, stop before dispatch. Never silently omit overrides. Keep one native subagent live at a time. Wait for its final line. `READY`: review `git status` and `git diff` against the Acceptance Criteria and re-run the Verification Step yourself. Fix what's wrong here rather than re-dispatching, since you already hold the context. Name the subagent's model and your changes in Review Notes, then fill the log and run `ticket-complete.js` as in inline. `BLOCKED`: stop and leave its changes in place for the user to inspect.

**Blocked** (inline or follow-up): if the Verification Step won't pass after reasonable attempts, or only the user can unblock it, run `ticket-block.js <N> --reason "<one line>"` and stop.

With `N`: stop after this ticket. Otherwise continue with the next one.

## Stops

On a stop, report which ticket and why. Don't retry automatically, dispatch a second subagent or switch to a stronger model or higher effort: a ticket that failed once usually needs a decision from the user, not more attempts. One implementer at a time, never two subagents live at once, because they would edit the same tree and each commit would pick up the other's changes.

**Examples:** `/gps ship` · `/gps ship 3`
