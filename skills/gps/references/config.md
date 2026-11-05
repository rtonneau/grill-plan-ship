# /gps config [--rescan]

**When:** checking the project's settings (`.work/gps-config.json`), or refreshing the GitHub flag after the project gained a github.com `origin` or a `gh auth login`. Detection otherwise runs once, when the file is created.

- `/gps config`: `config.js`, relay it.
- `/gps config --rescan`: `config.js --rescan`. If it reports a difference, show the old and new value, its reason and warnings, and ask using the host question rule whether to apply it. Only on yes: `config.js --rescan --apply`.

The flag applies to sessions whose plan is not saved yet; the others keep their mode. Codex users can pin a tier's model by hand in `delegation.codex.models`; otherwise the parent picks from its spawn tool.

**Examples:** `/gps config` · `/gps config --rescan`
