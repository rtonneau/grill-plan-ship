# Task 8: Fix `SKILL.md` documentation

**Context:** This task updates the SKILL.md file to match the actual behavior of the fixed code: session IDs use YYYY-MM-DD format (not YYYYMMDD), and there's now a .current-session pointer file.

**Files:**
- Modify: `SKILL.md` (update documentation only, no code changes)

**What to do:**

Make these changes to `SKILL.md`:

1. **Replace all four occurrences of `YYYYMMDD` with `YYYY-MM-DD`** in the session-path pattern.
   - In the Overview section: "All output lives in `.work/sessions/YYYY-MM-DD__<feature>/`"
   - Under `/gps start <feature-name>` → "What it does" → Line 1: "Creates session directory: `.work/sessions/YYYY-MM-DD__<feature-name>/`"
   - Under `/gps start <feature-name>` → "What it does" → Line 2: "Creates `.work/sessions/YYYY-MM-DD__<feature-name>/.session-config.json`"
   - Under `/gps start <feature-name>` → "What it does" → Line 3: "Creates `.work/sessions/YYYY-MM-DD__<feature-name>/01-grill/` directory"

2. **Add a new bullet under `/gps start` "What it does" list** (after the 01-grill/ line):
   ```markdown
   5. Writes `.work/sessions/.current-session` pointing at this session, so later commands operate on it regardless of what other sessions exist
   ```

3. **Update the `/gps plan` section's first "What it does" bullet** (currently references `CURRENT`):
   Replace:
   ```markdown
   1. Reads `.work/sessions/CURRENT/01-grill/resume.md`
   ```
   With:
   ```markdown
   1. Resolves the current session via `.work/sessions/.current-session`, then reads its `01-grill/resume.md` (fails if it still contains unfilled `{{ ... }}` placeholders)
   ```

**Verification:**
- `grep -n "YYYYMMDD" SKILL.md` should return 0 results (all occurrences replaced)
- `grep -q ".current-session" SKILL.md` should find the pointer file documentation

**Commit:**
`git add SKILL.md && git commit -m "docs: fix YYYYMMDD to match actual YYYY-MM-DD session ids, document current-session pointer"`

**Report to:**
.superpowers/sdd/2026-09-16-fix-gps-build-inconsistencies/task-8-report.md

When done, post only:
- Status (one word)
- Commits (hash space message)
- One-line verification summary
- Any concerns
