# Ticket 01: agent-definitions-for-ticket-roles

**Acceptance Criteria:**
- [ ] `agents/gps-implementer.md` and `agents/gps-reviewer.md` exist with frontmatter `name`, a `description` stating they are only for gps-dispatched briefs, and `disallowedTools` (implementer: Agent; reviewer: Edit, Write, NotebookEdit, Agent); no `model` or `effort`; body is one line pointing at the gps brief in the prompt.
- [ ] `lib/host-dispatch.js` maps each role to its Claude agent type `grill-plan-ship:gps-<role>`; the Claude lifecycle says to use `general-purpose` with the same brief when that type is unavailable, and that tool limits then are behavioral only. Codex output is unchanged.
- [ ] A role list in one place (e.g. `ROLES` in `lib/host-dispatch.js`) drives `dispatch-prompt.js --role` validation; `tests/skill.test.js` checks that `agents/*.md` and that list match one to one, that no agent sets model or effort, and that read-only roles disallow Edit and Write.
- [ ] `docs/decisions/0019-role-agent-definitions.md` records the decision, superseding only 0016's "no agent definitions" line; 0016 gets a superseded-in-part note.
- [ ] `npm test` passes.

**Files to Touch:**
- `agents/gps-implementer.md`
- `agents/gps-reviewer.md`
- `skills/gps/scripts/lib/host-dispatch.js`
- `skills/gps/scripts/dispatch-prompt.js`
- `tests/skill.test.js`
- `tests/dispatch-prompt.test.js`
- `tests/lib/host-dispatch.test.js`
- `docs/decisions/0019-role-agent-definitions.md`
- `docs/decisions/0016-shared-behavioral-roles.md`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All test files pass, including skill.test.js and dispatch-prompt.test.js.

**Notes:**

Replace the `no plugin agent definitions` assertion in skill.test.js. Keep `subagent_type` the only Claude call change; the brief text stays identical on both hosts.
