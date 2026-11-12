# /gps start [--issue] [--worktree] <name>

**When:** beginning any change, or with `--issue` a bug or small request (on a GitHub project saving the grill files it as a GitHub issue).

1. `start.js [--issue] "<name>"`. Relay it. A seed block means `/gps scout` proposed this work: start from it.
   - **`--worktree`** (the user wants sessions in parallel, or `start.js` warned that another session is unfinished here): `start.js --worktree [--path <dir>] [--branch <name>] "<name>"` creates a git worktree on the session branch. From then on run every command and edit every file in the 🌳 path it prints. Refused until `/gps init` has committed the project config.
   - **`↩️ Session … already exists`** (nothing was written). `Current session: no`: ask "Continue session X?" (host question rule). Yes → `set-current.js <id> --confirmed`; no → stop and suggest another name. Then, or when already current: grill phase → continue from HANDOFF.md, the glossary and ADRs, saying the earlier conversation was not saved; saved resume without a plan → inspect the resume and git diff/log, then continue *Small work* if the scope is still small, keeping completed work; otherwise follow the printed `Next:`.
2. **Size the work** from the request and a look at the code, and say the size in one line; the user can overrule it.
   - **Small:** one clear, low-risk change with nothing for the user to decide. Follow *Small work*.
   - **Standard:** a feature, or several connected changes. Run the grill, then `/gps plan`.
   - **High-risk:** data migration, security, public API, or hard to undo. Run the grill and settle failure and rollback paths too; `/gps plan` then asks for ticket approval.

   With `--issue`, frame it as a report: Problem Statement is the report, "Current behavior" the reproduction, Success Metrics the expected result.

## Small work

Save the grill (`references/write.md`; write `N/A` where a section doesn't apply), implement on the checked-out branch, run the check that proves it, commit (for an issue, `(#N)` in the message), and run `/gps finish`. No plan, tickets, branch or PR. If it grows a product decision or more than one reviewable change, say so and move to Standard.

## Grill

_Adapted from the `grilling` and `domain-modeling` skills of mattpocock-skills (https://github.com/mattpocock/skills.git)._ When the user names another grill skill, run that one; the host question rule still applies.

Interview the user until you both hold the same design. Treat it as a design tree: each decision opens the ones that hang off it. First run `domain-doc.js where` and read the glossary and ADRs it lists.

- **Facts are yours, decisions are theirs.** Look up what the code, docs or tools can answer; put only real decisions to the user.
- **Ask the frontier only:** questions whose prerequisites are settled, in one question-tool call per round (independent questions together, up to the tool's limit), each with 2–4 concrete options and your recommended answer first (host question rule); never a bare chat question. Recompute the frontier after each answer.
- **Sharpen the language.** When a term is vague or clashes with the glossary, propose one precise word and probe it with a concrete edge case; check claims against the code.
- **Write terms down as they settle:** `domain-doc.js glossary`, then add the term. Domain terms only.
- **Record an ADR** only for a decision that is hard to reverse, surprising without context, and a real trade-off: `domain-doc.js adr <slug> --title "<title>"`, then 1–3 sentences.
- **Done** when the frontier is empty and you could fill every section of the resume without guessing. Summarize the design and ask for approval once (host question rule): it is the one design gate of the session. Then `/gps plan`, or `/gps auto` if the user wants no more stops.

**Examples:** `/gps start add-dark-mode` · `/gps start --issue crash when saving a large file`
