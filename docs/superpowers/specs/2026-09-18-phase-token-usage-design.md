# Phase token-usage reporting

## Problem Statement

`grill-plan-ship` sessions produce a paper trail (`01-grill/resume.md`, `02-plan/plan.md`, `03-implement/NN-*/commit-log.md`) but no record of how expensive each phase was. There's no way to look back at a session and see how many tokens the grill conversation, the planning conversation, or a given ticket's implementation actually consumed — useful for judging whether a phase was efficient, comparing tickets, or noticing a phase that ballooned.

## Context & Constraints

- `grill-plan-ship` handlers never talk to the model — they only do mechanical file/state work (`fs` only, per this repo's `CLAUDE.md`, no external dependencies). All prose in output files is synthesized by Claude Code itself when `/gps write` or `/gps ship` runs.
- Claude Code writes a JSONL transcript per session to `~/.claude/projects/<mangled-cwd>/<session-id>.jsonl`. Every assistant turn's `usage` object carries `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, and each line has a `timestamp`. This is the same data source the community tool `ccusage` reads; it is not an officially documented format and the cwd→directory-name mangling (each of `:`, `\`, `/` replaced with `-`) is inferred, not guaranteed stable across CLI versions.
- The current Claude Code session's ID is available to any child process via the `CLAUDE_CODE_SESSION_ID` environment variable.
- A phase can span more than one session ID (e.g. the user runs `/clear` mid-grill), and a single session ID's transcript can span more than one phase (e.g. grill and plan happen back-to-back without a `/clear`). Both must be handled.
- Existing phase-completion detection: `write-target.js` treats unfilled `{{ }}` placeholders in `resume.md`/`plan.md`/ticket stubs as "phase pending" (`scripts/lib/write-target.js`). Ticket completion instead uses a `**Status:** ✅ Done` line in `commit-log.md` (`scripts/lib/ticket-queue.js`), not placeholders.
- `.session-config.json` is the existing per-session state file (created by `start-session.js`), read/written by most handlers via `scripts/lib/session-store.js`.

## Success Metrics

- `01-grill/resume.md`, `02-plan/plan.md`, and every `03-implement/NN-*/commit-log.md` gain a `## Token Usage` section reporting that phase's total token consumption once the phase is written/finalized.
- The number reflects real usage pulled from Claude Code's own transcripts, not a self-reported estimate, and correctly covers phases that span a `/clear` (multiple session IDs).
- If the transcript can't be found or parsed for any reason, the affected file still gets written successfully — usage reporting degrades to "unavailable," it never blocks or breaks a `/gps write` or `/gps ship` run.

## Architecture & Approach

### New module: `scripts/lib/token-usage.js`

Two responsibilities: recording which session(s)/timespan belong to a phase, and computing usage from the transcripts.

**Recording (`touchPhase(config, phaseKey)`):**

- `config` is the parsed `.session-config.json` object (caller reads/writes it same as today).
- `config.usage` is a map keyed by phase: `"grill"`, `"plan"`, or a ticket key `"03-<num>-<slug>"`.
- On first touch for a `phaseKey`, sets `{ startedAt: <ISO now>, sessionIds: [] }`.
- On every touch, appends `process.env.CLAUDE_CODE_SESSION_ID` to `sessionIds` if present and not already in the array (dedup, preserve order).
- No-op (doesn't throw) if `CLAUDE_CODE_SESSION_ID` is unset — `sessionIds` may end up empty, which `computeUsage` treats as "unavailable."

Callers: `start-session.js` touches `"grill"`; `write-target.js` touches whichever phase it resolves as pending, before returning; `plan.js` touches `"plan"`; `ticket.js` touches its `"03-<num>-<slug>"` key.

**Computing (`computeUsage(config, phaseKey)`):**

1. Look up `config.usage[phaseKey]`. If missing or `sessionIds` is empty → return `{ available: false }`.
2. For each `sessionId`, locate its transcript file: `path.join(os.homedir(), '.claude', 'projects', mangle(process.cwd()), sessionId + '.jsonl')`, where `mangle()` replaces each `:`, `\`, `/` with `-`. If a file doesn't exist, skip it (don't fail the whole computation).
3. Read each found file line by line (plain `fs.readFileSync` + `split('\n')`, wrapped in `try/catch` per line — malformed JSON on a line is skipped, not fatal). For lines where `type === 'assistant'` and `message.usage` exists and `timestamp >= startedAt`, accumulate `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`.
4. Return `{ available: true, input, output, cacheRead, cacheCreation, total }` where `total` sums all four. If every located file yielded zero matching lines (e.g. mangling guessed wrong and nothing matched, or all files were missing), return `{ available: false }` instead of a hollow all-zero result.
5. The whole function is wrapped so any unexpected error (permissions, unreadable home dir, etc.) is caught and turned into `{ available: false }` — this must never throw out to the calling script.

No end timestamp is recorded or needed — step 3 sums everything from `startedAt` to "now" (the transcript naturally ends at the most recent turn), so the computation is simply "run it at finalization time."

### Wiring into existing commands

- **Grill/plan (`write-target.js`):** after `resolveWriteTarget()` determines the pending target (`'grill'` or `'plan'`), call `computeUsage(config, target)` and include the result under a `tokenUsage` key in the JSON it prints. `SKILL.md`'s `/gps write` instructions gain a step: use `tokenUsage` to fill the new `## Token Usage` section in `resume.md` or `plan.md` alongside the other sections already being filled.
- **Tickets:** `ticket.js` already calls `touchPhase(config, "03-<num>-<slug>")` when scaffolding the ticket workspace. A new tiny CLI, `scripts/token-usage.js <phaseKey>`, wraps `computeUsage` for one-off use from the command line and prints JSON. `SKILL.md`'s `/gps ship` step 3 ("On success: fill in `commit-log.md`") gains a sub-step: run `node $CLAUDE_PLUGIN_ROOT/scripts/token-usage.js 03-<num>-<slug>` first and use its output to fill the ticket's `## Token Usage` section before marking Status ✅ Done.

### Template changes

All three templates gain a trailing section using the existing `{{ }}` placeholder convention (no new detection logic needed for grill/plan — `write-target.js`'s existing `hasPlaceholders()` check already treats these as "still pending" until filled):

```markdown
## Token Usage

- **Input:** {{ input tokens, or "unavailable" }}
- **Output:** {{ output tokens, or "unavailable" }}
- **Cache read:** {{ cache read tokens, or "unavailable" }}
- **Cache creation:** {{ cache creation tokens, or "unavailable" }}
- **Total:** {{ total tokens, or "unavailable" }}
```

When `tokenUsage.available` is `false`, Claude writes `unavailable` (or a one-line reason if useful, e.g. "unavailable — no session data found") into each line rather than a number.

### `.session-config.json` shape addition

```json
{
  "usage": {
    "grill": { "startedAt": "2026-09-18T09:00:00.000Z", "sessionIds": ["74a6fa29-..."] },
    "plan": { "startedAt": "2026-09-18T10:15:00.000Z", "sessionIds": ["74a6fa29-...", "351c26a5-..."] },
    "03-01-add-token-tracking": { "startedAt": "2026-09-18T11:00:00.000Z", "sessionIds": ["351c26a5-..."] }
  }
}
```

## Assumptions & Trade-offs

- Relies on an undocumented Claude Code internal (transcript file location/format). Mitigated by failing soft everywhere (`{ available: false }` / `unavailable` in the output) rather than crashing any `/gps` command. If a future CLI version changes the format, the worst case is every phase reports "unavailable" — no functional regression to the rest of the plugin.
- The reported total slightly undercounts the phase's true cost: the turn in which Claude actually writes the output file (consuming the `tokenUsage` result to fill in the section) happens after the number was computed, so that turn's own tokens aren't included. Acceptable — this is a rough accounting figure, not a billing-grade one.
- No cost/dollar estimate, only raw token counts — pricing tables would need maintenance and weren't asked for.
- No end timestamp is tracked; usage is computed as "from phase start to now" at finalization time. If a command is re-run after a phase is already finalized (e.g. `/gps write` invoked again after resume.md has no more placeholders), there's nothing pending so this doesn't apply — not a concern given existing pending-detection logic.
- Reuses one generic module/CLI for all three phase types rather than separate grill/plan/ticket implementations — the recording and computation logic is identical; only the phase key and where it's wired in differ.

## Open Questions

None outstanding — resolved during brainstorming (data source: in-repo JSONL parser, not the `ccusage` dependency; multi-session phases handled via accumulated `sessionIds`; error handling: soft-fail to "unavailable" everywhere).

## Notes

Investigated and confirmed during brainstorming: `ccusage@20.0.22` runs via `npx` in this environment and reads the same `~/.claude/projects/**/*.jsonl` transcripts this design parses directly; `CLAUDE_CODE_SESSION_ID` is confirmed present in the environment of any Claude Code child process. Building an in-repo parser instead of depending on `ccusage` keeps this repo's "no external dependencies" rule (`CLAUDE.md`) intact.
