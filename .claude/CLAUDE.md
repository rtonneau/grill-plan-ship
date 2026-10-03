# grill-plan-ship

**Universal workflow plugin for Claude Code:** grill → plan → ship → finish. User docs: `README.md`.

## Principle

The LLM does judgment only: questioning (grill), planning, reviewing and summarizing. Every deterministic step (validation, file generation, templating, session state, git and gh calls, report formatting) is a script. If it can be a script, it must be one; the references then call it in one line.

## Layout

```
.claude-plugin/            plugin.json, marketplace.json (keep their versions equal to package.json)
skills/gps/
├── SKILL.md               router only: command table, script contract, shared rules (< 100 lines; CI fails > 200)
├── references/<cmd>.md    one short file per command: judgment steps + one-line script calls
├── scripts/<name>.js      one script per deterministic step
│   └── lib/               shared helpers; cli.js is the script contract
└── assets/                markdown templates only
tests/                     <script>.test.js per script, lib/<lib>.test.js per lib, e2e, github-flow, skill
docs/                      icon.png (listing icon) and gps-workflow.png (README diagram), rendered from the
                           SVG sources on the design-sources branch; no SVG on main (the plugin directory holds them)
```

Commands: init, scout, start (`--issue`), status, clean, config, write, plan, ship (`[N]`), finish, auto, handoff, help.

## Rules for scripts

- Entry point is `main({ usage, positionals, options, run })` from `lib/cli.js`; `run` returns `{ text, data }`. Never print to stdout yourself, and never call `process.exit`.
- One purpose per script, explicit args, no hidden state. Validate input and throw `UsageError` (exit 2) or `GpsError(message, hint)` (exit 1); warnings go through `warn()`.
- `text` is relayed to the user as is; end it with a `Next:` line when there is an obvious next command. `--json` prints `data`.
- Shared logic goes in `lib/`: check it before adding a helper. Git calls live in `lib/git.js`, gh calls in `lib/github.js`, always via `execFileSync` with an argument array.
- Use only Node.js built-ins. Write JSON with `writeJsonAtomic`. Record each state change with `recordEvent` (`lib/history.js`) after the files are written.
- Scripts never overwrite work: they refuse (changing nothing) or resume.

## Rules for SKILL.md and references

- SKILL.md has no procedures (no numbered steps); it routes to `references/<command>.md`.
- In references, `<name>.js` means `node ${CLAUDE_SKILL_DIR}/scripts/<name>.js` (Claude Code substitutes the braced variable in SKILL.md and in `allowed-tools`, which pre-approves each script by name: a new script needs its own `allowed-tools` line, checked by `tests/skill.test.js`). Keep each file short (≤ 40 lines, checked by `tests/skill.test.js`) and leave procedure that can be scripted to a script.
- `tests/skill.test.js` checks the router, sizes, script names, one test per script, and that every asset is used.

## Testing

```powershell
npm test                                  # all tests (node --test over tests/**/*.test.js)
node tests/start.test.js                  # one file
node tests/check-skill-size.js --max 200  # the CI size check
```

Tests run real scripts in throwaway directories (`tests/helpers.js`), and drive sessions through the scripts, never by writing session state by hand. The GitHub flow uses a stub `gh` (`GPS_GH_BIN`) and a local bare repo.

## Session files

`.work/sessions/YYYY-MM-DD__<slug>/`: `01-grill/resume.md`, `02-plan/plan.md` + `tickets/NN-<slug>.md`, `03-implement/NN-<slug>/commit-log.md`, `HANDOFF.md`, `INDEX.md`, `.session-config.json` (history, current_phase, usage, kind, git, issue). Project-wide: `.work/gps-config.json` (`github.enabled`, read via `lib/project-config.js`, detected once, re-detected only by `/gps config --rescan`), and the built-in grill's `.work/GLOSSARY.md` and `.work/adr/NNNN-<slug>.md` (created by `domain-doc.js`, filled by Claude). `.work/` is committed (`commitWorkDir` in `lib/git.js`: plan write, each ticket, finish), each time in its own `chore(gps)` commit; only the per-machine files in `LOCAL_ONLY` (`lib/setup.js`, written by `/gps start` and `/gps init`) are git-ignored.

---

**Author:** rtonneau (Université de Namur) · **License:** MIT · **Repository:** github.com/rtonneau/grill-plan-ship
