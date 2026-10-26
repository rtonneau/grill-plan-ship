# Ticket 03: references-chained-finish

**Model:** heavy
**Model (Jev):** opus-5.5 (confidence 0.14)
**Effort:** high

**Acceptance Criteria:**
- [ ] `skills/gps/references/ship.md`: in a full `/gps ship` (no N), "All tickets are done" (including when everything was done before the loop) runs `references/finish.md` as a chained finish when `ship.autoFinish` is on (shown by `config.js`), otherwise suggests `/gps finish` and stops; `/gps ship N` still only suggests it; under `/gps auto` it returns to auto.md as today.
- [ ] `skills/gps/references/finish.md`: a chained finish (from ship or from `/gps auto`) asks nothing: run `finish.js` with `--keep-issue` up front and skip the step-5 session-switch question; a typed `/gps finish` still asks both.
- [ ] `skills/gps/references/auto.md`: step 4's `finish` bullet says it runs as a chained finish (no closing questions); a `ship` target followed by `finish` (setting on) runs it too.
- [ ] `docs/decisions/0011-ship-chains-finish.md` records the decision (typing a full /gps ship is the go-ahead for finish when `ship.autoFinish` is on, default true; chained finish keeps the issue open and never switches session) and why; `.claude/CLAUDE.md`'s decisions line mentions 0011.
- [ ] README.md's settings table ("Settings live in `.work/gps-config.json`") gets a `ship.autoFinish` row (default `true`), and the ship/finish docs mention the chain.
- [ ] Each reference stays ≤ 40 lines and `npm test` passes.

**Files to Touch:**
- `skills/gps/references/ship.md`
- `skills/gps/references/finish.md`
- `skills/gps/references/auto.md`
- `docs/decisions/0011-ship-chains-finish.md`
- `.claude/CLAUDE.md`
- `README.md`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All tests pass (tests/skill.test.js checks reference sizes).

**Notes:**

Decision number is 0011 (0009 and 0010 exist). Match the style of `docs/decisions/0008-scratch-cleanup-on-finish.md`. Keep wording terse; the references are read by the agent each run. Use the glossary term "chained finish" (`.work/GLOSSARY.md`).
