# /gps config [--rescan]

**When:** checking the project's GitHub flag (`.work/gps-config.json`), or refreshing it after the project gained a github.com `origin` or a `gh auth login`. Detection otherwise runs once, when the file is created.

- `/gps config`: `config.js`, relay it.
- `/gps config --rescan`: `config.js --rescan`. If it reports a difference, show the user the old and new value, its reason and warnings, and ask using the router's host question rule whether to apply it. Only on yes: `config.js --rescan --apply`.

The flag applies to sessions whose plan is not saved yet; the others keep their mode.

**Examples:** `/gps config` · `/gps config --rescan`

Codex onboarding: output includes stored `delegation.codex.models` and `inheritEfforts`, labeled declared settings rather than live capability detection. Configure real available model IDs and supported levels in `.work/gps-config.json` by explicit choice; no setter or automatic mapping is provided. See `docs/CODEX-SETUP.md` in the plugin checkout.
