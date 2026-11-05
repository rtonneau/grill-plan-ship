---
bump: major
floor: minor
reason: Retires ship modes and dispatch flags, removes plugin agents, changes when gps asks questions
---
- **`/gps start` sizes the work.** Small changes go straight to implementation with no grill; standard work has one design approval; high-risk work also settles rollback and approves tickets.
- **Fewer questions.** `/gps ship` no longer asks for a mode or hint approval, and `/gps plan` asks for ticket approval only on high-risk work. `/gps ship --inline` and `--delegate` override the agent's per-ticket choice.
- **One delegated mode.** A child implements and verifies, then the parent reviews and commits. This works where the sandbox keeps `.git` read-only.
- **Recovery instead of stopping.** A failed ticket gets a fix or one fresh child before it is blocked and reported.
- **Models come from the host.** Claude Code passes effort on the call, so the plugin ships no agents (needs 2.1.292+). Codex picks from its own spawn tool list, and the outdated built-in model table is gone. You can still pin a tier in `delegation.codex.models`.
- **gps and idea no longer call other skills automatically.** The built-in grill runs unless you name another one.
- **Fixed: session records stopped being committed** when a global gitignore used CRLF line endings, because `.work/` looked ignored.
- **Fixed: Windows sandbox accounts could not open the repository**, because `safe.directory` was passed with backslashes.
- See `docs/MIGRATION-3.0.md`. Existing sessions, settings and backlogs keep working.
