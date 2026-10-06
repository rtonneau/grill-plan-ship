# Changelog

All notable changes to grill-plan-ship. Versions follow [semantic versioning](https://semver.org/).

## Unreleased

## 2.6.0

- **Automatic CHANGELOG.** `/gps finish` now starts by writing the session's changelog entry as a fragment, `.work/changelog/<session-id>.md`.
  - Claude drafts the user-facing bullets and picks the bump; it can't go below the floor the commit types imply, and going higher needs a reason.
  - The fragment is its own file and `CHANGELOG.md` is left alone, so parallel sessions never claim the same version and never conflict. It travels in the `chore(gps): finish` record commit, so the pull request shows it.
  - INDEX.md and the finish output record the bump.
  - `changelog.enabled` and `changelog.path` in `.work/gps-config.json` turn it off or move it.
- **`/gps release`.** Turns the fragments (and any hand-written `## Unreleased` bullets) into a version: it suggests one from the fragments' bumps, writes `## X.Y.Z (date)`, bumps the version files, commits the CHANGELOG, the version files and the fragment deletions as one `chore(release)` commit and tags. An invalid fragment is refused by name. A second question pushes the commit and tag and creates the GitHub Release (`release.githubRelease`: `none`, `minor+`, `all`). It never runs under `/gps auto`.
- **`/gps config` and `/gps help`** show the new settings and the new command.
- **Decision 0003.** Why sessions write changelog fragments and only `/gps release` sets the version: see [docs/decisions/0003-changelog-unreleased-then-release.md](docs/decisions/0003-changelog-unreleased-then-release.md).

## 2.5.1

- **`/gps auto` recommends subagent + inline follow-up.** When it asks the ship mode, it puts subagent + inline follow-up first as "(Recommended)", whatever the last ship mode was: each ticket's diff is reviewed and the Verification Step re-run in the session before it is committed. `/gps ship` still recommends the last mode used.
- **README: no parallel tickets.** It now states that no ship mode runs tickets in parallel: both subagent modes dispatch one subagent per ticket, and the next starts only after the previous ticket is committed.

## 2.5.0

- **Shared `.work/`.** gps now commits only its own paths in `.work/`: `gps-config.json`, `GLOSSARY.md`, `adr/` and `sessions/`. It used to commit everything there, so files another skill kept in `.work/` ended up in gps's `chore(gps)` commits. Other skills can now keep their files in `.work/<skill-name>/` and commit them themselves. [docs/WORK-DIR.md](docs/WORK-DIR.md) says what they may read, where they may write, and what gps promises in return.
- **What other skills can rely on.** The contract names four `.session-config.json` fields that gps keeps stable between versions: `feature_name`, `kind`, `git.branch` and `current_phase`. It also says when each one can be missing or out of date.
- **gps's record commit is more robust:**
  - A tracked `.work/` path that the user later git-ignores is still updated, instead of failing the whole commit.
  - gps never runs `git commit` without naming the paths to commit, so it can't take the whole index by mistake.
- **Decision 0002.** Why gps lists the paths it owns instead of committing all of `.work/`: see [docs/decisions/0002-gps-commits-only-its-own-work-paths.md](docs/decisions/0002-gps-commits-only-its-own-work-paths.md).

## 2.4.0

- **Effort hints.** `/gps plan` gives each ticket an `**Effort:**` line (`low`, `medium`, `high`, `xhigh` or `inherit`) beside its `**Model:**` line. In the subagent ship modes, `dispatch-prompt.js` sends the ticket to the subagent for that level (new `agents/gps-ticket-low|medium|high|xhigh.md`, each setting `effort:`), with the model on the call. `--effort` overrides a hint, `/gps ship` shows and confirms `<model>/<effort>` per ticket, and `/gps auto --delegate` takes them as drafted. Inline mode ignores them.
- **Decision: no `max`.** Effort hints stop at `xhigh`. `max` is slow and costly for one small ticket, so `/gps write` refuses it (split the ticket, or run it inline under `/effort max`), `--effort max` is a usage error, and a hand-edited `max` runs as `inherit` with a warning. See [docs/decisions/0001-effort-hints-stop-at-xhigh.md](docs/decisions/0001-effort-hints-stop-at-xhigh.md).
- **Fix: the built-in grill uses the project's own domain docs.** It always created `.work/GLOSSARY.md` and `.work/adr/`, even in a project that already keeps a glossary the mattpocock-skills way, which left a parallel copy. `domain-doc.js` now uses a root `GLOSSARY.md`, or a `CONTEXT.md` that reads like a glossary (its name before mattpocock-skills renamed it), points at a `GLOSSARY-MAP.md` / `CONTEXT-MAP.md` instead of creating anything, and numbers ADRs in `docs/adr/` when it exists. New `domain-doc.js where` shows which are in use and flags a `.work/` copy that duplicates them; the grill runs it first.

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
