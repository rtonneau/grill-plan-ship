# /gps issue <title>

**When:** Reporting a problem (bug, regression, small request) you also want to work on, instead of `/gps start`. On a GitHub project the report becomes a GitHub issue.

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/issue-session.js "<title>"`

**What it does:**

1. Same setup as `/gps start`: session directory `.work/sessions/YYYY-MM-DD__<slug>/`, scratch directory, `.current-session`. `.session-config.json` gets `kind: "issue"`. **If the session already exists, it fails and changes nothing.**
2. Checks the project's GitHub flag (`.work/gps-config.json`). When it is off, the handler prints a `⚠️` that this is a local session and no issue will be created: relay it. The rest works as for `/gps start`.
3. Immediately invokes the `brainstorming` skill, framed as a report: Problem Statement is the report, "Current behavior" the reproduction, Success Metrics the expected result. Do not wait for the user to run `/brainstorming` themselves.

**Then, as for `/gps start`:** once the design is approved, save the resume by following `references/write.md`. On a GitHub project that write also files the GitHub issue from the resume and prints `📌 Issue #N: <url>`: relay it. If it fails with `gh issue create failed`, nothing was written: relay the reason and run write-apply again after the user fixes it.

- **Bounded work** (no plan): implement directly on the checked-out branch. No branch, no PR. Put the issue number in commit messages (`fix: handle large saves (#N)`). Before `/gps finish`, ask the user "Close issue #N as well?" and run finish with `--close-issue` only on yes (see `references/finish.md`). Finish comments a summary on the issue either way.
- **Planned work:** run `/gps plan` as usual. The plan write creates the session branch and `/gps finish` opens a PR that says `Closes #N`, so merging it closes the issue. Do not pass `--close-issue`.

**Example:**

```
/gps issue crash when saving a large file
```

## Dependency

`brainstorming` (superpowers) runs the grill conversation. If it isn't available, stop and tell the user to install the `superpowers` plugin.
