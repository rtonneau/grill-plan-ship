# Fix gps Build Inconsistencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six documented inconsistencies between `.build-scripts/gps-build-powershell.md` (the build recipe) and the actual `grill-plan-ship` plugin artifacts (`SKILL.md`, `scripts/*.js`), and bring the doc back in sync so it can be trusted as the source of truth again.

**Architecture:** Introduce two small shared modules (`scripts/lib/templates.js`, `scripts/lib/session-store.js`) used by all four command scripts, so template rendering, "current session" resolution, and phase bookkeeping each have one correct implementation instead of four copy-pasted ones. Vendor the `templates/` directory (currently untracked in the parent repo) into this branch as the single source of markdown templates. Then fix the PowerShell heredoc escaping bug in the build doc and update every doc passage that disagrees with the corrected behavior.

**Tech Stack:** Node.js (CommonJS, `fs`/`path`, no dependencies), PowerShell 7 heredocs in the build doc, Markdown templates.

**Spec:** `c:\DEV\AICODE\grill-plan-ship\.build-scripts\gps-build-powershell.md` (build recipe — this plan corrects and re-syncs it), user-reported inconsistency list (see below).

## Global Constraints

- No new npm dependencies — use only Node's built-in `fs`/`path`.
- Preserve the existing CLI contract: `node scripts/start-session.js <feature-name>`, `node scripts/plan.js`, `node scripts/ticket.js <number>`, `node scripts/finish.js` must keep working with no new required arguments.
- Session ID format stays `YYYY-MM-DD__<slug>` (matches current code behavior) — fix documentation to match, not the reverse, since changing the code would invalidate already-created session directories on disk.
- Template placeholder syntax stays `{{ key }}`; only known keys (e.g. `feature-name`, `timestamp`, `N`, `slug`) get substituted — unrecognized placeholders (author-facing prompts like `{{ What are we solving? }}`) must be left intact for the human/Claude to fill in later.
- `templates/*.md` content itself is already correct (plain markdown, no PowerShell escaping involved) — only the scripts that generate content from them, and the build doc's heredocs, need fixing.

---

## Background: root causes (read before starting)

1. **`YYYYMMDD` vs `YYYY-MM-DD`** — `start-session.js` uses `new Date().toISOString().split('T')[0]` -> `YYYY-MM-DD`. `SKILL.md`, `start-session.js`'s own header comment, and the build doc all say `YYYYMMDD` in six total places (5 in this worktree: `SKILL.md` x4, `start-session.js` header x1; plus the build doc has its own 6 occurrences). Docs will be corrected to say `YYYY-MM-DD`.

2. **`plan.js` doesn't read `resume.md`** — it only calls `fs.existsSync(resumePath)`, never `fs.readFileSync`. Fix: read the content and reject if the grill phase was never actually filled in (still contains unresolved `{{ ... }}` placeholders from the template).

3. **Hardcoded templates instead of `templates/*.md`** — all four scripts embed template strings inline that have drifted from the real files in `templates/` (missing sections, different field names). Fix: load and render the real template files via a shared helper.

4. **Implementation log mismatch** — direct consequence of #3: `ticket.js`'s inline `logTemplate` lacks the `Blockers / Challenges` section and uses `## Test Results` instead of `## Local Test Result` compared to `templates/03-implement-log.md`. Fixed automatically once `ticket.js` uses the real template.

