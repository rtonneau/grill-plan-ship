#!/usr/bin/env node

/**
 * /gps plan
 *
 * Reads resume.md, creates 02-plan/ + ticket templates
 */

const fs = require('fs');
const path = require('path');

function createPlan() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');

  // Find current session (most recent)
  if (!fs.existsSync(sessionsDir)) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const sessions = fs.readdirSync(sessionsDir).sort().reverse();
  const currentSession = sessions[0];
  const sessionDir = path.join(sessionsDir, currentSession);
  const resumePath = path.join(sessionDir, '01-grill', 'resume.md');

  if (!fs.existsSync(resumePath)) {
    console.error(`resume.md not found. Run /gps start first.`);
    process.exit(1);
  }

  // Create 02-plan structure
  const planDir = path.join(sessionDir, '02-plan');
  const ticketsDir = path.join(planDir, 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });

  // Create plan.md template
  const planTemplate = `# Implementation Plan

**Session:** ${currentSession}
**Date:** ${new Date().toISOString()}

## Strategy

(Run /writing-plans to generate this)

## Tickets

- Ticket 1: (To be filled)
- Ticket 2: (To be filled)
- Ticket 3: (To be filled)
- Ticket 4: (To be filled)
`;

  fs.writeFileSync(path.join(planDir, 'plan.md'), planTemplate);

  // Create 4 ticket templates
  for (let i = 1; i <= 4; i++) {
    const ticketTemplate = `# Ticket ${i.toString().padStart(2, '0')}: [slug]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

**Files to Touch:**
- src/...

**Verification:**

Run:
\`\`\`bash
npm test
\`\`\`

Expected: All tests pass
`;

    const ticketPath = path.join(
      ticketsDir,
      `${i.toString().padStart(2, '0')}-[slug].md`
    );
    fs.writeFileSync(ticketPath, ticketTemplate);
  }

  // Update .session-config.json
  const configPath = path.join(sessionDir, '.session-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  config.phases_completed.push('grill');
  config.status = 'plan-in-progress';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`✅ Plan directory created`);
  console.log(`📁 Path: ${planDir}`);
  console.log(`\n📝 Next steps:`);
  console.log(`1. Run /writing-plans to generate your tickets`);
  console.log(`2. Copy ticket content into 02-plan/tickets/`);
  console.log(`3. Run /unslop rewrite on each ticket for crisp language`);
  console.log(`4. Then run /gps ticket 01 to start implementing`);
}

createPlan();