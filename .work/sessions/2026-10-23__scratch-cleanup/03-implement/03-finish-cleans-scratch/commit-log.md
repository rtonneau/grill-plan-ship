# Ticket 03: finish-cleans-scratch

**Status:** ✅ Done

## Local Test Result

`node --test tests/finish.test.js`: pass 1, fail 0 (default, none, all, nothing-to-remove and refused-finish cases). The subagent also ran skill, e2e and github-flow tests: pass.

## Review Notes

Implemented by a subagent (Sonnet, effort high). Checked: the cleanup runs after every refusal check and after `session_finished`, before `commitWorkDir`, so `scratch_cleaned` is committed. No event or line when nothing was removed. The `🧹` line differs for `all`. Each failure goes through `warn()` and the exit code is unchanged. `--json` carries `scratch`. No changes after review. Note: `scratch_cleaned` is in the config history but not in INDEX.md, which is written before it.

## Blockers / Challenges

None

## Commits

- 784d1e5 feat: clean the session scratch dir at finish (ticket 03)

## Time Spent

3m (ticket-start.js to ticket-complete.js)
