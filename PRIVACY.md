# Privacy

grill-plan-ship (gps) is a Claude Code and Codex plugin made of a skill and local Node.js scripts. It has no plugin-owned server, account or telemetry.

## What it collects

The plugin contains no analytics, tracking or update checks and sends no data to its author. Optional integrations transmit the data described below.

## What it reads and writes on your machine

- **Your project:** gps writes its session files under `.work/` and run artifacts under `.scratch/` in the project you use it in, and adds a few lines to the project's `.gitignore`. `/gps finish` writes the session's changelog entry as a fragment, `.work/changelog/<session-id>.md`, and `/gps release` rewrites the project's `CHANGELOG.md` (or the file `changelog.path` names) and the version files (such as `package.json`), and deletes the fragments. It reads the project's files and git history when a command needs them.
- **Your git history:** besides the ticket and `chore(gps)` commits, the changelog fragment is committed with the session record at `/gps finish`, and the release (CHANGELOG, version files and fragment deletions) as `chore(release): X.Y.Z` with an annotated tag `vX.Y.Z` at `/gps release`.
- **Nothing else:** outside your project, gps reads only a file a command is explicitly given (such as the review for `/gps scout --from`, which it archives under `.work/`). It doesn't read host transcripts or your home directory. Jev reads `TYPESAFE_API_KEY` from the environment for authentication.
- **Temporary files:** a pull request, issue or GitHub Release body is written to a temporary file in your system's temp directory for `gh` to read, and deleted right after. When `gh release create` fails, its notes file is kept there so the printed by-hand command can use it; delete it once the release is published.

## What leaves your machine

Git and GitHub traffic uses the `origin` your project already uses. Optional Jev traffic goes to TypeSafe as described below.

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

When Jev is enabled and `TYPESAFE_API_KEY` is present, planning sends drafted ticket names and complete bodies, plus model/effort classification instructions, to TypeSafe at `https://api.typesafe.ai/v1/systemone`. The key authenticates the request. This code does not upload arbitrary repository files, but ticket bodies can contain project details or code included during drafting. This policy makes no guarantees about TypeSafe's retention or training practices.

Initial project configuration derives `jev.enabled` from key presence. Subsequent calls consult the saved flag and the key. Set `jev.enabled` to `false` in `.work/gps-config.json` to stop Jev requests. `/gps config --rescan` can propose changing that flag; applying the rescan can enable it again when the key is present. Activation behavior is unchanged.

Your conversation is governed by the selected host's terms and privacy policy: Anthropic for Claude Code, OpenAI for Codex. Claude Code's `allowed-tools` declarations preapprove script commands in that host; Codex applies its own configured sandbox and approval rules.

## Contact

Questions or concerns: [open an issue](https://github.com/rtonneau/grill-plan-ship/issues).
