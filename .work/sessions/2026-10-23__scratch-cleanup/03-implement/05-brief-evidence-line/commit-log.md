# Ticket 05: brief-evidence-line

**Status:** ✅ Done

## Local Test Result

`node --test tests/dispatch-prompt.test.js tests/skill.test.js`: pass 2, fail 0 (re-run after the review fix: skill.test.js pass).

## Review Notes

Implemented by a subagent (Haiku, effort low). Checked: one prompt line naming `<session scratch dir>/evidence/`, the same rule in all four agent files with identical bodies, and a prompt test asserting it. After review: the agent files said `<scratchDir>/evidence/`, a placeholder the agent cannot resolve. They now say the scratch directory's `evidence/` subfolder.

## Blockers / Challenges

None

## Commits

- 2fb96ff feat: ticket brief keeps cited evidence out of build trees (ticket 05)

## Time Spent

1m (ticket-start.js to ticket-complete.js)
