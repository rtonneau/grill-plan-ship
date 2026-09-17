# `/gps scout` — architecture-review-to-seed bridge

## Problem Statement

`grill-plan-ship`'s workflow starts at `/gps start <feature-name>`, which needs a human to already know what feature they want. In practice, good candidates often come from an architecture review (`mattpocock-skills:improve-codebase-architecture`), which scans a codebase and produces an HTML report of deepening opportunities — but its own next step (a "grilling" deep-dive on one picked candidate) is a dead end for `/gps`: there's no bridge from "here are N candidates" to "here's a `/gps start` session for one of them."

Today, using a review's findings to kick off `/gps` requires a human to manually read the report, pick a candidate, invent a slug, run `/gps start <slug>`, and paste the candidate's description into the brainstorming conversation by hand.

## Context & Constraints

- `improve-codebase-architecture` (from the `mattpocock-skills` plugin) already accepts a free-text scope directive as its prompt argument (e.g. "only review sim.cc") and, unmodified, produces a self-contained HTML report in the OS temp dir with per-candidate cards: files, problem, solution, benefits, before/after diagram, strength badge (`Strong` / `Worth exploring` / `Speculative`), and a "Top recommendation."
- `grill-plan-ship`'s existing commands (`start`, `write`, `plan`, `ticket`, `ship`, `finish`) follow a consistent pattern: a Node script under `scripts/` does mechanical file/state work, and `SKILL.md` instructs Claude when to invoke composable skills (`brainstorming`, `writing-plans`, `unslop`) for content synthesis.
- State files live in `.work/sessions/`: `.session-config.json` per session, `.current-session` as a pointer file. Lib helpers live in `scripts/lib/*.js`, each with a co-located `*.test.js`.
- Temp-dir HTML reports are not durable — nothing stops the OS from clearing them, and there's no project-local record of what a scan found.

## Success Metrics

- Running `/gps scout [direction]` produces the same HTML report as running `improve-codebase-architecture` directly, plus a chat-printed list of ready-to-use `/gps start <slug>` commands — no manual transcription.
- Running `/gps start <slug>` for a slug that came from a scout run opens brainstorming already seeded with that candidate's problem/solution/files, with no copy-paste step.
- A scout report, once written, is never silently lost or rewritten — it's addressable from disk after the fact, and stays byte-identical from creation onward.

## Architecture & Approach

### `/gps scout [direction]`

1. Call the `improve-codebase-architecture` skill, passing `[direction]` through verbatim as its prompt argument (omitted → that skill's own git-log hot-spot inference, unchanged).
2. Follow that skill's steps 1–2 exactly as written: explore, then write + open the HTML report to the OS temp dir. Do **not** proceed to its step 3 (grilling loop) — this is the fork point.
3. Copy the temp-dir HTML file, unmodified, into `.work/sessions/scout-reports/architecture-review-<timestamp>.html`. This copy is write-once: no later command ever edits, moves, or deletes it.
4. For every candidate card in the report, synthesize a seed entry (see schema below) and merge it into `.work/sessions/.pending-seeds.json` via `scripts/lib/seeds-store.js`'s `mergeSeeds()`. A slug collision overwrites just that entry; other slugs (from other runs/directions) are untouched.
5. Print a chat summary: for each candidate, its slug, strength badge, one-line problem, and an explicit `/gps start <slug>` line to copy.

### Seeds file

`.work/sessions/.pending-seeds.json`, keyed by slug:

```json
{
  "runconfig-resolver": {
    "strength": "Strong",
    "files": ["sim.cc"],
    "problem": "...",
    "solution": "...",
    "benefits": "...",
    "sourceDirection": "only review sim.cc",
    "sourceReport": "scout-reports/architecture-review-2026-09-17T142301Z.html",
    "createdAt": "2026-09-17T14:23:01.000Z"
  }
}
```

`scripts/lib/seeds-store.js` exposes:
- `mergeSeeds(sessionsDir, newEntries)` — merge-by-key into `.pending-seeds.json`, creating the file if absent.
- `getSeed(sessionsDir, slug)` — read one entry, or `null`.
- `removeSeed(sessionsDir, slug)` — delete one entry from the JSON file only. Never touches `scout-reports/`.

### `/gps start <feature-name>` integration

`scripts/start-session.js` gains one step: after creating the session as it does today, call `getSeed(sessionsDir, slug)`.

- **Match:** print the seed's problem/solution/files/sourceReport to console output, so Claude has it in context; `SKILL.md` instructs Claude to open the brainstorming conversation already seeded with that content instead of starting from zero. Then call `removeSeed()` so the entry doesn't linger as "still pending" once acted on.
- **No match:** unchanged — plain brainstorming from zero.

Re-running `/gps start <slug>` a second time for an already-consumed slug behaves like any unseeded session (no match found) — this is expected, not an error.

### Naming

Seed entries are called **seeds**, not "specs" — `/gps start`'s argument was already `feature-name`/slug, and this repo already uses "spec" for the architectural design doc (this file). "Seed" describes what it actually is: a short starting point for a brainstorming conversation.

## Assumptions & Trade-offs

- Assumes `improve-codebase-architecture`'s HTML report structure (per-candidate: files/problem/solution/benefits/strength) stays stable enough to extract seed fields from; if that skill's report format changes, seed extraction may need to follow.
- Merge-by-slug (not wholesale overwrite) means the seeds file can accumulate entries across many scout runs; nothing currently prunes stale, never-consumed seeds. Acceptable for now — no auto-expiry, no size limit.
- `scout-reports/` is append-only and untracked by any cleanup command; `/gps finish` does not touch it. Over a long project lifetime, this directory will grow — acceptable trade-off for the immutability requirement.
- No handling for `improve-codebase-architecture` being unavailable (plugin not installed) beyond whatever error surfaces naturally when the Skill tool can't find it.

## Open Questions

None outstanding — all prior open questions were resolved during brainstorming (flow relation, output action, gps integration, skill location, seeds lifecycle, consumption behavior, report persistence).

## Notes

Prior conversation in this session: a manual architecture review of `sim.cc` (via `mattpocock-skills:improve-codebase-architecture`) in a separate project (Geant4-DNA `dnachem-min`, referencing `.claude/plan-class-based-chemistry.md`) surfaced four candidates, top recommendation being a `RunConfig` resolver extraction. That walkthrough — manually copying a candidate description into `/gps start`'s brainstorming — is exactly the friction `/gps scout` removes.
