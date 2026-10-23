# /idea capture <name> [note] [--global]

**When:** an Idea comes up and there is no time to grill it. Capture takes seconds: it asks nothing except a save check, when one applies.

1. Derive the slug from `<name>` (`SKILL.md`). Run `idea-find.js <slug> --json`. If the target Scope (Global with `--global`, else Project) already holds that slug, stop: show its status and path, and point at `/idea start <slug>` (captured) or `/idea review <slug>` (grilled, planned). Ask nothing.
2. Run the save checks below, which settle the Scope and the extra save flags.
3. Context lines: when this conversation has context for the Idea (what was being worked on, why it came up), write 1–3 short lines of it. Skip this when there is none.
4. Save:
   - With context lines, write a body file holding only `## Problem`, then the note, then the context lines as a bullet list, and run `idea-save.js <slug> --action capture --event "<note>" --body-file <file> [--global] [--create-work-dir] --json`.
   - Without, run `idea-save.js <slug> --action capture --event "<note>" [--global] [--create-work-dir] --json`; the note becomes the Problem.
   - With no note, leave out `--event`.
5. Print the full `path` from the JSON and the commit line (`sha`, or `skipped` and why). Then stop: the grill waits for `/idea start <slug>`.

## Save checks

Every command that writes an Idea runs these before `idea-save.js`. First run `idea-resolve.js [--global] --json`, with `--global` when the Idea is (or is to be) Global. When `--global` is intended and that fails because no personal repo is configured yet, point the user at `idea-config.js --set-global-root <path>` and stop: nothing to ask. Each prompt is one `AskUserQuestion` with the options below in the order shown, the first marked "(Recommended)".

### 1. Missing `.work/` (new Ideas only)

If `workDirExists` is true, or the Idea already exists, go to check 2.

- **Global** (`--global`): `.work/` belongs to your configured personal repo. Add `--create-work-dir` to the save without asking.
- **Project, `inRepo` true, `globalDir` set:**
  1. "Create `<gitRoot>/.work/idea/`": add `--create-work-dir` to the save.
  2. "Use Global (`<globalDir>`)": add `--global` to the save, and run check 2 on `idea-resolve.js --global --json`.
- **Project, `inRepo` false, `globalDir` set** (no git repo here):
  1. "Use Global (`<globalDir>`)": add `--global` to the save, and run check 2 on `idea-resolve.js --global --json`.
  2. "Create `./.work/idea/` here (not committed: no git repo)": add `--create-work-dir` to the save.
- **Project, `globalDir` null** (either `inRepo`): add `--create-work-dir` to the save without asking — no Global root is configured to offer; without a repo, say it won't be committed.

### 2. Off the default branch

From the latest `resolve` output: if `offDefaultBranch` is false, save. If it is true, ask:

1. "Save on `<branch>` (the Idea travels with this branch)": save as is.
2. "Switch to `<defaultBranch>` first": run `git -C <gitRoot> switch <defaultBranch>`; if git refuses, show its message and stop. After the save, say which branch is now checked out.
3. "Use Global (`<globalDir>`)": add `--global` to the save, and run check 2 again on `idea-resolve.js --global --json` (your personal repo has its own default branch).

Offer option 3 only for a new Project Idea. An existing Idea keeps its Scope, and a Global save is already Global: ask options 1 and 2 only.
