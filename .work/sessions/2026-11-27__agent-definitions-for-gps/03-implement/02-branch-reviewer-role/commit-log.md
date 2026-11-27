# Ticket 02: branch-reviewer-role

**Status:** ✅ Done

## Local Test Result

`npm test && node tests/check-skill-size.js --max 200`: 144 pass, 0 fail (output in `.scratch/tests/2026-11-27__agent-definitions-for-gps/02-npm-test.txt`); size check passes.

## Review Notes

Mode: inline. Review base: 3f2eb80daee007f0d728b099453cf08a7abbae3e. Pre-existing changes: none outside `.work/`.

- `role-context.md` split into ticket header + `role-rules.md` (shared rules) + new `role-session-context.md`; ticket briefs render byte-identical (existing dispatch tests unchanged and passing).
- `dispatch-prompt.js` rebuilt around `ROLES` (ticket/base flags, task names); `--role branch-reviewer --base <sha>` needs no ticket and refuses one; ticket roles refuse a missing number. Tests cover both hosts, read-only, slot filling.
- `agents/gps-branch-reviewer.md` (read-only limits); skill.test.js now treats `role-<role>.md` as loaded via ROLES.
- `auto-route.js --review`: recorded on auto_started, printed, warned and dropped without a finish step; plain auto never reviews (tested).
- finish.md / auto.md / SKILL.md describe `--review`; help.test.js expectations updated for the new usage.
- Parent review only: delivery is touched solely by reference text, opt-in. Recovery count: 0.

## Blockers / Challenges

Shell heredocs collapsed backslashes in regexes; edits redone with the Edit tool.

## Commits

- d754bfa feat: branch reviewer role and /gps finish --review (ticket 02)

## Time Spent

10m (ticket-start.js to ticket-complete.js)