5. **"Current session" picked by directory-name sort** — `plan.js`, `ticket.js`, `finish.js` all do `fs.readdirSync(sessionsDir).sort().reverse()[0]`. Two sessions started the same day sort by slug, not by creation order/intent, and can silently pick the wrong one. Fix: write an explicit `.current-session` pointer file when a session starts, resolved by a shared helper with a documented fallback (most recent `created_at` from each session's config) for sessions created before this fix.

6. **`phases_completed` can duplicate on re-run** — `plan.js` and `finish.js` unconditionally `.push()` a phase name every run. Fix: shared `markPhaseCompleted(config, phase)` helper that only pushes if not already present.

7. **Backticks wrongly (and inconsistently) escaped in the build doc** — Inside a PowerShell `@"..."@` (double-quoted here-string), a literal backtick must be written as two backticks; a single backslash-backtick is not a valid escape at all and leaks a literal backslash into the output. The doc gets this right in the `SKILL.md` section (uses double backticks) but wrong everywhere else (single backslash-backtick, and even a triple escaped form for fenced code blocks in the plan.js ticket template) — confirmed by the actual generated `README.md` in the parent repo, which contains literal backslash-backtick sequences. Fix: convert every here-string in the doc that contains backticks or JS `${...}` to a **single-quoted** here-string (`@'...'@`), which needs no escaping for either character at all — eliminating the bug class instead of patching individual escapes.

---

## File Structure

- Create: `scripts/lib/templates.js` — `loadTemplate(fileName)`, `renderTemplate(content, vars)`.
- Create: `scripts/lib/session-store.js` — `setCurrentSession`, `getCurrentSessionId`, `markPhaseCompleted`.
- Create: `templates/01-grill-resume.md`, `templates/02-plan.md`, `templates/02-ticket.md`, `templates/03-implement-log.md` — vendored from the parent repo's untracked copies (content unchanged, already correct).
- Modify: `scripts/start-session.js` — fix header comment date format, render `templates/01-grill-resume.md`, write the `.current-session` pointer.
- Modify: `scripts/plan.js` — resolve current session via `session-store`, actually read+validate `resume.md`, render `templates/02-plan.md` and `templates/02-ticket.md`, use `markPhaseCompleted`.
- Modify: `scripts/ticket.js` — resolve current session via `session-store`, render `templates/03-implement-log.md`.
- Modify: `scripts/finish.js` — resolve current session via `session-store`, use `markPhaseCompleted`.
- Modify: `SKILL.md` — `YYYYMMDD` -> `YYYY-MM-DD` (4 occurrences), document the `.current-session` pointer file.
- Create: `.build-scripts/gps-build-powershell.md` — vendored from the parent repo with all fixes applied (date format, here-string escaping, resume.md read, template usage, current-session resolution, phase dedup).

---

### Task 1: Vendor the `templates/` directory

**Files:**
- Create: `templates/01-grill-resume.md`
- Create: `templates/02-plan.md`
- Create: `templates/02-ticket.md`
- Create: `templates/03-implement-log.md`
- Test: manual (`Step 6` below exercises these files end-to-end)

**Interfaces:**
- Produces: four on-disk markdown files under `templates/`, each with `{{ key }}`-style placeholders, consumed by `scripts/lib/templates.js` (Task 2) via `loadTemplate(fileName)`.

- [ ] **Step 1: Create `templates/01-grill-resume.md`**

```markdown
# Session: {{ feature-name }}

**Date:** {{ timestamp }}
**Status:** Grill phase complete

## Problem Statement

{{ What are we solving? What's broken or missing? }}

## Context & Constraints

- **Current behavior:** {{ How does it work now? }}
- **Pain point:** {{ What's the issue? }}
- **Dependencies:** {{ What must we keep/change? }}
- **Tech stack:** {{ Relevant libraries, frameworks }}

## Success Metrics

- {{ Clear, testable criterion 1 }}
- {{ Criterion 2 }}
- {{ Criterion 3 }}

## Architecture & Approach

{{ Proposed solution at a high level }}

## Assumptions & Trade-offs

{{ What are we assuming? What are we NOT doing? }}

## Open Questions

{{ Any unresolved questions or uncertainties? }}

## Notes

{{ Additional notes or observations from the grill phase }}
```

- [ ] **Step 2: Create `templates/02-plan.md`**

```markdown
# Implementation Plan

**Session:** {{ feature-name }}
**Date:** {{ timestamp }}
**Estimated effort:** {{ N hours/days }}

## Strategy

{{ High-level approach: what's the sequence? Why this order? Any blockers? }}

## Tickets Overview

- **Ticket 1:** {{ What does it accomplish? }}
- **Ticket 2:** {{ }}
- **Ticket 3:** {{ }}
- **Ticket 4:** {{ }}

## Sequencing Rationale

{{ Why this order? Dependencies? }}

## Risks & Mitigation

- **Risk:** {{ }} -> **Mitigation:** {{ }}

## Assumptions

- {{ Assumptions about dependencies, environment, or constraints }}
```

- [ ] **Step 3: Create `templates/02-ticket.md`**

````markdown
# Ticket {{ N }}: {{ slug }}

**Acceptance Criteria:**
- [ ] {{ Criterion 1 (testable) }}
- [ ] {{ Criterion 2 (testable) }}
- [ ] {{ Criterion 3 (testable) }}

**Files to Touch:**
- `{{ path }}`
- `{{ path }}`

**Verification Step:**

Run:
```bash
{{ command }}
```

Expected:
{{ output }}

**Notes:**

{{ Anything Claude Code should know before implementing }}
````

- [ ] **Step 4: Create `templates/03-implement-log.md`**

````markdown
# Ticket {{ N }} Implementation

**Status:** In Progress / Done

## Commits

- {{ commit hash }} {{ message }}

## Local Test Result

```
{{ test output }}
```

## Review Notes

{{ Any findings during self-review }}

## Time Spent

{{ ~X hours }}

## Blockers / Challenges

{{ Any issues encountered during implementation }}
````

- [ ] **Step 5: Commit**

```bash
git add templates/
git commit -m "docs: vendor markdown templates used by gps scripts"
```

---

### Task 2: Add `scripts/lib/templates.js`

**Files:**
- Create: `scripts/lib/templates.js`
- Test: `scripts/lib/templates.test.js` (plain Node assertions, no test framework is present in the repo)

**Interfaces:**
- Produces: `loadTemplate(fileName: string): string`, `renderTemplate(content: string, vars: Record<string,string>): string` — used by `start-session.js`, `plan.js`, `ticket.js` (Tasks 4-6).

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/lib/templates.test.js
const assert = require('assert');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./templates');

// renderTemplate substitutes only known keys, leaves the rest untouched
const rendered = renderTemplate('# {{ title }}\n\n{{ unknown placeholder }}', { title: 'Hello' });
assert.strictEqual(rendered, '# Hello\n\n{{ unknown placeholder }}');

// loadTemplate reads a real file from templates/ relative to the project root
const resumeTemplate = loadTemplate('01-grill-resume.md');
assert.ok(resumeTemplate.includes('{{ feature-name }}'), 'expected resume template to contain {{ feature-name }} placeholder');

console.log('templates.test.js: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/lib/templates.test.js`
Expected: FAIL with `Cannot find module './templates'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/lib/templates.js
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

function loadTemplate(fileName) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, fileName), 'utf-8');
}

function renderTemplate(content, vars) {
  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

module.exports = { loadTemplate, renderTemplate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/lib/templates.test.js`
Expected: `templates.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/templates.js scripts/lib/templates.test.js
git commit -m "feat: add shared template loader/renderer for gps scripts"
```

---

### Task 3: Add `scripts/lib/session-store.js`

**Files:**
- Create: `scripts/lib/session-store.js`
- Test: `scripts/lib/session-store.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `setCurrentSession(sessionsDir, sessionId): void`, `getCurrentSessionId(sessionsDir): string | null`, `markPhaseCompleted(config, phase): void` — used by `start-session.js` (sets pointer), `plan.js`/`ticket.js`/`finish.js` (resolve session, dedupe phases) in Tasks 4-6.

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/lib/session-store.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  setCurrentSession,
  getCurrentSessionId,
  markPhaseCompleted,
} = require('./session-store');

const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-session-store-'));

// No pointer, no sessions -> null
assert.strictEqual(getCurrentSessionId(sessionsDir), null);

// Two sessions created same day, different feature slugs.
// Directory-name sort would pick "b-feature" (lexically greatest); the
// explicit pointer must override that and pick "a-feature" instead.
fs.mkdirSync(path.join(sessionsDir, '2026-09-16__a-feature'));
fs.writeFileSync(
  path.join(sessionsDir, '2026-09-16__a-feature', '.session-config.json'),
  JSON.stringify({ created_at: '2026-09-16T10:00:00.000Z' })
);
fs.mkdirSync(path.join(sessionsDir, '2026-09-16__b-feature'));
fs.writeFileSync(
  path.join(sessionsDir, '2026-09-16__b-feature', '.session-config.json'),
  JSON.stringify({ created_at: '2026-09-16T11:00:00.000Z' })
);

setCurrentSession(sessionsDir, '2026-09-16__a-feature');
assert.strictEqual(getCurrentSessionId(sessionsDir), '2026-09-16__a-feature');

// Pointer removed -> falls back to most recent created_at (b-feature)
fs.unlinkSync(path.join(sessionsDir, '.current-session'));
assert.strictEqual(getCurrentSessionId(sessionsDir), '2026-09-16__b-feature');

// markPhaseCompleted only pushes a phase once
const config = { phases_completed: [] };
markPhaseCompleted(config, 'grill');
markPhaseCompleted(config, 'grill');
assert.deepStrictEqual(config.phases_completed, ['grill']);

fs.rmSync(sessionsDir, { recursive: true, force: true });
console.log('session-store.test.js: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/lib/session-store.test.js`
Expected: FAIL with `Cannot find module './session-store'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/lib/session-store.js
const fs = require('fs');
const path = require('path');

const CURRENT_SESSION_FILENAME = '.current-session';

function setCurrentSession(sessionsDir, sessionId) {
  fs.writeFileSync(path.join(sessionsDir, CURRENT_SESSION_FILENAME), sessionId, 'utf-8');
}

function listSessionDirs(sessionsDir) {
  return fs.readdirSync(sessionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function readCreatedAt(sessionsDir, sessionId) {
  const configPath = path.join(sessionsDir, sessionId, '.session-config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')).created_at || null;
  } catch (_err) {
    return null;
  }
}

function mostRecentByCreatedAt(sessionsDir) {
  const sessions = listSessionDirs(sessionsDir);
  if (sessions.length === 0) return null;

  const withTimestamps = sessions.map((name) => ({
    name,
    createdAt: readCreatedAt(sessionsDir, name),
  }));

  withTimestamps.sort((a, b) => {
    if (a.createdAt && b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    if (a.createdAt) return -1;
    if (b.createdAt) return 1;
    return a.name < b.name ? 1 : -1;
  });

  return withTimestamps[0].name;
}

function getCurrentSessionId(sessionsDir) {
  const pointerPath = path.join(sessionsDir, CURRENT_SESSION_FILENAME);
  if (fs.existsSync(pointerPath)) {
    const sessionId = fs.readFileSync(pointerPath, 'utf-8').trim();
    if (sessionId && fs.existsSync(path.join(sessionsDir, sessionId))) {
      return sessionId;
    }
  }
  return mostRecentByCreatedAt(sessionsDir);
}

function markPhaseCompleted(config, phase) {
  if (!config.phases_completed.includes(phase)) {
    config.phases_completed.push(phase);
  }
}

module.exports = {
  CURRENT_SESSION_FILENAME,
  setCurrentSession,
  getCurrentSessionId,
  markPhaseCompleted,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/lib/session-store.test.js`
Expected: `session-store.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/session-store.js scripts/lib/session-store.test.js
git commit -m "feat: resolve current gps session via explicit pointer, not name sort"
```

---

### Task 4: Fix `scripts/start-session.js`

**Files:**
- Modify: `scripts/start-session.js`
- Test: manual CLI run (Step 2 below)

**Interfaces:**
- Consumes: `loadTemplate`, `renderTemplate` from `./lib/templates` (Task 2); `setCurrentSession` from `./lib/session-store` (Task 3).
- Produces: `.work/sessions/.current-session` pointer at the `sessionsDir` level (sibling of session directories) so `plan.js`/`ticket.js`/`finish.js` can read it — matches the `sessionsDir` parameter shape used in Task 3's tests.

- [ ] **Step 1: Replace the file contents**

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

- [ ] **Step 2: Run it to verify manually**

```bash
rm -rf /tmp/gps-manual-test && mkdir -p /tmp/gps-manual-test && cd /tmp/gps-manual-test
node <path-to-repo>/scripts/start-session.js "manual-test-feature"
cat .work/sessions/.current-session
cat .work/sessions/*/01-grill/resume.md
```

Expected: prints `Session initialized: <today-YYYY-MM-DD>__manual-test-feature`; `.current-session` contains that same session id; `resume.md` contains the full template (with `## Open Questions` / `## Notes` sections) with `{{ feature-name }}` and `{{ timestamp }}` filled in and all other `{{ ... }}` prompts left intact.

- [ ] **Step 3: Commit**

```bash
git add scripts/start-session.js
git commit -m "fix: render resume.md from templates/, set current-session pointer, fix date format comment"
```

---

### Task 5: Fix `scripts/plan.js`

**Files:**
- Modify: `scripts/plan.js`
- Test: manual CLI run (Step 2 below), reusing the session from Task 4's manual test

**Interfaces:**
- Consumes: `loadTemplate`, `renderTemplate` from `./lib/templates`; `getCurrentSessionId`, `markPhaseCompleted` from `./lib/session-store`.
- Produces: same `02-plan/plan.md` + `02-plan/tickets/NN-[slug].md` outputs as before, now rendered from `templates/02-plan.md` / `templates/02-ticket.md`.

- [ ] **Step 1: Replace the file contents**

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

- [ ] **Step 2: Run it to verify manually**

```bash
cd /tmp/gps-manual-test
node <path-to-repo>/scripts/plan.js
# Expected to FAIL here: resume.md still has unfilled placeholders
sed -i 's/{{[^}]*}}/filled in/g' .work/sessions/*/01-grill/resume.md
node <path-to-repo>/scripts/plan.js
# Expected to SUCCEED this time
cat .work/sessions/*/02-plan/plan.md
cat .work/sessions/*/.session-config.json
node <path-to-repo>/scripts/plan.js
cat .work/sessions/*/.session-config.json
```

Expected: first run exits 1 with the "unfilled placeholders" message; after filling them in, the second run succeeds and `plan.md` shows the full template rendered with the feature name; running `plan.js` a second time afterward does **not** add a second `"grill"` entry to `phases_completed`.

- [ ] **Step 3: Commit**

```bash
git add scripts/plan.js
git commit -m "fix: plan.js reads and validates resume.md, renders templates/, dedupes phases_completed"
```

---

### Task 6: Fix `scripts/ticket.js`

**Files:**
- Modify: `scripts/ticket.js`
- Test: manual CLI run (Step 2 below)

**Interfaces:**
- Consumes: `loadTemplate`, `renderTemplate` from `./lib/templates`; `getCurrentSessionId` from `./lib/session-store`.
- Produces: `commit-log.md` matching `templates/03-implement-log.md` exactly (fixes the log-format mismatch).

- [ ] **Step 1: Replace the file contents**

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

- [ ] **Step 2: Run it to verify manually**

```bash
cd /tmp/gps-manual-test
node <path-to-repo>/scripts/ticket.js 1
cat .work/sessions/*/03-implement/01-*/commit-log.md
diff <(cat .work/sessions/*/03-implement/01-*/commit-log.md) <(sed "s/{{ N }}/01/" <path-to-repo>/templates/03-implement-log.md)
```

Expected: `commit-log.md` matches `templates/03-implement-log.md` (with `{{ N }}` replaced by `01`) exactly, including the `## Blockers / Challenges` section that the old hardcoded template was missing.

- [ ] **Step 3: Commit**

```bash
git add scripts/ticket.js
git commit -m "fix: ticket.js renders commit-log.md from templates/03-implement-log.md"
```

---

### Task 7: Fix `scripts/finish.js`

**Files:**
- Modify: `scripts/finish.js`
- Test: manual CLI run (Step 2 below)

**Interfaces:**
- Consumes: `getCurrentSessionId`, `markPhaseCompleted` from `./lib/session-store`.

- [ ] **Step 1: Replace the file contents**

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

- [ ] **Step 2: Run it to verify manually**

```bash
cd /tmp/gps-manual-test
node <path-to-repo>/scripts/finish.js
cat .work/sessions/*/.session-config.json
node <path-to-repo>/scripts/finish.js
cat .work/sessions/*/.session-config.json
```

Expected: `phases_completed` contains `"implement"` exactly once even after running `finish.js` twice.

- [ ] **Step 3: Commit**

```bash
git add scripts/finish.js
git commit -m "fix: finish.js dedupes phases_completed and resolves session via pointer"
```

---

### Task 8: Fix `SKILL.md` documentation

**Files:**
- Modify: `SKILL.md`

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Replace all four `YYYYMMDD` occurrences with `YYYY-MM-DD`**

In `SKILL.md`, change each of these four lines from `YYYYMMDD` to `YYYY-MM-DD` in the session-path pattern:
- The "All output lives in ... session path" line under Overview.
- The three "Creates ... session-path" bullets under `/gps start <feature-name>`.

- [ ] **Step 2: Document the current-session pointer**

Add a line under the `/gps start` section's "What it does" list (after the `01-grill/` bullet):

```markdown
5. Writes `.work/sessions/.current-session` pointing at this session, so later commands operate on it regardless of what other sessions exist
```

And change the `/gps plan` section's first "What it does" bullet from reading a `CURRENT` placeholder path to:

```markdown
1. Resolves the current session via `.work/sessions/.current-session`, then reads its `01-grill/resume.md` (fails if it still contains unfilled `{{ ... }}` placeholders)
```

- [ ] **Step 3: Commit**

```bash
git add SKILL.md
git commit -m "docs: fix YYYYMMDD to match actual YYYY-MM-DD session ids, document current-session pointer"
```

---

### Task 9: Fix the build doc's PowerShell here-string escaping bug

**Files:**
- Create: `.build-scripts/gps-build-powershell.md` (vendored from the parent repo, then fixed — this branch does not currently have this file)

**Interfaces:**
- None (documentation only), but this doc must describe the code that Tasks 1-8 actually produced.

- [ ] **Step 1: Copy the current doc into this branch as a starting point**

```bash
mkdir -p .build-scripts
cp "$(cd .. && pwd)/../grill-plan-ship/.build-scripts/gps-build-powershell.md" .build-scripts/gps-build-powershell.md 2>/dev/null || true
```

If the copy source isn't reachable from this worktree, recreate `.build-scripts/gps-build-powershell.md` using the parent repo's current version as the starting point (apply the diffs below to whichever copy you start from).

- [ ] **Step 2: Fix every here-string that embeds backticks or JS `${...}`**

For each PowerShell block (identified by its `$variableName = @"..."@` opener), convert the opener/closer from double-quoted to single-quoted, and then, inside that block:
- Replace every escaped-backtick sequence (backslash followed by a backtick) with a plain backtick.
- Replace every triple escaped-backtick sequence (used for fenced code blocks in the plan.js ticket template) with a plain triple-backtick fence.
- Replace every escaped-dollar sequence with a plain `$`.

Apply this to these here-strings (search for their opener to locate them):
- `$skillContent = @"..."@` (Step 3, SKILL.md) — already uses correctly-doubled backticks for the `/gps ...` command spans; still switch its opener to single-quoted and de-escape the two escaped-backtick occurrences inside the "Installation" PowerShell sample so the whole block uses one consistent (and simpler) style.
- `$handler1 = @"..."@` through `$handler4 = @"..."@` (Step 4, the four JS handler scripts) — every backtick and `${...}` in these is currently escaped; switch to single-quoted and de-escape.
- `$template1 = @"..."@` through `$template4 = @"..."@` (Step 5, the four markdown templates) — `$template3` and `$template4` contain fenced code blocks that must become plain triple-backtick fences.
- `$readmeContent = @"..."@` (Step 6, README.md) — this is the block that produced the confirmed-broken `README.md` in the parent repo; same fix.

- [ ] **Step 3: Update Step 4's handler code samples to match Tasks 4-7**

Replace the `$handler1`/`$handler2`/`$handler3`/`$handler4` PowerShell blocks' JS payloads with the final `start-session.js` / `plan.js` / `ticket.js` / `finish.js` contents from Tasks 4-7 (including the new `require('./lib/templates')` / `require('./lib/session-store')` calls), and add a new sub-step before Handler 1 that creates `scripts/lib/templates.js` and `scripts/lib/session-store.js` (content from Tasks 2-3).

- [ ] **Step 4: Update Step 5 to note templates are consumed, not just written**

Add a sentence after the four template-creation blocks: "These four files are read at runtime by `scripts/lib/templates.js` — editing a template changes what `/gps start`, `/gps plan`, and `/gps ticket` generate without touching the JS handlers."

- [ ] **Step 5: Fix the six `YYYYMMDD` occurrences**

Replace `YYYYMMDD` with `YYYY-MM-DD` at each of the 6 locations found via `grep -n YYYYMMDD .build-scripts/gps-build-powershell.md` (SKILL.md section x4, handler1 comment x1, README.md section x1) — same replacement as Task 8, Step 1.

- [ ] **Step 6: Add a note on the current-session pointer and phase dedup**

In Step 4's prose (after Handler 1), add: "Handler 1 also writes `.work/sessions/.current-session` so Handlers 2-4 resolve the session deterministically instead of sorting directory names." In Step 4's Handler 2/Handler 4 prose, add: "`phases_completed` entries are only added once — re-running `/gps plan` or `/gps finish` is idempotent."

- [ ] **Step 7: Commit**

```bash
git add .build-scripts/gps-build-powershell.md
git commit -m "docs: fix backtick/dollar here-string escaping and re-sync build doc with fixed scripts"
```

---

## Self-Review Notes

- **Spec coverage:** all 6 user-reported inconsistencies map to tasks — date format (Tasks 4, 8, 9), `resume.md` not read (Task 5), hardcoded templates (Tasks 1, 4-6, 9), implementation log mismatch (Task 6, resolved as a consequence of using the real template), current-session-by-sort (Tasks 3-7), `phases_completed` duplication (Tasks 3, 5, 7). Backtick misuse (Task 9) is the doc-wide issue named separately in the request.
- **No placeholders:** every task's code steps contain full file contents, not diffs-with-elisions, except Task 9 (a documentation-only meta-task) which necessarily describes edits to a large existing prose document rather than reproducing all ~1090 lines twice — its steps are still concrete (exact strings to find/replace, exact new sentences to add).
- **Type/name consistency checked:** `getCurrentSessionId(sessionsDir)` / `setCurrentSession(sessionsDir, sessionId)` / `markPhaseCompleted(config, phase)` / `loadTemplate(fileName)` / `renderTemplate(content, vars)` are named identically across Tasks 2-3 (definitions) and Tasks 4-7 (call sites).
