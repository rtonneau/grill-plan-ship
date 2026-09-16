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