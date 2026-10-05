# /gps release

**When:** the CHANGELOG's Unreleased block holds finished sessions' entries and the user wants them turned into a version. Never under `/gps auto`: a release is always the user's call.

1. `release.js`. It suggests the next version from the sessions' bump markers; relay it, `⚠️` lines included. A `❌` stops the command.
2. Ask "Release X.Y.Z?" with `AskUserQuestion`: the suggested version first, marked "(Recommended)", then the versions the other two bump levels would give (patch, minor, major). Other = a custom version.
3. `release.js --version <version>`. It renames Unreleased, bumps the version files, commits them and tags `vX.Y.Z`.
4. Ask "Push and publish?" with `AskUserQuestion`. On yes, `release.js --push`. On no, relay the commands to push by hand (`git push --follow-tags`).

Run it from the base branch with a clean tree; the script refuses otherwise. When it refuses, relay the hint; don't work around it.

**Example:** `/gps release`
