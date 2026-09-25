# /gps write

**When:** After the brainstorming design `/gps start` began is approved (before `/gps plan`), or after the writing-plans output `/gps plan` began is approved (before `/gps ship`). Takes no arguments; it detects which phase needs writing.

**This is transcription, not design.** Copy what was already agreed in the conversation. Don't re-brainstorm, re-plan, read templates or explore the codebase.

**Steps:**

1. Run `node $CLAUDE_PLUGIN_ROOT/scripts/write-target.js`. Its JSON `target` is:
   - `none`: nothing to write. If `reason` is `plan-not-started`, suggest `/gps plan`. If it is `complete`, suggest `/gps status`. Stop.
   - `grill` or `plan`: continue with its `payloadPath`, `fields` and `sections`.
2. Write the payload to `payloadPath` in a single Write call (if `existingPayload` is true, it's left from an earlier run: Read it first so the Write can replace it):
   - First, one `**<field>:** <value>` line per entry of `fields` (e.g. `**Estimated effort:** 2 days`).
   - **`Branch` field (plan phase, GitHub projects only, when `fields` lists it):** name the session branch after the approved plan, shaped like `branchPattern`: the type that fits the work (`feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `test`), then a short lowercase slug naming the change, not the session. E.g. `**Branch:** feat/dark-mode-toggle`. Pick it yourself; don't ask the user.
   - Then one `## <heading>` block per entry of `sections`, in that order, holding the agreed content. Leave out Token Usage; the script fills it.
   - **Plan only:** after the sections, one block per approved ticket, each opened by its own line `--- ticket: NN-<slug> ---` (e.g. `--- ticket: 01-add-parser ---`; the slug is lowercase `a-z 0-9` with `-`, `_` or `.` between). Ticket body:

     ````markdown
     **Acceptance Criteria:**
     - [ ] <testable criterion>

     **Files to Touch:**
     - `<path>`

     **Verification Step:**

     Run:
     ```bash
     <command>
     ```

     Expected:
     <output>

     **Notes:**

     <anything the implementer needs>
     ````
3. Run `node $CLAUDE_PLUGIN_ROOT/scripts/write-apply.js`. It checks the payload, writes `resume.md` or `plan.md` and the tickets, fills Token Usage, removes the stubs and deletes the payload.
   - `❌` with a list: nothing was written. Fix those items in the payload and run it again.
   - `✅`: relay its line; it names the next command. On the plan phase of a GitHub project it also creates the branch from the current HEAD, switches to it and prints `🌿 Working on branch …`: relay that too. All later commits for this session go on that branch.

**Example:**

```
/gps write
```
