# /gps auto [--delegate] [plan|ship|finish]

**When:** you trust the direction and want the session to run from its current phase to the target (default `finish`) without stopping.

1. `auto-route.js [plan|ship|finish] [--delegate]` (pass `--delegate` through when typed). It prints the steps.
2. A first step `write:grill` needs a grill design approved in this conversation, and `write:plan` needs tickets drafted in it. If that content isn't here, stop and say so.
3. If it says to ask the ship mode, ask it once with `AskUserQuestion`, subagent + inline follow-up first as "(Recommended)" (whatever the last ship mode was); a preset mode (`--delegate` = subagent + inline follow-up) is used as is. Ask nothing else for the whole run.
4. Run each step through its references file as if typed (`write:*` → `write.md`, `plan` → `plan.md`, `ship` → `ship.md`, `finish` → `finish.md`), except:
   - `plan`: writing-plans only drafts. Don't execute its plan or ask for a review or an execution method; tickets drafted in `plan.md` step 3 (with or without writing-plans and unslop) count as approved.
   - `ship`: use the mode from step 3 and the model and effort hints as drafted.
   - `finish`: run as typed; its closing questions are still asked.
5. Relay each step's output, `⚠️` lines included, except its `Next:` line. A `⚠️` doesn't stop the run; repeat every one in the final report. The first `❌` (other than a write payload fix), BLOCKED ticket or failed `ticket-check.js` ends the run: report which step stopped it. Finish never runs after an incomplete ship.

**Examples:** `/gps auto` · `/gps auto plan` · `/gps auto --delegate`
