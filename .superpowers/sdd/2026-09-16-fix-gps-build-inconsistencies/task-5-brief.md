# Task 5: Fix `scripts/plan.js`

**Context:** This task modifies the existing `scripts/plan.js` to use the shared modules. It also adds a critical validation step: reading and checking that resume.md has been filled in (no unfilled placeholders remain).

**Files:**
- Modify: `scripts/plan.js` (replace entire file)
- Test: manual CLI run

**Interfaces:**
- Consumes: `loadTemplate`, `renderTemplate` from `./lib/templates`; `getCurrentSessionId`, `markPhaseCompleted` from `./lib/session-store`
- Produces: `02-plan/plan.md` and four `02-plan/tickets/NN-[slug].md` files, rendered from templates

**What to do:**

Replace the entire `scripts/plan.js` file with this exact content:

```javascript
#!/usr/bin/env node

/**
 * /gps plan
 *
 * Reads resume.md, creates 02-plan/ + ticket templates
 */

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { getCurrentSessionId, markPhaseCompleted } = require('./lib/session-store');

function createPlan() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const currentSession = getCurrentSessionId(sessionsDir);
  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const sessionDir = path.join(sessionsDir, currentSession);
  const resumePath = path.join(sessionDir, '01-grill', 'resume.md');

  if (!fs.existsSync(resumePath)) {
    console.error(`resume.md not found. Run /gps start first.`);
    process.exit(1);
  }

  const resumeContent = fs.readFileSync(resumePath, 'utf-8');
  if (/\{\{[^}]+\}\}/.test(resumeContent)) {
    console.error(
      `resume.md still contains unfilled {{ ... }} placeholders.\n` +
      `Complete the grill phase (fill in ${resumePath}) before running /gps plan.`
    );
    process.exit(1);
  }

  const configPath = path.join(sessionDir, '.session-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const planDir = path.join(sessionDir, '02-plan');
  const ticketsDir = path.join(planDir, 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });

  const planContent = renderTemplate(loadTemplate('02-plan.md'), {
    'feature-name': config.feature_name,
    timestamp: new Date().toISOString(),
  });
  fs.writeFileSync(path.join(planDir, 'plan.md'), planContent);

  const ticketTemplate = loadTemplate('02-ticket.md');
  for (let i = 1; i <= 4; i++) {
    const ticketNum = i.toString().padStart(2, '0');
    const ticketContent = renderTemplate(ticketTemplate, {
      N: ticketNum,
      slug: '[slug]',
    });
    const ticketPath = path.join(ticketsDir, `${ticketNum}-[slug].md`);
    fs.writeFileSync(ticketPath, ticketContent);
  }

  markPhaseCompleted(config, 'grill');
  config.status = 'plan-in-progress';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`Plan directory created`);
  console.log(`Path: ${planDir}`);
  console.log(`\nNext steps:`);
  console.log(`1. Run /writing-plans to generate your tickets`);
  console.log(`2. Copy ticket content into 02-plan/tickets/`);
  console.log(`3. Run /unslop rewrite on each ticket for crisp language`);
  console.log(`4. Then run /gps ticket 01 to start implementing`);
}

createPlan();
```

**Key changes from the old version:**
1. Resolve current session via `getCurrentSessionId(sessionsDir)` instead of sorting directory names
2. **NEW:** Read resume.md and validate it — fail if it still contains unfilled {{ ... }} placeholders
3. Load plan.md template instead of hardcoding it
4. Load ticket.md template instead of hardcoding it (4 times)
5. Render both templates with renderTemplate(), filling keys 'feature-name', 'timestamp', 'N', 'slug'
6. Call `markPhaseCompleted(config, 'grill')` instead of `config.phases_completed.push('grill')` — ensures idempotence
7. Import the shared modules

**Test it:**
1. Use the .work session created by Task 4 (or create one with `node scripts/start-session.js "test-feature"`)
2. Try to run `node scripts/plan.js` before filling in resume.md — should fail with "unfilled placeholders" error
3. Fill in resume.md: `sed -i 's/{{[^}]*}}/filled in/g' .work/sessions/*/01-grill/resume.md`
4. Run `node scripts/plan.js` again — should succeed
5. Verify: `02-plan/plan.md` exists and contains rendered plan template
6. Verify: `02-plan/tickets/01-[slug].md` through `04-[slug].md` exist
7. Verify: `.session-config.json` has "grill" in phases_completed
8. Run `node scripts/plan.js` again — should not add a second "grill" entry to phases_completed

**Commit:**
`git add scripts/plan.js && git commit -m "fix: plan.js reads and validates resume.md, renders templates/, dedupes phases_completed"`

**Report to:**
.superpowers/sdd/2026-09-16-fix-gps-build-inconsistencies/task-5-report.md

When done, post only:
- Status (one word)
- Commits (hash space message)
- One-line manual test summary
- Any concerns
