# /gps plan

**When:** the grill design is approved.

1. `write-prepare.js`. If the grill phase is pending, finish `references/write.md` steps 2–3 now (only for a design agreed in this conversation; otherwise say the grill must be finished first). Relay write-apply's `✅` line.
2. `plan.js`.
3. Draft the tickets from the resume `plan.js` names, with the fields `write-prepare.js`'s ticket block prints: Acceptance Criteria, Files to Touch, a Verification Step command with its expected output, Notes. A ticket is one reviewable change that leaves the checks passing, ordered so each builds on committed work. Group by behavior: one ticket per file is too fine, and a one-ticket plan is fine. When the user names a planning skill, draft with it.
4. **Hints** (optional; no line means `inherit`, the session's own): pipe every drafted ticket (one `--- ticket: NN-<slug> ---` block each) into `jev-hints.js` once. For a ticket it judged (`used: true`): write `**Model:** <family>`, `**Model (Jev):** <raw> (confidence <n>)`, `**Effort:** <level>` from its line. Otherwise set a hint only when it should differ from the session:
   - Model: `fast` for small, clear, mechanical work; `medium` for ordinary multi-step work; `heavy` for cross-file design or tricky debugging.
   - Effort: `low` when the change is spelled out; `medium` ordinary; `high` subtle or several files to keep consistent; `xhigh` when a mistake would be costly.
5. Show the ticket list. High-risk work: ask for approval (host question rule). Otherwise the design approval covers it: stop with `Next: /gps ship`, which saves and implements them; adjust them if the user replies with changes. Stop and ask only if planning changed the approved scope.

**Example:** `/gps plan`
