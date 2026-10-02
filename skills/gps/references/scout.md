# /gps scout [--from <review-file>] [direction]

**When:** you want the codebase, or an existing review, to suggest what to build next.

**Without `--from`:**
1. Call the first available of `improve-codebase-architecture`, `mattpocock-skills:codebase-design` (neither: tell the user to install `mattpocock-skills`), passing `[direction]` verbatim. Follow its steps 1 (explore) and 2 (HTML report) only; skip its grilling loop.
2. Turn every candidate card into an entry, write `{ "sourceDirection": <direction or null>, "candidates": [...] }` to a temp JSON file, then `scout-merge.js <report.html> <entries.json>`.

**With `--from <review-file>`** (no architecture skill, no HTML report):
1. Read the review. Unreadable: stop and say so; never guess its content.
2. One entry per future session: group findings that touch the same files or share a fix (follow the review's own grouping; `[direction]` may ask for one per finding, or filter). Start `problem` with the finding IDs it covers; `severity` is the highest grouped severity in the review's words (leave it out without a scale); `strength` follows the review's certainty; `files` are the paths it names; open decisions go into `problem` or `solution`.
3. Write the JSON as above, then `scout-merge.js --from <review-file> <entries.json>`.

**Entry fields:** `slug` (the future `/gps start` argument), `strength` (`Strong`, `Worth exploring` or `Speculative`), `problem`, `solution`; optional `files`, `benefits`, `severity`. The script validates every entry: on `❌`, fix the JSON and run it again.

Relay its list of `/gps start <slug>` lines.

**Examples:** `/gps scout only review sim.cc` · `/gps scout --from docs/review.md only Critical and High`
