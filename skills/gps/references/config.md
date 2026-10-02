# /gps config [--rescan]

**When:** checking the project's GitHub flag (`.work/gps-config.json`), or refreshing it after the project gained a github.com `origin` or a `gh auth login`. Detection otherwise runs once, when the file is created.

- `/gps config`: `config.js`, relay it.
- `/gps config --rescan`: `config.js --rescan`. If it reports a difference, show the user the old and new value, its reason and warnings, and ask with `AskUserQuestion` whether to apply it. Only on yes: `config.js --rescan --apply`.

The flag applies to sessions whose plan is not saved yet; the others keep their mode.

**Examples:** `/gps config` · `/gps config --rescan`
