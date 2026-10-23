# /idea promote <slug>

**When:** it's time to build an Idea. Run it in the repo where the work will happen; a Global Idea can be promoted from any repo, a Project Idea only from its own. Ends with a gps session whose grill is saved on the default branch, and the Idea marked `promoted`. On Codex, read every `/gps` command below as `$gps` (gps's own router translates it the same way for its Codex users).

1. Run `idea-find.js <slug> --json`. Use the hit whose status is `captured`, `grilled` or `planned`; if both Scopes have one, ask which with `AskUserQuestion`. `promoted`: show `promoted_to` and stop. `dropped`: show the drop reason (last Changelog entry) and stop.
2. Run `idea-resolve.js --json` for the target repo. `inRepo` false: say that Promote needs a git repo and stop. `offDefaultBranch` true: ask with `AskUserQuestion`:
   1. "Switch to `<defaultBranch>` first": run `git -C <gitRoot> switch <defaultBranch>`; if git refuses, show its message and stop.
   2. "Stop": end the command; nothing has changed.
3. Read the Idea file.
4. Invoke `/gps start <slug>` (`$gps start <slug>` on Codex; the gps skill), with the slug exactly as is: gps stores it as the session's `feature_name`, which `/idea list` matches against the slug. Note the session id from its `✅ Session started: <session-id>` line.
5. Open the gps grill with the Idea instead of starting from zero: present its Problem, Decisions, Open questions, Plan and Risks.
   - `grilled` or `planned`: re-grill only the open questions and the items the code or the user now contradicts; confirm the rest as a whole.
   - `captured`: run the full grill, opened with its Problem.
   - Global Idea: its `## Terms` go into this repo's glossary now, the way gps writes terms.

   gps's grill rules apply, `AskUserQuestion` included.
6. Once the design is approved, save it with `/gps write` (`$gps write` on Codex), not `/gps plan`. `/gps plan` goes on to the plan, and on a GitHub project saving the plan creates the session branch; `/gps write` saves only the grill, on the default branch you're on, so the Idea is marked there too, before any branch exists.
7. Run `idea-promote-check.js <session-id> --json`. If `grillSaved` is false, stop without marking the Idea: say the grill isn't saved yet (`currentPhase` shows where the session is), and that once `/gps write` (`$gps write` on Codex) has run, `/idea list` offers to mark the Idea.
8. Run the save checks (`references/capture.md`) with the Idea's Scope. Then run `idea-save.js <slug> --action promote --promoted-to "<repo>:<session-id>" [--global] --json`, where `<repo>` is the directory name of `gitRoot` from step 2, and `--global` is for a Global Idea.
9. Relay the commit, then suggest `/gps plan` (`$gps plan` on Codex) to plan the session.
