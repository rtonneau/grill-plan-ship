# /gps plan

**When:** the grill design is approved.

1. `write-prepare.js`. If the grill phase is pending, finish `references/write.md` steps 2–3 now (only for a design approved in this conversation; otherwise say the grill must be finished first). Relay write-apply's `✅` line, not its `Next:`.
2. `plan.js`.
3. Draft each ticket's content at once with `writing-plans` (superpowers), working from the resume `plan.js` names: Acceptance Criteria, Files to Touch, a Verification Step command with its expected output, Notes (the fields `write-prepare.js`'s ticket block prints) — leave the Model/Effort lines for step 4. Missing `writing-plans`: draft them yourself and say once that `superpowers` gives a fuller planner. Make each ticket one independently committable change, ordered so every ticket builds on committed work.
4. Pipe every drafted ticket (one `--- ticket: NN-<slug> ---` block each) into `jev-hints.js` once, for the whole plan. For a ticket it judged (`used: true`): write `**Model:** <family>`, `**Model (Jev):** <raw> (confidence <n>)`, `**Effort:** <level>` from its output line. For every other ticket (not enabled, or that call failed — `jev-hints.js` only ever warns, never errors), decide both yourself:
   - Model: default to `fast` whenever the ticket is small, clear and mechanical — most recurring renames, docs, config, and obvious one-file changes qualify. Reach for `medium` when it needs ordinary multi-step implementation judgment, `heavy` for cross-file design judgment or tricky debugging, and `inherit` only when genuinely unsure. GPS resolves these portable tiers to Haiku/Sonnet/Opus on Claude and Luna/Sol/Astra on Codex.
   - Effort `low`: the change is spelled out; `medium`: ordinary; `high`: subtle logic or several files to keep consistent; `xhigh`: hard reasoning a mistake would be costly in; `inherit`: unsure. There is no `max`: a ticket that seems to need it should be split instead (`write-apply.js` refuses it).
5. Run `unslop` on each ticket (missing: skip it and say so), keeping every Model/Effort/Model (Jev) line through it.
6. Ask for approval of the tickets using the router's host question rule. Once approved: `/gps ship` saves and implements them (`/gps write` only saves them; `/gps auto` runs on to finish).

**Example:** `/gps plan`

Before delegated auto/ship, inspect `config.js` and the Codex onboarding guidance in `references/config.md` for mappings and supported efforts. Portable plans can be saved without mappings; delegated execution requires whole-queue preflight and runtime verification before ticket-start.
