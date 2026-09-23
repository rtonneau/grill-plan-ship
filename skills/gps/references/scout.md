# /gps scout [--from <review-file>] [direction]

**When:** Before you know what feature to build — you want the codebase itself to suggest candidates.

**What it does:**

1. Calls the Skill tool with the architecture-review skill (first available of `improve-codebase-architecture`, `mattpocock-skills:codebase-design`; if neither exists, stop and tell the user to install `mattpocock-skills`), passing `[direction]` through verbatim as its prompt argument (e.g. `only review sim.cc`). Omit `[direction]` to let that skill infer hot spots from git history instead.
2. Follows that skill's own process for its steps 1 (Explore) and 2 (Present candidates as an HTML report) exactly as written — the same self-contained HTML report gets written to the OS temp dir and opened for you.
3. Does **not** proceed to that skill's step 3 (the grilling loop). Instead, for every candidate card in the report, Claude Code synthesizes a seed entry. Required: `slug` (lowercase `a-z 0-9`, with `-`, `_` or `.` only between them, max 64 chars — this becomes the `/gps start` argument), `strength` (exactly `Strong`, `Worth exploring` or `Speculative`), `problem`, `solution`. Optional: `files` (array of paths), `benefits`.
4. Writes `{ "sourceDirection": "<direction>" | null, "candidates": [ ... ] }` to a temp JSON file and runs `node $CLAUDE_PLUGIN_ROOT/scripts/scout-merge.js <tempReportPath> <entriesJsonPath>`, which:
   - Validates every candidate first; any invalid candidate fails the whole run before anything is written.
   - Copies the HTML report, unmodified, into `.work/sessions/scout-reports/architecture-review-<timestamp>.html` (a `-2`, `-3`, … suffix if that name exists) — this copy is write-once and is never edited or deleted by any later `/gps` command.
   - Merges the seed entries into `.work/sessions/.pending-seeds.json`, keyed by slug (a slug that already exists there gets overwritten with the fresh version; other slugs are untouched). A slug repeated within one run keeps its first occurrence, with a warning. An unreadable seeds file is moved aside to `.pending-seeds.json.corrupt-<timestamp>`, with a warning, and a fresh one is started.
   - Prints a JSON summary of what was seeded (plus any `warnings`).
5. Claude Code presents that summary in chat: each candidate's slug, strength badge, one-line problem, an explicit `/gps start <slug>` line to copy, and any warnings.

**Output:** The HTML report (temp + a permanent copy under `.work/sessions/scout-reports/`), plus a chat list of ready-to-run `/gps start <slug>` commands.

**Next:** Run `/gps start <slug>` for whichever candidate you want to pursue — if a seed matches, brainstorming opens already seeded with that candidate's problem/solution/files instead of starting from zero.

**Example:**

```
/gps scout only review sim.cc
```

## With `--from <review-file>`

**When:** A review already exists — a code review, audit or hardening report, in Markdown or any other text format — and you want its findings turned into sessions instead of retyping them.

**Syntax:** `/gps scout --from <review-file> [direction]`. `--from` comes first and takes exactly one path (relative to the project root, or absolute). Everything after it is `[direction]`, e.g. `only Critical and High` or `one candidate per finding`.

**What it does instead of steps 1–4 above:**

1. Invokes **no** architecture-review skill and writes no HTML report — `mattpocock-skills` is not needed.
2. Reads the review file with the Read tool. If it can't be read, stop and tell the user; never guess its content.
3. Synthesizes seed entries with the same fields as step 3 above, plus the optional `severity`:
   - **Group related findings into one candidate** — one candidate per future session, clustering findings that touch the same files or share a fix. If the review has its own improvement plan or grouping, follow it. If `[direction]` asks for one candidate per finding, do that instead; `[direction]` can also filter which findings count.
   - Start each `problem` with the finding IDs it covers when the review has IDs (e.g. `C1, H1, M8, M9: …`).
   - `severity`: the highest severity among the grouped findings, in the review's own words (`Critical`, `P0`, …; non-empty, max 32 characters). Omit it if the review has no severity scale.
   - `strength`: your confidence the change is worth doing, informed by the review's certainty ("tested", "confirmed" → `Strong`; "plausible, verify" → `Worth exploring` or `Speculative`).
   - `files`: the paths the review names for those findings.
   - Open decisions the review lists go into the `problem` or `solution` of the seed they affect, so brainstorming raises them.
4. Writes `{ "sourceDirection": "<direction>" | null, "candidates": [ ... ] }` to a temp JSON file and runs `node $CLAUDE_PLUGIN_ROOT/scripts/scout-merge.js --from <review-file> <entriesJsonPath>`. It validates and merges exactly as above, but archives the review byte-for-byte as `.work/sessions/scout-reports/review-<stem>-<timestamp><ext>` (original extension kept, write-once) and records `severity` and `sourcePath` (the original review's path, project-relative when inside the project) on every seed.
5. Presents the summary as in step 5 above, showing `severity · strength` as the badges (just the strength when a seed has no severity).

**Example:**

```
/gps scout --from docs/reviews/2026-09-22-dotfiles-review.md
```

## Dependency

The architecture review (plain `/gps scout` only): use the first skill available of `improve-codebase-architecture`, then `mattpocock-skills:codebase-design`. If neither is available, stop and tell the user to install the `mattpocock-skills` plugin.
