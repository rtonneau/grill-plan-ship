# Task 7: Fix `scripts/finish.js`

**Context:** This is the last script-fixing task. It modifies `scripts/finish.js` to use the shared modules, specifically for deterministic session resolution and idempotent phase tracking.

**Files:**
- Modify: `scripts/finish.js` (replace entire file)
- Test: manual CLI run

**Interfaces:**
- Consumes: `getCurrentSessionId`, `markPhaseCompleted` from `./lib/session-store`
- Produces: `INDEX.md` in the session directory, updated `.session-config.json` with status and phases_completed

**What to do:**

Replace the entire `scripts/finish.js` file with this exact content:

```javascript
#!/usr/bin/env node

/**
 * /gps finish
 *
 * Generates INDEX.md, marks session complete
 */

const fs = require('fs');
const path = require('path');
const { getCurrentSessionId, markPhaseCompleted } = require('./lib/session-store');

function finishSession() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const currentSession = getCurrentSessionId(sessionsDir);

  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const sessionDir = path.join(sessionsDir, currentSession);
  const configPath = path.join(sessionDir, '.session-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const indexContent = `# Session Summary: ${config.feature_name}

**Session ID:** ${config.session_id}
**Created:** ${config.created_at}
**Status:** Complete

## Phases

- [x] Phase 1: Grill
  - Resume: [01-grill/resume.md](01-grill/resume.md)

- [x] Phase 2: Plan
  - Plan: [02-plan/plan.md](02-plan/plan.md)
  - Tickets: [02-plan/tickets/](02-plan/tickets/)

- [x] Phase 3: Implement
  - Implementation logs: [03-implement/](03-implement/)

## All Done!

Next: Start a new feature with /gps start <next-feature>
`;

  fs.writeFileSync(path.join(sessionDir, 'INDEX.md'), indexContent);

  config.status = 'completed';
  markPhaseCompleted(config, 'implement');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`Session complete: ${config.session_id}`);
  console.log(`Summary: ${path.join(sessionDir, 'INDEX.md')}`);
  console.log(`\nReady for next feature. Run: /gps start <new-feature>`);
}

finishSession();
```

**Key changes from the old version:**
1. Resolve current session via `getCurrentSessionId(sessionsDir)` instead of sorting
2. Call `markPhaseCompleted(config, 'implement')` instead of `config.phases_completed.push('implement')` — ensures idempotence
3. Import the shared module

**Test it:**
1. Using the .work session from previous tasks (or create one):
2. Run: `node scripts/finish.js`
3. Verify: file `INDEX.md` is created in the session directory
4. Verify: `.session-config.json` has "implement" in phases_completed and status is "completed"
5. Run `node scripts/finish.js` again — should not add a second "implement" entry

**Commit:**
`git add scripts/finish.js && git commit -m "fix: finish.js dedupes phases_completed and resolves session via pointer"`

**Report to:**
.superpowers/sdd/2026-09-16-fix-gps-build-inconsistencies/task-7-report.md

When done, post only:
- Status (one word)
- Commits (hash space message)
- One-line manual test summary
- Any concerns
