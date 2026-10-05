# /gps release

**When:** the CHANGELOG's Unreleased block holds finished sessions' entries and the user wants them turned into a version. Never under `/gps auto`: a release is always the user's call.

1. `release.js`. It suggests the next version from the sessions' bump markers; relay it, `⚠️` lines included. A `❌` stops the command.
2. Ask "Release X.Y.Z?" with `AskUserQuestion`: the suggested version first, marked "(Recommended)", then the versions the other two bump levels would give (patch, minor, major). Other = a custom version.
3. `release.js --version <version>`. It renames Unreleased, bumps the version files, commits them and tags `vX.Y.Z`.
4. Ask "Push and publish?" with `AskUserQuestion`. On yes, `release.js --push`: it pushes the commit and tag, then creates the GitHub Release when the project's policy allows. On no, relay the by-hand push command from step 3's `Next:` line (`git push --follow-tags origin <branch>`).

Run it from the base branch with a clean tree; the script refuses otherwise. When it refuses, relay the hint; don't work around it.

**Example:** `/gps release`
