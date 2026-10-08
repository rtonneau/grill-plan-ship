# /gps init

**When:** first use in a project (optional: `/gps start` works without it), or `/gps start` warned that `.work/` is git-ignored. It checks the project before the first session and commits gps's setup on its own (config, `.gitignore` entries, and a title-only CHANGELOG when there is none).

1. `init.js`. Relay its checks. If it says gps is set up, stop there.
2. Add one line on the grill and plan helpers, from the skills you can see installed: `grilling` (mattpocock-skills) or `brainstorming` for the grill and `writing-plans` for the plan, else the built-in grill and Claude-drafted tickets. Nothing to install: the fallbacks work.
3. If it reports `.work/` git-ignored, ask with `AskUserQuestion` whether to commit gps's session files with the code (Recommended: yes; that is how gps keeps the session record, the glossary and ADRs) or keep them local.
4. Ask with `AskUserQuestion` whether to apply the setup on the branch it names (Recommended: yes; it should be the base branch, before any session branch exists). Only on yes: `init.js --apply`, adding `--unignore-work` only if the user said yes in step 3. Relay its output.

It never changes a stored GitHub flag: if it warns that detection differs, suggest `/gps config --rescan`.

**Examples:** `/gps init`
