# /gps config [--rescan|--enable-jev]

**When:** checking the project's settings (`.work/gps-config.json`), or refreshing the GitHub flag after the project gained a github.com `origin` or a `gh auth login`. Detection otherwise runs once, when the file is created.

- `/gps config`: `config.js`, relay it.
- `/gps config --rescan`: `config.js --rescan`. If it reports a difference, show the old and new value, its reason and warnings, and ask using the host question rule whether to apply it. Only on yes: `config.js --rescan --apply`.
- `/gps config --enable-jev`: `config.js --enable-jev`. This explicitly authorizes sending complete drafted ticket names and bodies to TypeSafe (`https://api.typesafe.ai/v1/systemone`), using `TYPESAFE_API_KEY`. Explain that scope before asking when enablement was not explicitly requested. Key detection and rescans never grant consent; old auto-enabled configs need this one-time authorization. Disable by setting `jev.enabled` to false; revoke authorization with `jev.consent` false.

The flag applies to sessions whose plan is not saved yet; the others keep their mode. Codex users can pin a tier's model by hand in `delegation.codex.models`; otherwise the parent picks from its spawn tool.

**Examples:** `/gps config` · `/gps config --rescan`
