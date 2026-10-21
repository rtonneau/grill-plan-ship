# /idea list [--all]

**When:** looking over the Backlogs. Also the recovery for a Promote cut short after `/gps write`.

1. Run `idea-list.js [--all] --json`. Relay its `⚠️` lines (Idea files it couldn't parse).
2. Show two sections, Project then Global, each headed with its Backlog directory. Within each, group the entries by status: `captured`, `grilled`, `planned`, then with `--all` `promoted` and `dropped`. One line per Idea: slug, `created`, `reviews`. An empty section says "(none)".
3. For each entry whose `gpsMatch` is not null (a gps session in this repo has its slug as `feature_name`, and the Idea isn't marked `promoted`):
   1. Run `idea-promote-check.js <gpsMatch> --json`. If `grillSaved` is false, note "gps session `<gpsMatch>` still in the grill" next to the Idea and offer nothing.
   2. Otherwise ask with `AskUserQuestion`, one Idea per call: "Mark `<slug>` promoted to `<repo>:<gpsMatch>`" or "Leave it". `<repo>` is the directory name of `gitRoot` from `idea-resolve.js --json`.
   3. To mark it: run the save checks (`references/capture.md`) with the Idea's Scope, then `idea-save.js <slug> --action promote --promoted-to "<repo>:<gpsMatch>" [--global] --json`, with `--global` for an entry of the Global section. Relay the commit.
4. Point at the next command when one stands out: `/idea start` for captured Ideas, `/idea plan` for grilled ones, `/idea promote` for planned ones.
