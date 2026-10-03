# Privacy

grill-plan-ship (gps) is a Claude Code plugin made of a skill and local Node.js scripts. It has no server, no account and no telemetry.

## What it collects

Nothing. The plugin sends no data to its author or to any third party, and it contains no analytics, tracking or update checks.

## What it reads and writes on your machine

- **Your project:** gps writes its session files under `.work/` and run artifacts under `.scratch/` in the project you use it in, and adds a few lines to the project's `.gitignore`. It reads the project's files and git history when a command needs them.
- **Claude Code transcripts:** to report each phase's token usage, gps reads the `usage` totals in Claude Code's own transcript files under `~/.claude/projects/` for the current project. Only the token counts are kept, in the session files; transcript content is never copied or sent anywhere.
- **Temporary files:** a pull request or issue body is written to a temporary file in your system's temp directory for `gh` to read, and deleted right after.

## What leaves your machine

Only what you would send yourself with `git` and the GitHub CLI (`gh`), to the remote your project already uses, and only on GitHub projects (an `origin` on github.com with `gh` logged in):

- `git push` of the session branch at `/gps finish`;
- `gh pr create` for the session's pull request, and `gh pr list` to find one already open;
- `gh issue create`, `gh issue comment` and `gh issue close` for `/gps start --issue` sessions;
- `gh auth status`, to detect whether the project uses GitHub.

These run with your own git and gh credentials, which gps never reads. The [README](README.md#what-gps-runs-writes-and-sends) lists every command and when it runs.

Your conversation with Claude is governed by Anthropic's terms and privacy policy, not by this plugin.

## Contact

Questions or concerns: [open an issue](https://github.com/rtonneau/grill-plan-ship/issues).
