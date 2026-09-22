# `/gps scout --from`: seed sessions from an existing review

## Problem Statement

`/gps scout` turns an architecture review into `/gps start` seeds, but only a review it runs itself: it always invokes the architecture-review skill and archives that skill's HTML report. When a review already exists — a hand-written or AI-written Markdown review such as a dotfiles audit with findings C1, H1–H3, M1–M12, L1–L6 — there is no supported way to turn it into seeds. The user has to retype each finding into brainstorming, or run `scout-merge.js` by hand, which archives the Markdown file as `architecture-review-<ts>.html`.

## Context & Constraints

- `scripts/scout-merge.js` is the only writer of `.work/sessions/.pending-seeds.json` and `.work/sessions/scout-reports/`. It calls `ingestScoutReport()` in `scripts/lib/scout-ingest.js`, which validates every candidate before writing anything, copies the report write-once (`-2`, `-3`, … on collision), and merges seeds keyed by slug.
- `scripts/start-session.js` already consumes a matching seed and prints the whole seed object, so any new seed field reaches brainstorming without changes there.
- A seed's `strength` (`Strong` / `Worth exploring` / `Speculative`) measures confidence that a change is worth doing. External reviews rank by severity (Critical / High / Medium / Low, P0 / P1, …), a different axis.
- Handlers use only Node's standard library and have no CLI flags today; errors go through `GpsError` + `runCli` (`❌ message` + hint, non-zero exit).
- `.work/` is gitignored, so archived reports are local to the machine.

## Success Metrics

