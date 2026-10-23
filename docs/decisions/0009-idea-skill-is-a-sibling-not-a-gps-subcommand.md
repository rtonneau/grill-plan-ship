# 0009: The idea skill is a sibling skill, not a gps subcommand

_Recorded 2026-10-21, version 2.8.6._

## Context

The idea backlog (capture, start, plan, review, promote, drop, list, config: 8 verbs) was ported from a personal-dotfiles tool into this plugin. gps's own router, `tests/skill.test.js`, fixes `/gps` to single-word subcommands, each with its own short `references/<cmd>.md` file (≤ 40 lines) and a script contract shared by every script under `skills/gps/scripts/`. The idea backlog's verbs are not that shallow: `/idea start` and `/idea promote` run a full grill with save checks, scope resolution (Project vs. Global) and a collision prompt, deeper than any single gps subcommand's reference file. Folding them into `/gps <verb>` would mean either stretching gps's reference-file and router conventions to fit a second, unrelated domain, or special-casing the idea verbs inside gps's own structural test.

## Decision

Ship the idea backlog as a second, independent skill, `skills/idea/`, inside the same plugin, with its own `SKILL.md` router, `references/<cmd>.md` files, `scripts/<name>.js` action scripts and `scripts/lib/` helpers — the same shape as `skills/gps/`, but not a part of it. `/idea <verb>` is invoked directly, never through `/gps`.

## Alternatives rejected

- **Add the 8 verbs as `/gps idea <verb>` subcommands:** keeps one router, but `tests/skill.test.js`'s single-word command and 40-line reference-file assumptions would both need loosening, weakening the check for gps's own commands too.
- **Merge the two skills' shared logic first, then add idea on top:** cross-skill imports between `skills/gps/scripts/lib/` and a new `skills/idea/scripts/lib/` would couple two independently-evolving domains (sessions/tickets vs. a personal backlog) through shared code neither owns outright.

## Consequences

- Two routers (`skills/gps/SKILL.md`, `skills/idea/SKILL.md`) and two structural tests (`tests/skill.test.js`, `tests/idea/skill.test.js`), each checking its own skill's router, reference sizes and script names.
- Small `lib/cli.js`-style plumbing (argument parsing, `--json`, exit codes, usage errors) is duplicated between `skills/gps/scripts/lib/cli.js` and `skills/idea/scripts/lib/cli.js` rather than shared, since the two skills ship and version independently and neither should block the other's change to its own contract.
- A user who wants backlog work to become a gps session runs `/idea promote <slug>`, which itself invokes `/gps start <slug>` and seeds its grill — the one integration point between the two skills, kept one-directional (idea calls into gps, not the reverse).
