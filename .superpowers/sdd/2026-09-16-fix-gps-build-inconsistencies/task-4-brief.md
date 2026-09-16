# Task 4: Fix `scripts/start-session.js`

**Context:** This task modifies an existing script to use the new shared modules (templates.js, session-store.js) created in Tasks 2-3. This is the first script to be fixed.

**Files:**
- Modify: `scripts/start-session.js` (replace entire file)
- Test: manual CLI run

**Interfaces:**
- Consumes: `loadTemplate`, `renderTemplate` from `./lib/templates` (Task 2); `setCurrentSession` from `./lib/session-store` (Task 3)
- Produces: `.work/sessions/<YYYY-MM-DD>__<slug>/` directory structure with:
  - `.session-config.json` (config with session_id, feature_name, created_at, phases_completed, etc.)
  - `01-grill/resume.md` (rendered from template with feature-name and timestamp filled)
  - `01-grill/notes.md` (boilerplate notes)
  - `INDEX.md` (initial session summary)
  - Also: `.work/sessions/.current-session` pointer file (set via setCurrentSession)

**What to do:**

Replace the entire `scripts/start-session.js` file with this exact content:

```javascript
#!/usr/bin/env node

/**
 * /gps start <feature-name>
 *
 * Creates session directory with structure:
 * .work/sessions/YYYY-MM-DD__<feature-name>/
 *   - .session-config.json
 *   - 01-grill/
 *       - resume.md
 *       - notes.md
 *   - INDEX.md
 */

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { setCurrentSession } = require('./lib/session-store');

function startSession(featureName) {
  const date = new Date().toISOString().split('T')[0];
  const slug = featureName.toLowerCase().replace(/\s+/g, '-');
  const sessionId = `${date}__${slug}`;

  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const workDir = path.join(sessionsDir, sessionId);
  const grillDir = path.join(workDir, '01-grill');

  fs.mkdirSync(grillDir, { recursive: true });

  const config = {
    session_id: sessionId,
    feature_name: featureName,
    created_at: new Date().toISOString(),
    phases_completed: [],
    tickets: [],
    status: 'grill-in-progress',
  };

  fs.writeFileSync(
    path.join(workDir, '.session-config.json'),
    JSON.stringify(config, null, 2)
  );

  const resumeContent = renderTemplate(loadTemplate('01-grill-resume.md'), {
    'feature-name': featureName,
    timestamp: config.created_at,
  });

  fs.writeFileSync(path.join(grillDir, 'resume.md'), resumeContent);
  fs.writeFileSync(path.join(grillDir, 'notes.md'), '# Brainstorm Transcript\n\n(To be filled)\n');

  fs.writeFileSync(
    path.join(workDir, 'INDEX.md'),
    `# Session: ${featureName}\n\nPhase: Grill (in progress)\n`
  );

  setCurrentSession(sessionsDir, sessionId);

  console.log(`Session initialized: ${sessionId}`);
  console.log(`Path: ${workDir}`);
  console.log(`\nNext steps:`);
  console.log(`1. Run /brainstorming to clarify the spec`);
  console.log(`2. Save output to ${path.join(grillDir, 'resume.md')}`);
  console.log(`3. Then run /gps plan`);
}

const featureName = process.argv[2];
if (!featureName) {
  console.error('Usage: /gps start <feature-name>');
  process.exit(1);
}

startSession(featureName);
```

**Key changes from the old version:**
1. Date format in header comment: `YYYYMMDD__<feature-name>/` → `YYYY-MM-DD__<feature-name>/`
2. Load `01-grill-resume.md` template instead of hardcoding it
3. Render template with `renderTemplate()`, filling in 'feature-name' and 'timestamp'
4. Call `setCurrentSession(sessionsDir, sessionId)` to write the pointer file
5. Import the shared modules: `require('./lib/templates')` and `require('./lib/session-store')`

**Test it:**
1. Delete any existing `.work/` directory: `rm -rf .work`
2. Run: `node scripts/start-session.js "test-feature"`
3. Verify output:
   - Prints `Session initialized: <today-YYYY-MM-DD>__test-feature`
   - Directory `.work/sessions/<YYYY-MM-DD>__test-feature/` exists
   - File `.work/sessions/.current-session` contains the session ID
   - File `.work/sessions/<YYYY-MM-DD>__test-feature>/01-grill/resume.md` exists and contains the full template with `{{ feature-name }}` → "test-feature" and `{{ timestamp }}` → ISO timestamp, and all other `{{ ... }}` prompts left intact (like `{{ What are we solving? }}`, `## Open Questions`, etc.)

**Commit:**
`git add scripts/start-session.js && git commit -m "fix: render resume.md from templates/, set current-session pointer, fix date format comment"`

**Report to:**
.superpowers/sdd/2026-09-16-fix-gps-build-inconsistencies/task-4-report.md

When done, post only:
- Status (one word)
- Commits (hash space message)
- One-line manual test summary
- Any concerns
