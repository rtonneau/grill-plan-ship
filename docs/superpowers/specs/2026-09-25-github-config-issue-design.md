# GitHub project config, plan-time branches and `/gps issue` design

**Date:** 2026-09-25
**Status:** Approved

## Goal

Make GitHub support a first-class, checkable property of a project, create a
session branch (and PR) only for planned work, and add `/gps issue` as an
alternative to `/gps start` that reports the work as a GitHub issue.

## Decisions

| Question | Decision |
|---|---|
| Where is GitHub availability recorded? | `.work/gps-config.json`, one file per project checkout (`.work/` is gitignored). |
| How does the flag get its value? | Detected once by the first gps command, then only read. Editable by hand. |
| When is the session branch created? | At the **plan** write, not the grill write. Bounded sessions (no plan) get no branch and no PR. |
| What does `/gps issue` do for bounded work? | Creates a GitHub issue at the grill write; no branch, no PR. `/gps finish` comments a summary on the issue and, if the user agreed, closes it. |
| What does `/gps issue` do for planned work? | Creates the issue at the grill write; the plan write creates the branch; the PR body says `Closes #N`. Finish neither comments nor closes. |
| `/gps issue` with GitHub off? | Falls back to a local session (like `/gps start`), with a warning. No issue is created. |
| Who confirms closing the issue? | Claude asks the user before running `/gps finish`, and passes `--close-issue` on yes. |

## Project config (`.work/gps-config.json`)

```json
{ "version": 1, "github": { "enabled": true, "detected_at": "<ISO 8601>" } }
```

New `scripts/lib/project-config.js`:

- `ensureProjectConfig(projectRoot)`: returns the parsed file; creates it when
  missing. `github.enabled` is true only when `detectGithub(projectRoot)` holds
  **and** `gh auth status` exits 0. It creates `.work/` if needed.
- `githubEnabled(projectRoot)`: `ensureProjectConfig(...).github.enabled === true`.
- Invalid JSON, or a `github.enabled` that is not a boolean, throws a
  `GpsError` naming the file and telling the user to fix or delete it.
- Nothing re-detects after creation. Editing the file forces the flag either
  way (GitHub Enterprise, opting out).

Every handler that needs to know about GitHub calls `githubEnabled()`:
`start-session.js`, `issue-session.js`, `write-target.js`, `write-apply.js`.
`finish.js` does not read the flag: it acts on the session's own `git` and
`issue` records, so a session keeps working if the flag changes mid-way.
Projects that already use gps get the file on their next command.
`detectGithub` stays in `github.js`, used only by `ensureProjectConfig`.

## Branch at plan write

- `write-target.js`: the `Branch` field and `branchPattern` are offered for the
  **plan** phase (GitHub enabled), no longer for the grill phase.
- `write-apply.js`: `Branch` is validated and created (`createSessionBranch`)
  when `target === 'plan'` and GitHub is enabled; the `git` record is saved in
  `.session-config.json` as before, before the tickets are written. A `Branch`
  field in any other case is ignored. Validation failures join the usual `❌`
  list and the payload stays for a retry.
- The `✅`/`🌿` output moves with it: the plan write prints
  `🌿 Working on branch … (from …); /gps finish opens the PR.`
- Bounded sessions (no plan): no branch is created, work happens on whatever
  branch is checked out. `finish.js` sees no `config.git`, so it opens no PR and
  `INDEX.md` has no "Branch & PR" section.
- Sessions that already carry a `git` record (created by v1.3.0) finish as before.
- `references/write.md` and `references/start.md` stop mentioning a branch at
  the grill write. `references/plan.md`/`write.md` describe it at the plan write.

## `/gps issue <title>`

**Handler:** `scripts/issue-session.js`. The session-directory setup in
`start-session.js` is extracted into `scripts/lib/session-init.js`
(`initSession(projectRoot, featureName, extraConfig)`) and both handlers call
it, so the two commands cannot drift. `.session-config.json` gets
`kind: "issue"` for issue sessions.

**Grill:** same `resume.md` template. `references/issue.md` tells Claude to run
the brainstorm as a report: Problem Statement is the report, "Current behavior"
the reproduction, Success Metrics the expected result. No new template or
headings, so the payload machinery is unchanged. As with `/gps start`, a bounded
outcome skips `/gps plan`.

