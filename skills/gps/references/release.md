# /gps release

**When:** finished sessions left changelog fragments in `.work/changelog/` (or the CHANGELOG has hand-written Unreleased bullets) and the user wants them turned into a version. Never under `/gps auto`: a release is always the user's call.

1. `release.js`. It suggests the next version from the fragments' bumps and lists the candidates (`Candidates:` line); relay it, `⚠️` lines included. A `❌` stops the command.
2. Ask "Release X.Y.Z?" with `AskUserQuestion`: the suggested version first, marked "(Recommended)", then the other versions of the `Candidates:` line as printed (don't compute versions). Other = a custom version.
3. `release.js --version <version>`. It writes the release section into the CHANGELOG (Unreleased bullets, then the fragments), bumps the version files, deletes the fragments, commits it all and tags `vX.Y.Z`.
4. Ask "Push and publish?" with `AskUserQuestion`. On yes, `release.js --push`: it pushes the commit and tag, then creates the GitHub Release when the project's policy allows. On no, relay the by-hand push command from step 3's `Next:` line (`git push --atomic --follow-tags origin <branch>`).

Run it from the base branch, up to date with origin, with a clean tree; the script refuses otherwise. When it refuses, relay the hint; don't work around it.

**Example:** `/gps release`
