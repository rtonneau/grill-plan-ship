# Privacy

grill-plan-ship (gps) is a Claude Code plugin made of a skill and local Node.js scripts. It has no server, no account and no telemetry.

## What it collects

Nothing. The plugin sends no data to its author or to any third party, and it contains no analytics, tracking or update checks.

## What it reads and writes on your machine

- **Your project:** gps writes its session files under `.work/` and run artifacts under `.scratch/` in the project you use it in, and adds a few lines to the project's `.gitignore`. `/gps finish` writes the session's entry in the project's `CHANGELOG.md` (or the file `changelog.path` names), and `/gps release` rewrites that file and the version files (such as `package.json`). It reads the project's files and git history when a command needs them.
- **Your git history:** besides the ticket and `chore(gps)` commits, gps commits the CHANGELOG entry as `docs(changelog): <feature>` at `/gps finish`, and the release as `chore(release): X.Y.Z` with an annotated tag `vX.Y.Z` at `/gps release`.
- **Nothing else:** outside your project, gps reads only a file a command is explicitly given (such as the review for `/gps scout --from`, which it archives under `.work/`). It doesn't read Claude Code's transcripts, your home directory or your credentials.
- **Temporary files:** a pull request, issue or GitHub Release body is written to a temporary file in your system's temp directory for `gh` to read, and deleted right after. When `gh release create` fails, its notes file is kept there so the printed by-hand command can use it; delete it once the release is published.

## What leaves your machine

Only what you would send yourself with `git` and the GitHub CLI (`gh`), to the `origin` your project already uses.

With any `origin` (GitHub or not), at `/gps release` only:

- `git fetch` of the base branch before a release is cut, to check it is up to date;
- `git push` of the release commit and its tag at `/gps release --push`, after your yes;
- `git ls-remote`, which only reads, to tell whether that push already happened.

Only on GitHub projects (an `origin` on github.com with `gh` logged in):

- `git push` of the session branch at `/gps finish`;
- `gh pr create` for the session's pull request, and `gh pr list` to find one already open;
- `gh issue create`, `gh issue comment` and `gh issue close` for `/gps start --issue` sessions;
- `gh release view` and `gh release create` at `/gps release --push`, when `release.githubRelease` allows a GitHub Release;
- `gh auth status`, to detect whether the project uses GitHub.

These run with your own git and gh credentials, which gps never reads. The [README](README.md#what-gps-runs-writes-and-sends) lists every command and when it runs.

Your conversation with Claude is governed by Anthropic's terms and privacy policy, not by this plugin.

## Contact

Questions or concerns: [open an issue](https://github.com/rtonneau/grill-plan-ship/issues).
