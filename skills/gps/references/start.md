# /gps start [--issue] <name>

**When:** beginning a feature, or with `--issue` a bug or small request you want to work on (on a GitHub project the grill write files it as a GitHub issue).

1. `start.js [--issue] "<name>"`. Relay its output. A seed block means `/gps scout` proposed this work: open the grill with it instead of asking the user to restate it.
2. Start the grill at once; don't wait for the user to call a skill. Use the first one available, and say in one line which one runs:
   - `grill-with-docs` (mattpocock-skills). It is flagged `disable-model-invocation`: if the Skill tool refuses it but `grilling` and `domain-modeling` exist, call those two yourself, `grilling` first.
   - `brainstorming` (superpowers).
   - Neither: stop and tell the user to install `mattpocock-skills` or `superpowers`.

   With `--issue`, frame it as a report: Problem Statement is the report, "Current behavior" the reproduction, Success Metrics the expected result.
3. Once the design is approved: `/gps plan` (saves the grill first) or `/gps auto`.

**Bounded work** (a short in-chat design for one small change): answering a design question is not approval. Ask a standalone "Ready for me to implement this?" and wait for yes. Then save the grill (`references/write.md`) before touching code, implement on the checked-out branch (no plan, tickets, branch or PR; for an issue, put `(#N)` in commit messages), and run `/gps finish`.

**Examples:** `/gps start add-dark-mode` · `/gps start --issue crash when saving a large file`
