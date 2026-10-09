# /gps start [--issue] <name>

**When:** beginning a feature, or with `--issue` a bug or small request you want to work on (on a GitHub project the grill write files it as a GitHub issue).

1. `start.js [--issue] "<name>"`. Relay its output. A seed block means `/gps scout` proposed this work: open the grill with it instead of asking the user to restate it.
2. Start the grill at once; don't wait for the user to call a skill. Use the first one available, and say in one line which one runs:
   - `mattpocock-skills:grilling`, with `mattpocock-skills:domain-modeling` for the glossary and ADRs. Call them yourself, `grilling` first. Never `grill-with-docs`: it is flagged `disable-model-invocation`, so an agent cannot start it.
   - `brainstorming` (superpowers).
   - Neither: the built-in grill below.

   With `--issue`, frame it as a report: Problem Statement is the report, "Current behavior" the reproduction, Success Metrics the expected result.

   **Whichever grill runs, every question goes through `AskUserQuestion`, which overrides the skill's own question format** (no `❓`/`➡️` text rounds). The tool takes at most 4 questions per call and 2–4 options each: send the frontier in calls of up to 4, your recommended answer first as "(Recommended)", and put the skill's per-question reasoning in the option descriptions. Free text only for open-ended answers.
3. Once the design is approved: `/gps plan` (saves the grill first) or `/gps auto`.

## Built-in grill

_Adapted from the `grilling` and `domain-modeling` skills of mattpocock-skills (https://github.com/mattpocock/skills.git)._

Interview the user until you both hold the same design, with nothing silently assumed. Treat it as a design tree: each decision opens the decisions that hang off it. First run `domain-doc.js where` and read the glossary and ADRs it lists: they hold the project's settled language and decisions (the project's own `GLOSSARY.md` / `CONTEXT.md` and `docs/adr/` when it has them, else gps's in `.work/`).

- **Facts are yours, decisions are theirs.** Look up whatever the code, docs or tools can answer (an Explore subagent for wide searches) instead of asking. Put every decision to the user.
- **Ask the frontier only:** questions whose prerequisites are settled, so no answer rests on a guess. A question that depends on an open one waits. Each goes through `AskUserQuestion` with your recommended answer first; free text only for open-ended answers. Recompute the frontier after each answer.
- **Sharpen the language.** When a term is vague, overloaded or conflicts with the glossary, say so and propose one precise word ("you said 'account': the Customer or the User?"). Probe boundaries with concrete edge-case scenarios, and check claims against the code ("the code cancels whole orders, but you said partial cancellation is possible: which is right?").
- **Write terms down as they settle,** not in a batch at the end: `domain-doc.js glossary`, then add the term with Edit. Domain terms only: no implementation details, no general programming concepts.
- **Record an ADR sparingly:** only for a decision that is hard to reverse, surprising without context, and the result of a real trade-off. If any of the three is missing, nobody will need the record. `domain-doc.js adr <slug> --title "<title>"`, then fill it in 1–3 sentences.
- **Done** when the frontier is empty and you could fill every section of the resume `write-prepare.js` prints without guessing. Summarize the design, then ask for approval with `AskUserQuestion`; act on nothing before it.

Say once that `mattpocock-skills` or `superpowers` provide their own grill skills.

**Bounded work** (a short in-chat design for one small change): answering a design question is not approval, because the user may still be thinking aloud. Ask a standalone "Ready for me to implement this?" with `AskUserQuestion` and wait for yes. Then save the grill (`references/write.md`) before touching code, implement on the checked-out branch (no plan, tickets, branch or PR; for an issue, put `(#N)` in commit messages), and run `/gps finish`.

**Examples:** `/gps start add-dark-mode` · `/gps start --issue crash when saving a large file`
