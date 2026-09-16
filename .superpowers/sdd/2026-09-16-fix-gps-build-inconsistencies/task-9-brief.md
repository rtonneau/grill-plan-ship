# Task 9: Fix the build doc's PowerShell here-string escaping bug

**Context:** This is the final task. The `.build-scripts/gps-build-powershell.md` file contains PowerShell code examples for building the plugin. It has a systematic escaping bug: backticks and dollar signs are wrongly escaped using backslashes in double-quoted here-strings, when they should either not be escaped at all (single-quoted) or properly doubled (backticks).

**Files:**
- Create: `.build-scripts/gps-build-powershell.md` (vendored from parent repo, then fixed)

**The escaping bug:**
- In PowerShell `@"..."@` (double-quoted here-string), a literal backtick must be written as two backticks: `` `` ``
- A single backslash-backtick (`` \` ``) is NOT a valid escape — it produces a literal backslash and backtick in the output
- This causes generated files to contain literal `` \` `` sequences (confirmed by actual broken README.md in parent repo)
- Fix: convert double-quoted here-strings to single-quoted (`@'...'@`), which need no escaping for either backticks or `$` symbols

**What to do:**

1. **Copy the source file:** 
   ```bash
   mkdir -p .build-scripts
   cp ../grill-plan-ship/.build-scripts/gps-build-powershell.md .build-scripts/gps-build-powershell.md 2>/dev/null || true
   ```
   (If inaccessible, that's OK — the current version of the file is the parent repo's version from the prompt during planning.)

2. **Fix all PowerShell here-strings:**
   Find each `$variableName = @"..."@` block and:
   - Change `@"` to `@'` and `"@` to `'@`
   - Inside the block, replace `` \` `` with plain backtick `` ` ``
   - Replace `` \$ `` with plain `$`
   - This applies to AT LEAST these here-strings:
     - `$skillContent` (Step 3, SKILL.md)
     - `$handler1`, `$handler2`, `$handler3`, `$handler4` (Step 4, the four handlers)
     - `$template1`, `$template2`, `$template3`, `$template4` (Step 5, the four templates)
     - `$readmeContent` (Step 6, README.md)

3. **Update Step 4's handler code samples:**
   Replace the JS code in `$handler1`-`$handler4` blocks with the final implementations from Tasks 4-7 (the four fixed scripts).
   
   Also add a new sub-step before Handler 1 that creates the two shared library files from Tasks 2-3:
   - Show the creation of `scripts/lib/templates.js`
   - Show the creation of `scripts/lib/session-store.js`

4. **Update Step 5:**
   After the four template-creation blocks, add this sentence:
   "These four files are read at runtime by `scripts/lib/templates.js` — editing a template changes what `/gps start`, `/gps plan`, and `/gps ticket` generate without touching the JS handlers."

5. **Fix date format:**
   Replace all six occurrences of `YYYYMMDD` with `YYYY-MM-DD`:
   - SKILL.md section ×4 (same as Task 8)
   - handler1 comment (file structure comment)
   - README.md section ×1

6. **Add notes on current-session pointer and phase dedup:**
   In Step 4's prose (after Handler 1), add:
   "Handler 1 also writes `.work/sessions/.current-session` so Handlers 2-4 resolve the session deterministically instead of sorting directory names."
   
   In Step 4's prose (Handler 2 section), add:
   "`phases_completed` entries are only added once — re-running `/gps plan` or `/gps finish` is idempotent."

**Verification:**
- `grep "\\`" .build-scripts/gps-build-powershell.md` should return 0 results (no backslash-backtick escapes)
- `grep -E "YYYYMMDD[^A-Z]" .build-scripts/gps-build-powershell.md` should return 0 results (all `YYYYMMDD` replaced)
- The file should describe the corrected behavior: template loading, session pointer, phase dedup

**Commit:**
`git add .build-scripts/gps-build-powershell.md && git commit -m "docs: fix backtick/dollar here-string escaping and re-sync build doc with fixed scripts"`

**Report to:**
.superpowers/sdd/2026-09-16-fix-gps-build-inconsistencies/task-9-report.md

When done, post only:
- Status (one word)
- Commits (hash space message)
- One-line verification summary
- Any concerns

**Note:** This is a large documentation task. The changes are mechanical (here-string escaping fix + date format + code samples + explanatory notes), but extensive. Take time to verify each section carefully.