**Issue creation (grill write, `kind: "issue"`, GitHub enabled, no `issue` yet):**

- After the payload validates and before anything is written,
  `createIssue(projectRoot, { title, body })` runs `gh issue create --title
  <feature name> --body-file <tmp>`. The issue number and URL are parsed from
  the last `https://…/issues/<n>` line.
- Body: the resume's Problem Statement, Current behavior and Success Metrics,
  the `gps session: <id>` line and the attribution line.
- On failure: `❌` with gh's reason, nothing written, payload kept for a retry
  (same shape as a failed branch creation).
- On success: the config gets `issue: { number, url, created_at }`; the `✅`
  output prints `📌 Issue #N: <url>`.

**GitHub disabled:** `issue-session.js` prints
`⚠️  GitHub is not enabled for this project: this is a local session, no issue will be created.`
and continues as a `kind: "issue"` session without an `issue` record. Turning
the flag on later does not retro-create an issue.

**Finish, bounded issue session (`config.issue`, no `config.git`):**

- `gh issue comment <n> --body-file <tmp>`: summary with the Problem
  Statement, the commits made since `created_at` (`readRecentCommits`), and the
  session id.
- With `--close-issue`, then `gh issue close <n>`.
- A failed gh call prints `⚠️` with the exact manual commands and does not fail
  the finish. `INDEX.md` gets an `## Issue` section: link, commented, closed or not.
- `references/finish.md` tells Claude, for a session with an issue and no plan,
  to ask "Close issue #N as well?" **before** running `finish.js`, and to append
  `--close-issue` only on yes.

**Finish, planned issue session (`config.issue` and `config.git`):**

- `buildPrBody` adds a `Closes #N` line. Nothing is commented or closed by gps;
  merging the PR closes the issue. `INDEX.md` lists the issue next to the PR.

**Status:** `summarizeSession` adds `issueUrl` (null when absent); `/gps status`
prints it next to the branch/PR.

## Files

New: `scripts/lib/project-config.js` (+ test), `scripts/lib/session-init.js`,
`scripts/issue-session.js`, `skills/gps/references/issue.md`.

Changed: `scripts/lib/github.js` (`createIssue`, `commentOnIssue`,
`closeIssue`, `Closes #N` support), `scripts/start-session.js`,
`scripts/write-target.js`, `scripts/write-apply.js`, `scripts/finish.js`,
`scripts/lib/status.js`, `skills/gps/SKILL.md` (router row, description),
`references/write.md`, `start.md`, `plan.md`, `finish.md`, `README.md`,
`CLAUDE.md`, `package.json` (1.4.0).

## Error handling

- Missing title: `❌ Missing issue title.` + `Usage: /gps issue <title>`.
- Session already exists: same refusal as `/gps start`.
- `gh` missing or unauthenticated at detection: `github.enabled` is false; the
  flag is not re-checked later, so a mid-project `gh auth login` needs a manual
  edit of the file (documented in README).
- `gh` failing at issue creation blocks the grill write (retryable); `gh`
  failing at finish never blocks the finish.

## Testing

- `project-config.test.js`: creation on first call, enabled only with a GitHub
  origin and a `gh` stub that authenticates, a non-GitHub repo, a `gh` stub
  that fails auth, a hand-edited flag being respected, invalid JSON refused.
- `github.test.js`: `createIssue`, `commentOnIssue`, `closeIssue` against the
  `GPS_GH_BIN` stub (URL parsing, failure reason); `Closes #N` in the PR body.
- `github-flow.test.js`:
  - planned session: no branch at the grill write, branch at the plan write,
    PR at finish;
  - bounded session: no branch, no PR, no `git` record;
  - bounded issue session: issue at the grill write, finish comments, and
    closes only with `--close-issue`;
  - planned issue session: PR body contains `Closes #N`;
  - GitHub-off issue session: warning, no `issue` record, no gh calls;
  - `gh issue create` failure: nothing written, payload kept, retry succeeds.
- `handlers.test.js`: `references/issue.md` exists with its handler line.
- Existing non-GitHub tests keep passing unchanged.
