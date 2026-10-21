# /idea plan [slug]

**When:** an Idea is `grilled` (or `planned`, to rewrite its plan) and you want its milestones written down. Ends with the Idea saved as `planned`. The plan stays at milestone level: gps plans the tickets after Promote, and tickets written now would go stale.

1. Pick the Idea:
   - **With a slug:** use it.
   - **Without one:** use the Idea this conversation grilled or reviewed. If there is none, run `idea-list.js --json`, collect the `grilled` entries of both sections, and ask with `AskUserQuestion` which one (up to 4 options, newest `created` first, each labelled with its slug and Scope; "Other" takes any slug). No grilled Idea at all: say so and stop.
2. Run `idea-find.js <slug> --json`. Use the hit whose status is `grilled` or `planned`; if both Scopes have one, ask which with `AskUserQuestion`. Any other status: say which command fits (`/idea start` for `captured`) and stop.
3. Read the Idea file. Write a plan of 3–8 ordered milestones, each one line naming an outcome you could check. Rewrite Problem, Decisions, Open questions and Risks where planning sharpened them.
4. Show the plan and ask for approval with `AskUserQuestion`. On changes, revise and ask again.
5. Write the body file (`SKILL.md`, Idea body) with the full body, `## Plan` included. Run the save checks (`references/capture.md`), then `idea-save.js <slug> --action plan --body-file <file> [--global] --json`, with `--global` for a Global Idea.
6. Relay the `path` and the commit. Suggest `/idea review <slug>` later, or `/idea promote <slug>` when it's time to build.
