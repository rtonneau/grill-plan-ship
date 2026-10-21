# /idea drop <slug>

**When:** an Idea won't be built. The file stays in the Backlog, marked `dropped`, with the reason in its Changelog; `/idea list --all` still shows it.

1. Run `idea-find.js <slug> --json`. Use the hit whose status is `captured`, `grilled` or `planned`; if both Scopes have one, ask which with `AskUserQuestion`. `promoted` or `dropped`: show its status and path and stop.
2. Ask for the reason with `AskUserQuestion`: "No longer needed", "Done another way", "Superseded by another Idea". "Other" takes a free-text reason; for "Superseded", ask which Idea in chat and name it in the reason.
3. Run the save checks (`references/capture.md`) with the Idea's Scope. Then run `idea-save.js <slug> --action drop --event "<reason>" [--global] --json`, with `--global` for a Global Idea.
4. Relay the `path` and the commit.
