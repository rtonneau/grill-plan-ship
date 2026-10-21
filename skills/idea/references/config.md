# /idea config [--set-global-root <path>]

**When:** before the first Global Idea, or to change which personal repo holds them. Global Ideas have no repo of their own; this names the personal git repo whose `.work/idea/global/` holds them, remembered per user, not per project.

1. Bare `/idea config`: run `idea-config.js`, relay its line (`global root: <path>` or `global root: not configured`).
2. `/idea config --set-global-root <path>`: run `idea-config.js --set-global-root <path>`, relay its confirmation (`global root set to <path>`) or its `❌` and hint, unchanged.

**Examples:** `/idea config` · `/idea config --set-global-root ~/notes`
