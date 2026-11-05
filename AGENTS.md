# grill-plan-ship

Shared workflow plugin for Claude Code and Codex. User docs: `README.md`. Design and audit: `docs/ARCHITECTURE.md`. Host evidence: `docs/COMPATIBILITY.md`.

## Principle

The agent does judgment: questioning, planning, implementing, reviewing, recovering. Whatever must be exact (session state, write transactions, templating, git and gh calls, changelog, release) is a script; the references call it in one line. Native host capabilities come first. A new script needs a reason beyond "it can be scripted": state integrity, a transaction, reproducibility or safety.

## Layout

```
plugin.json               portable manifest (Codex); version equals package.json
.claude-plugin/           plugin.json, marketplace.json; versions equal package.json
skills/gps/
├── SKILL.md              router: command table, script contract, autonomy and state rules (< 100 lines; CI fails > 200)
├── references/<cmd>.md   one short file per command: judgment steps + one-line script calls (≤ 40 lines)
├── scripts/<name>.js     one script per deterministic step; lib/ holds shared helpers, lib/cli.js the contract
└── assets/               markdown templates only
skills/idea/              Idea backlog skill, same shape, independent (decision 0009)
docs/decisions/NNNN-*.md  design decisions with their reasons
docs/WORK-DIR.md          contract for other skills sharing .work/ (names every GPS_WORK_PATHS entry)
tests/                    <script>.test.js per script, lib/<lib>.test.js per lib, e2e, adaptive-flow, github-flow, skill
```

The icon and diagram in `docs/` are PNGs rendered from SVG sources on the `design-sources` branch; no SVG on main.

Decisions worth knowing before changing behavior: 0001 effort hints stop at xhigh; 0002 gps commits only its own `.work/` paths; 0003 changelog fragments, version set only by `/gps release`; 0004 Claude hints stay family-level; 0011 a full ship chains a finish that asks nothing; 0012 session state files are committed, only `.scratch/` is ignored; 0013 the size of the work sets the process; 0014 one brief, the parent commits, the host resolves models.

## Rules for scripts

- Entry point is `main({ usage, positionals, options, run })` from `lib/cli.js`; `run` returns `{ text, data }`. Never print to stdout yourself or call `process.exit`.
- One purpose per script, explicit args, no hidden state. Throw `UsageError` (exit 2) or `GpsError(message, hint)` (exit 1); warnings go through `warn()`.
- `text` is relayed as is; end it with a `Next:` line when there is an obvious next command. `--json` prints `data`.
- Check `lib/` before adding a helper. Git calls live in `lib/git.js`, gh calls in `lib/github.js`, always `execFileSync` with an argument array.
- Node.js built-ins only. Write JSON with `writeJsonAtomic`. Record each state change with `recordEvent` after the files are written.
- Scripts refuse or resume; they never overwrite work.
- CommonJS, two-space indentation, single quotes, semicolons, camelCase, kebab-case filenames.

## Rules for SKILL.md and references

- SKILL.md has no numbered steps; it routes to `references/<command>.md`.
- In references, `<name>.js` means the script in the skill's `scripts/`. `allowed-tools` pre-approves each script by name: a new script needs its own line (`tests/skill.test.js` checks this).
- State the behavior wanted, in the fewest words that change what the agent does. A line that restates the default gets deleted.
- Keep Codex in mind: no Claude-only tool in a reference, and translate `/gps` to `$gps` through the router's rule.
- A change to how hosts behave needs evidence in `docs/COMPATIBILITY.md`, labeled live, schema, docs or fixture.

## Testing

```powershell
npm test                                  # all tests/**/*.test.js
node tests/start.test.js                  # one file
node tests/check-skill-size.js --max 200  # the CI size check
claude plugin validate .                  # the manifest
```

Tests run real scripts in throwaway directories (`tests/helpers.js`) and drive sessions through the scripts, never by writing session state by hand, except to simulate state from an older version. The GitHub flow uses a stub `gh` (`GPS_GH_BIN`) and a local bare repo. Passing tests don't prove host compatibility: when a host-facing change matters, run it live in a disposable repo.

## Session files

`.work/sessions/YYYY-MM-DD__<slug>/`: `01-grill/resume.md`, `02-plan/plan.md` + `tickets/NN-<slug>.md`, `03-implement/NN-<slug>/commit-log.md`, `HANDOFF.md`, `INDEX.md`, `.session-config.json` (history, current_phase, kind, git, issue, ship_mode). Project-wide: `.work/gps-config.json`, `.work/changelog/<session-id>.md`, and the glossary and ADRs located by `domain-doc.js`. `.work/` is committed by `commitWorkDir` in its own `chore(gps)` commits holding only `GPS_WORK_PATHS`; a new gps path goes in that constant and in `docs/WORK-DIR.md`. Only `.scratch/` is git-ignored (`LOCAL_ONLY` in `lib/setup.js`). When state changes shape, read the old form and cover it with a regression test.

## Commits and PRs

Conventional Commit prefixes (`refactor:`, `docs:`, `chore(gps):`); releases are `chore(release): <version>`. PR descriptions explain the behavior change and report validation. Record architectural decisions in `docs/decisions/`.

---

**Author:** rtonneau (Université de Namur) · **License:** MIT · **Repository:** github.com/rtonneau/grill-plan-ship
