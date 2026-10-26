# Ticket 01: finish-reports-pr-details

**Model:** medium
**Model (Jev):** sonnet-5.5 (confidence 0.2)
**Effort:** high

**Acceptance Criteria:**
- [ ] `lib/github.js`: `openPullRequest` success returns `{ ok, url, existing, number, title, head, base }`. New PR: number parsed from the URL, title/head/base from what it passed. Existing PR: one `gh pr view <url> --json number,title,headRefName,baseRefName,url` call via `runGh`; on failure, number from the URL and title/head/base null, never throws.
- [ ] `finish.js` prints `🔀 Pull request #N (new): <title> (<head> → <base>)` (or `(already open, updated by the push)`), then the URL on its own line; when title is unknown, `🔀 Pull request #N (already open, updated by the push)` then the URL.
- [ ] INDEX.md's `- **Pull request:**` line carries the same details and the URL; one shared formatter builds both.
- [ ] `--json` data exposes the details under `pr`.
- [ ] The failure path (push or gh pr create failed) is unchanged.
- [ ] Stub-gh tests (`tests/github-flow.test.js`, `tests/lib/github.test.js`) cover new PR, existing PR with a working view, and existing PR whose view fails.

**Files to Touch:**
- `skills/gps/scripts/lib/github.js`
- `skills/gps/scripts/finish.js`
- `tests/lib/github.test.js`
- `tests/github-flow.test.js`
- `tests/finish.test.js` (only if its expectations name the old line)

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All tests pass.

**Notes:**

Existing-PR lookup today comes from `gitInfo.pr_url` or `findOpenPullRequest`; keep that, then view the found URL. Parse the number with a regex on `/pull/(\d+)`. Extend the stub gh in the tests to answer `pr view` (and to fail it on demand) the same way it answers `pr list` / `pr create`.
