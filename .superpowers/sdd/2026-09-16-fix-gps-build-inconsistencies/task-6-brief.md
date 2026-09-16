# Task 6: Fix `scripts/ticket.js`

**Context:** This task modifies `scripts/ticket.js` to use the shared modules. Critically, it fixes the "implementation log mismatch" bug: the old hardcoded log template was missing the "Blockers / Challenges" section.

**Files:**
- Modify: `scripts/ticket.js` (replace entire file)
- Test: manual CLI run

**Interfaces:**
- Consumes: `loadTemplate`, `renderTemplate` from `./lib/templates`; `getCurrentSessionId` from `./lib/session-store`
- Produces: `03-implement/NN-<slug>/commit-log.md` rendered from the template

**What to do:**

Replace the entire `scripts/ticket.js` file with this exact content:

```javascript
#!/usr/bin/env node

/**
 * /gps ticket <number>
 *
 * Reads ticket spec, creates implementation directory, prints spec
 */

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { getCurrentSessionId } = require('./lib/session-store');

function getTicket(ticketNum) {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const currentSession = getCurrentSessionId(sessionsDir);

  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const ticketsDir = path.join(sessionsDir, currentSession, '02-plan', 'tickets');

  const ticketFiles = fs.readdirSync(ticketsDir)
    .filter((f) => f.startsWith(ticketNum.toString().padStart(2, '0') + '-'))
    .sort();

  if (ticketFiles.length === 0) {
    console.error(`Ticket ${ticketNum} not found.`);
    process.exit(1);
  }

  const ticketPath = path.join(ticketsDir, ticketFiles[0]);
  const ticketContent = fs.readFileSync(ticketPath, 'utf-8');
  const slug = ticketFiles[0].replace(/^\d+-/, '').replace(/\.md$/, '');

  return { ticketContent, slug, currentSession };
}

function implementTicket(ticketNum) {
  const projectRoot = process.cwd();
  const { ticketContent, slug, currentSession } = getTicket(ticketNum);

  const sessionDir = path.join(projectRoot, '.work', 'sessions', currentSession);
  const ticketNumPadded = ticketNum.toString().padStart(2, '0');
  const implDir = path.join(sessionDir, '03-implement', `${ticketNumPadded}-${slug}`);

  fs.mkdirSync(implDir, { recursive: true });

  const logContent = renderTemplate(loadTemplate('03-implement-log.md'), {
    N: ticketNumPadded,
  });
  fs.writeFileSync(path.join(implDir, 'commit-log.md'), logContent);

  console.log('\n' + '='.repeat(70));
  console.log(`TICKET SPEC - ${ticketNumPadded}`);
  console.log('='.repeat(70) + '\n');
  console.log(ticketContent);
  console.log('\n' + '='.repeat(70));
  console.log(`Working directory: ${implDir}`);
  console.log(`Log file: ${path.join(implDir, 'commit-log.md')}`);
  console.log('\nImplement in Claude Code, test locally, save results to commit-log.md');
  console.log('='.repeat(70) + '\n');
}

const ticketNum = process.argv[2];
if (!ticketNum) {
  console.error('Usage: /gps ticket <number>');
  process.exit(1);
}

implementTicket(ticketNum);
```

**Key changes from the old version:**
1. Resolve current session via `getCurrentSessionId(sessionsDir)` instead of sorting
2. Load commit-log.md template instead of hardcoding it
3. Render template with key 'N' (the ticket number, zero-padded)
4. The loaded template now includes the "## Blockers / Challenges" section that was missing before
5. Import the shared modules

**Test it:**
1. Using the .work session from previous tasks (or create one), and after running `/gps plan`:
2. Run: `node scripts/ticket.js 1`
3. Verify: directory `03-implement/01-<slug>/` is created
4. Verify: file `03-implement/01-<slug>/commit-log.md` exists
5. Check the content: `cat .work/sessions/*/03-implement/01-*/commit-log.md` — it should match the template exactly, including the "## Blockers / Challenges" section

**Commit:**
`git add scripts/ticket.js && git commit -m "fix: ticket.js renders commit-log.md from templates/03-implement-log.md"`

**Report to:**
.superpowers/sdd/2026-09-16-fix-gps-build-inconsistencies/task-6-report.md

When done, post only:
- Status (one word)
- Commits (hash space message)
- One-line manual test summary
- Any concerns
