# Ticket 05: docs-and-live-evidence

**Acceptance Criteria:**
- [ ] `docs/ARCHITECTURE.md` and README describe roles, agent definitions, the fallback, and that Bash-level writes and Codex restrictions remain behavioral.
- [ ] `docs/COMPATIBILITY.md` updates "Plugin bundles agents" and adds a labeled result for a live Claude run that loads this repo as a plugin and spawns a gps role agent by its scoped `subagent_type`, plus whether Edit is refused for a read-only role; anything not run is labeled NOT TESTED.
- [ ] `AGENTS.md` layout lists `agents/` and decision 0019.
- [ ] `claude plugin validate .`, `npm test` and the size check pass.

**Files to Touch:**
- `docs/ARCHITECTURE.md`
- `README.md`
- `docs/COMPATIBILITY.md`
- `AGENTS.md`

**Verification Step:**

Run:
```bash
claude plugin validate . && npm test && node tests/check-skill-size.js --max 200
```

Expected:
Validation passes; all tests pass; no size violation.

**Notes:**

Run the live check in a disposable repo under the scratch dir (e.g. `claude -p --plugin-dir <repo>`); report the exact command and outcome.