- `/gps scout --from <review-file> [direction]` produces seeds from the given file without invoking any architecture-review skill, and works when `mattpocock-skills` is not installed.
- By default, related findings are grouped into one candidate per future session, following the review's own improvement plan when it has one; `[direction]` can ask for one candidate per finding or filter findings (e.g. `only Critical and High`).
- Each seed carries an optional `severity` (highest severity among its findings, in the review's own wording) alongside `strength`, and a `sourcePath` pointing at the original review.
- The review is archived byte-for-byte as `scout-reports/review-<stem>-<ts><ext>`, keeping its original extension.
- `/gps scout` without `--from` behaves exactly as before: same skill, same `architecture-review-<ts>.html` name, seeds with `severity: null` and `sourcePath: null`.
- Any invalid argument, missing/non-file review, or invalid candidate fails with `❌` + hint and writes nothing.

## Architecture & Approach

### User-facing flow (`skills/gps/SKILL.md`)

Syntax: `/gps scout --from <review-file> [direction]`. `--from` must come first and takes exactly one path (project-relative or absolute). Everything after the path is `[direction]`, passed through verbatim. Without `--from`, scout is unchanged.

In `--from` mode Claude Code:

1. Invokes no architecture-review skill and writes no HTML report; the missing-`mattpocock-skills` check does not apply.
2. Reads the review file with the Read tool. If it cannot be read, stops and reports it.
3. Synthesizes candidates with the existing required fields (`slug`, `strength`, `problem`, `solution`) and optional `files`, `benefits`, plus the new optional `severity`:
   - Group related findings into one candidate by default; follow the review's own plan or grouping when present. If `[direction]` asks for one candidate per finding, do that; `[direction]` may also filter.
   - Start each `problem` with the finding IDs it covers when the review has IDs (e.g. `C1, H1, M8, M9: …`).
   - `severity` is the highest severity among the grouped findings, in the review's wording; omit it if the review has no severity scale.
   - `strength` is Claude's confidence judgment, informed by the review's own certainty ("tested", "confirmed" → `Strong`; "plausible, verify" → `Worth exploring` or `Speculative`).
   - `files` lists the paths the review names for those findings.
   - Open decisions listed in the review go into the `problem` or `solution` of the seed they affect, so brainstorming raises them.
4. Writes `{ "sourceDirection": "<direction>" | null, "candidates": [ ... ] }` to a temp JSON file and runs `node $CLAUDE_PLUGIN_ROOT/scripts/scout-merge.js --from <review-file> <entriesJsonPath>`.
5. Presents the summary as scout does today — slug, both badges (e.g. `Critical · Strong`, or just the strength when there is no severity), one-line problem, a `/gps start <slug>` line, and any warnings.

`/gps start` and `/gps status` need no changes.

### Handler: `scripts/scout-merge.js`

Accepted forms:

- `node scout-merge.js <tempReportPath> <entriesJsonPath>` — unchanged.
- `node scout-merge.js --from <reviewPath> <entriesJsonPath>` — new.

Anything else — an unknown `--flag`, `--from` without a path, a missing entries path, extra arguments — fails with a `GpsError` whose hint is the usage line for both forms. Parsing is hand-rolled (no dependency).

Both forms call `ingestScoutReport({ sessionsDir, reportPath, sourcePath, sourceDirection, candidates })`, with `sourcePath` set to `null` in scout form and to the review path in `--from` form.

### Library: `scripts/lib/scout-ingest.js`

- The `tempReportPath` parameter is renamed `reportPath` (callers: the handler and tests only).
- Report checks: the path must exist and be a regular file. Scout mode keeps its current "run the architecture-review step first" hint; `--from` mode uses `Review file not found: <path>` / `Not a file: <path>` with a hint to check the path relative to the project root.
- Archive name:
  - Scout mode: `architecture-review-<ts>.html` (unchanged).
  - `--from` mode: `review-<stem>-<ts><ext>`. `<stem>` is the original basename without extension, passed through `slugify()` from `scripts/lib/guard.js` (cleans to `a-z 0-9 . _ -`, cuts to 64 chars); if it cleans to nothing, `<stem>` is `file` rather than `slugify`'s `untitled-<HHMMSS>` fallback. `<ext>` is the original extension lowercased; no extension stays no extension.
  - `copyReportWriteOnce` takes the extension as a parameter; the `-2`, `-3` collision logic is unchanged.
- `sourcePath` is stored project-relative with forward slashes when the file is inside the project root (`process.cwd()`), otherwise as an absolute path.
- `validateCandidates` accepts an optional `severity`: when present it must be a string, non-empty after trim, at most 32 characters; otherwise the run fails naming the slug and the rule. Validation stays all-or-nothing.
- Each seed entry gains `severity: candidate.severity || null` and `sourcePath: sourcePath || null`, next to the existing `sourceReport`, `sourceDirection` and `createdAt`.
- Each item in the returned `seeded` array gains `severity`, so the chat summary needs no second read of the seeds file.

`seeds-store.js`, `start-session.js` and `status.js` are unchanged.

### Tests

Using the existing `node --test` setup:

- `scripts/lib/scout-ingest.test.js`:
  - `--from` naming keeps the extension (`.md` → `review-<stem>-<ts>.md`); an extensionless file stays extensionless; the stem is cleaned and truncated; a stem that cleans to nothing becomes `file`; a collision gets `-2`.
  - `sourcePath` is project-relative with `/` inside the project and absolute outside it.
  - `severity` is accepted when valid; rejected when empty, whitespace-only, 33 characters, or not a string; stored as `null` when omitted.
  - The archived copy is byte-for-byte identical to the source.
  - Regression: scout mode still produces `architecture-review-<ts>.html` and seeds with `severity: null`, `sourcePath: null`.
- `scripts/handlers.test.js`: runs `scout-merge.js` in both forms; usage errors (`--from` alone, `--bogus`, extra arguments); a missing or directory review path writes nothing (no `scout-reports/` entry, no seeds file).
- `scripts/e2e.test.js`: `scout-merge.js --from review.md` → `start-session.js <slug>`, asserting the seed is consumed and its printed JSON includes `severity` and `sourcePath`.

### Docs

- `skills/gps/SKILL.md`: `/gps scout` section documents `--from` (syntax, no-skill step, candidate rules, handler command, two-badge summary); Dependencies notes that `--from` does not need `mattpocock-skills`; the frontmatter description mentions `/gps scout --from`.
- `README.md` and `docs/TUTORIAL.md`: a short "start from an existing review" example based on the dotfiles review.
- `CLAUDE.md`: unchanged (its command list does not cover scout today; fixing that is out of scope).

## Assumptions & Trade-offs

- **Extend scout rather than add `/gps seed`.** One "produce candidates" command, at the cost of `scout` covering two flows. Chosen by the user.
- **CLI flag rather than a field in the entries JSON.** Makes the mode explicit on the command line; costs a small hand-rolled parser in a handler that had no flags.
- **Severity is free-form (≤ 32 chars), not an enum.** Reviews use different scales; the seed only carries the value to brainstorming. No ordering or filtering is done on it by code.
- **Copy plus `sourcePath`, not reference-in-place.** Seeds describe the review as it was when seeded (write-once, like scout); `sourcePath` keeps the link to the living document. The copy is local because `.work/` is gitignored.
- **Grouping is Claude's judgment, not code.** There is no parser for review formats; any readable text file works, and the quality of grouping depends on the review's structure.

## Open Questions

None.

## Notes

- Motivating example: a dotfiles review (2026-09-22) with ~20 findings and an improvement plan, expected to yield about six seeds such as `safe-bootstrap-linking` (C1, H1, M8, M9; severity `Critical`).
