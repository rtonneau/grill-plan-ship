# /gps init

**When:** first use in a project (optional: `/gps start` works without it), or `/gps start` warned that `.work/` is git-ignored. It checks the project before the first session and commits gps's setup on its own (config, `.gitignore` entries, and a title-only CHANGELOG when there is none).

1. `init.js`. Relay its checks. If it says gps is set up, stop there.
2. If it reports `.work/` git-ignored, ask using the host question rule whether to commit gps's session files with the code (Recommended: yes; that is how gps keeps the session record, the glossary and ADRs) or keep them local.
3. Ask using the host question rule whether to apply the setup on the branch it names (Recommended: yes; it should be the base branch, before any session branch exists). Only on yes: `init.js --apply`, adding `--unignore-work` only if the user said yes in step 2. Relay its output.

It never changes a stored GitHub flag: if it warns that detection differs, suggest `/gps config --rescan`.

**Examples:** `/gps init`
