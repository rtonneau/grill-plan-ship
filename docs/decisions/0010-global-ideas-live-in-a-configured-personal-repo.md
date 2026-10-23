# 0010: Global Ideas live in a configured personal repo

_Recorded 2026-10-21, version 2.8.6._

## Context

The idea backlog distinguishes Project Ideas (tied to the repo being worked on, stored in its own `.work/idea/`) from Global Ideas (not tied to any one repo). In the personal-dotfiles tool this skill is ported from, Global scope was found by walking up the filesystem from the script's own directory (`findDotfilesRoot(__dirname)`) until it found the tool's own `SKILL.md`, then using that checkout's `.work/idea/global/` — not from the current working directory. That distinction, code location versus cwd, is exactly why the old mechanism broke once distributed as a plugin: it only works when the skill's *code* lives inside the user's own perpetual repo, which was true by construction in dotfiles (the skill and the user's personal notes were the same checkout). Shipped as a plugin, `__dirname` resolves inside a plugin install directory instead, which is not the user's repo and may not even be writable or persistent across updates; walking up from it finds nothing usable.

## Decision

Global Ideas live in a personal git repository the user names once, independent of where the skill's code is installed. `idea-config.js --set-global-root <path>` validates `<path>` (an existing directory that is a git repository) and remembers it in a small per-user file, `~/.gps/idea-config.json` (overridable via `GPS_IDEA_CONFIG_PATH`, a test hook only), read and written by `lib/scope.js`. A Global Idea is then stored at `<configured-root>/.work/idea/global/<slug>.md`, committed in that repo like any other idea-skill write. `idea-resolve.js` and `idea-find.js` read the configured root but never stop when none is configured: they report the Global side as empty or unavailable, since looking something up should not require Global to be set up. Only `idea-save.js`'s `--global` path, which would otherwise write somewhere unconfigured, stops and points at `idea-config.js --set-global-root <path>` instead of guessing a location.

## Alternatives rejected

- **Keep walking up from the skill's install directory:** would work only for a from-source checkout, not a marketplace-installed plugin, and would silently do the wrong thing (or nothing) the moment the skill is installed the normal way.
- **Store Global Ideas outside any git repo (e.g. directly under `~/.gps/`):** loses the Changelog-via-git-commit behavior every other Idea save relies on, and gives the user no way to sync, back up or review Global Ideas with tools they already use for everything else.
- **Infer a default personal repo (e.g. the user's dotfiles, if found):** different users keep personal notes in different repos under different names; guessing one risks writing into the wrong repo silently.

## Consequences

- A first-time `--global` save (or `/idea config` with no prior setup) needs one explicit one-time step, `idea-config.js --set-global-root <path>`, before any Global Idea can be captured, started, planned, reviewed, promoted or dropped.
- Existing dotfiles users moving to the plugin version must run that same command once, pointed at the repo their old Global Ideas already lived in, to keep using them; nothing migrates automatically.
- The configured root is per-user and per-machine (a plain file under the user's home directory, not committed anywhere), so each machine a user works from needs its own `--set-global-root` call.
