# /gps auto [--delegate|--inline] [plan|ship|finish]

**When:** you trust the direction and want the session to run from its current phase to the target (default `finish`) without stopping.

1. `auto-route.js [plan|ship|finish] [--delegate|--inline]` prints the steps.
2. A first step `write:grill` needs a design agreed in this conversation, and `write:plan` needs tickets drafted in it. If that content isn't here, stop and say so.
   High-risk work, including resumed plans: before `write:plan` or `ship`, require explicit approval of the drafted plan; pause for it unless already given. Starting auto does not approve unseen high-risk tickets.
3. Run each step through its references file (`write:*` → `write.md`, `plan` → `plan.md`, `ship` → `ship.md`, `finish` → `finish.md`), with these differences:
   - `plan`: ordinary tickets are covered by design approval; high-risk work keeps the approval above.
   - `ship`: a preset mode holds for the run.
   - `finish`: run it as a chained finish (`finish.md`). Target `ship` lists `finish` when `ship.autoFinish` is on.
4. Relay each step's output, `⚠️` lines included, except its `Next:` line, and repeat every `⚠️` in the final report. Recover per the script contract and `ship.md`; a blocked ticket or an unfixable `❌` ends the run, and you report which step stopped it. Finish runs only after a complete ship.

**Examples:** `/gps auto` · `/gps auto plan` · `/gps auto --delegate`
