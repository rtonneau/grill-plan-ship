# 0008: Scouted ideas are called seeds

_Recorded 2026-10-21, version 2.8.6._

## Context

`/gps scout` turns an architecture review into candidates for `/gps start`, and until now gps called each candidate an "idea" throughout: in prose, in `--json` fields (`ideas`, `ideasProblem` on `clean.js` and `status.js`), and in the on-disk `.pending-seeds.json` file's surrounding text. This repo was about to gain a second, independent skill, `skills/idea/`, whose whole subject is an **Idea**: a piece of future work, written down, not yet started. The same word for two different things in the same plugin — gps's scouted candidate and the new skill's backlog entry — would make every mention of "idea" ambiguous in docs, in chat, and in `--json` output read by either skill.

## Decision

Rename gps's scouted candidates from "idea(s)" to "seed(s)", everywhere: prose in `scout.md`, `clean.js`, `status.js` and their references, and the `--json` fields (`ideas` -> `seeds`, `ideasProblem` -> `seedsProblem`). This matches the on-disk store, already named `seeds-store.js` and `.pending-seeds.json` before the rename, so the code and the words it prints now agree. "Idea" is freed for the `idea` skill's own, unrelated meaning.

## Alternatives rejected

- **Rename the new skill's "Idea" instead:** the dotfiles tool this skill is ported from already used "Idea" throughout its own docs and file format; renaming it would mean translating an established vocabulary for no reason other than gps claiming the word first.
- **Keep "idea" in gps and disambiguate by context:** every doc, chat message and `--json` consumer would need to track which "idea" is meant; the two skills are independent and a reader of one has no reason to know the other's convention.

## Consequences

- `clean.js --json` and `status.js --json` consumers must read `seeds`/`seedsProblem` instead of `ideas`/`ideasProblem`; called out in the CHANGELOG as a breaking field rename.
- `.pending-seeds.json` and `seeds-store.js` needed no change: the rename brought gps's prose in line with names that were already there.
- New gps text about `/gps scout` says "seed(s)"; "idea" in gps's own docs refers only to the separate `idea` skill from here on.
