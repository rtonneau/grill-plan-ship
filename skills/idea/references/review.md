# /idea review <slug>

**When:** revisiting a `grilled` or `planned` Idea to revise its grill and plan, without implementing anything. The file is rewritten in place; git holds the earlier versions.

1. Run `idea-find.js <slug> --json`. Use the hit whose status is `grilled` or `planned`; if both Scopes have one, ask which with `AskUserQuestion`. `captured`: point at `/idea start <slug>` and stop. `promoted` or `dropped`: show its summary (Problem, Decisions, the last Changelog entries, `promoted_to`) and stop.
2. Read the Idea file and show a summary: status, Scope, `reviews`, the date of the last Changelog entry, the Problem in one or two lines, the Decisions, the Open questions, and the Plan milestones when there are any.
3. Ask what has changed since then (free text: new facts, shifted priorities, work done elsewhere).
4. Re-grill, with the grill chain of `references/start.md`, only:
   - each open question,
   - each Decision, Risk or milestone the answer to step 3, or the code as it is now, makes stale. For a Project Idea, check claims about the repo against the code.

   Everything else stays as written. Terms go where `references/start.md` puts them.
5. Show what will change, section by section, and ask for approval with `AskUserQuestion`.
6. Write the body file (`SKILL.md`, Idea body) from the current body with the approved changes. Run the save checks (`references/capture.md`), then `idea-save.js <slug> --action review --body-file <file> --event "<one line: what changed>" [--global] --json`, with `--global` for a Global Idea. `save` bumps `reviews` and keeps the status.
7. Relay the `path`, the new `reviews` count and the commit.
