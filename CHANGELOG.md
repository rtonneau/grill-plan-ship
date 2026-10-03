# Changelog

All notable changes to grill-plan-ship. Versions follow [semantic versioning](https://semver.org/).

## 2.3.2

- The skill pre-approves each script by name in `allowed-tools` instead of a wildcard over `scripts/`, so it runs exactly gps's own scripts without a permission prompt and nothing else.
- The icon and the workflow diagram ship as PNGs only; their SVG sources moved to the `design-sources` branch.
- Token usage is no longer reported: gps stops reading Claude Code's transcripts under `~/.claude/projects/`, so it reads nothing outside your project. Phase files and commit logs no longer get a Token Usage section, and an existing one is dropped the next time a script rewrites the file.

## 2.3.1

- Ready for the Claude plugin directory: listing metadata in `plugin.json` (display name, a small-planet GPS icon, documentation, support and privacy links), `PRIVACY.md`, and a README section on everything gps runs, writes and sends.
- The developer notes moved from `CLAUDE.md` to `.claude/CLAUDE.md`, so `claude plugin validate --strict` passes.

## 2.3.0

- `/gps help`: where you are, what to run next, the workflow on one screen, and any command explained.
- `/gps init`: optional first-run setup. It checks the project (git, GitHub, helper skills) and commits gps's `.gitignore` entries and config on their own, and can remove a `.work/` ignore line left by an older version.

## 2.2.0

- `.work/` is committed as the session record, each time in its own `chore(gps)` commit: at the plan write, after each ticket and at `/gps finish`. Per-machine files stay git-ignored.
- `/gps finish` commits the final record and pushes it before switching back to the base branch.
- A session committed on a branch that isn't checked out is reported with the branch to switch to.

## 2.1.0

- Built-in grill when neither `grill-with-docs` nor `brainstorming` is installed, with a project glossary and ADRs in `.work/`.
- `/gps ship` remembers the ship mode per session.
- Scripts are pre-approved for the skill, so they run without a permission prompt.

## 2.0.0

- Script-first rewrite: every deterministic step (session state, templates, validation, git and gh calls) is a Node.js script; the skill keeps only the judgment steps.
- `/gps auto` (with `--delegate`), `/gps clean`, `/gps config`, issue sessions, ship modes and per-ticket model hints.
