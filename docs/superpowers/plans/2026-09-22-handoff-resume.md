# Session Handoff & Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/gps handoff` (save an in-flight checkpoint before stopping) and `/gps resume` (catch up on a session using that checkpoint plus live state) to the grill-plan-ship plugin, and surface a `hasHandoff` hint from `/gps status`.

**Architecture:** Two new thin CLI scripts (`scripts/handoff.js`, `scripts/resume.js`) backed by two new lib modules (`scripts/lib/handoff.js`, `scripts/lib/resume.js`), following the exact split every existing gps command uses (CLI prints JSON / renders a template; Claude Code does the narrative synthesis). Git helpers (`readRecentCommits`, new `readGitStatusSummary`) are extracted from `scripts/lib/status.js` into a shared `scripts/lib/git.js` so `status.js`, `handoff.js`, and `resume.js` all use the same, single-tested implementation.

**Tech Stack:** Node.js (`fs`, `path`, `child_process.execSync` only — no external dependencies, per this repo's `CLAUDE.md`), plain `assert`-based test files run directly with `node <file>.test.js` (this repo's existing pattern — no test framework).

**Spec:** `docs/superpowers/specs/2026-09-22-handoff-resume-design.md`

## Global Constraints

- No external dependencies — Node's `fs`/`path`/`child_process` only.
- Console feedback uses the existing conventions in this codebase (plain `console.log`/`console.error`, no emoji required for these two commands since neither is a pass/fail action — match the phrasing style of `status.js`/`ticket.js`, not `ship`'s ✅/❌ pattern).
- Timestamps are ISO 8601 (`new Date().toISOString()`).
- Template placeholders use the existing `{{ key }}` convention (`scripts/lib/templates.js`); a key not present in the vars object passed to `renderTemplate` is left untouched, which is how narrative sections stay blank for Claude Code to fill in.
- `HANDOFF.md` is a single file per session, overwritten on every `/gps handoff` run — no history log.
- Both commands are session-scoped (require an active `.work/sessions/.current-session`) and explicit-only — no automatic/implicit invocation from any other command.
- Follow the existing lib/CLI split exactly: a `scripts/lib/<name>.js` module exports pure, testable functions taking `(sessionDir, projectRoot)` or similar explicit args (no `process.cwd()` calls inside lib modules); the matching `scripts/<name>.js` is a thin wrapper that resolves the current session, calls the lib function, and prints/writes the result. Only lib modules get `.test.js` files — the CLI wrappers themselves are not unit-tested, matching `status.js`/`ticket.js`/`start-session.js` today.

---

### Task 1: Extract shared git helpers into `scripts/lib/git.js`

**Files:**
- Create: `scripts/lib/git.js`
- Create: `scripts/lib/git.test.js`
- Modify: `scripts/lib/status.js` (replace its inline `readRecentCommits` with an import from `./git`)

**Interfaces:**
- Produces: `readRecentCommits(projectRoot, sessionDir): string[]` — unchanged behavior, moved verbatim from `scripts/lib/status.js`.
- Produces: `readGitStatusSummary(projectRoot, sessionDir): Array<{ indexStatus: string, worktreeStatus: string, path: string }>` — new. Runs `git status --porcelain` scoped to `sessionDir`; each porcelain line `XY path` becomes `{ indexStatus: X, worktreeStatus: Y, path }`. Returns `[]` on any error (not a git repo, git missing, etc.) — never throws.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/git.test.js`:

```js
// scripts/lib/git.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { readRecentCommits, readGitStatusSummary } = require('./git');

const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-git-'));
const sessionDir = path.join(projectRoot, '.work', 'sessions', '2026-09-22__test-feature');
fs.mkdirSync(sessionDir, { recursive: true });

// Not a git repo yet -> both helpers degrade to empty arrays, never throw.
assert.deepStrictEqual(readRecentCommits(projectRoot, sessionDir), []);
assert.deepStrictEqual(readGitStatusSummary(projectRoot, sessionDir), []);

execSync('git init -q', { cwd: projectRoot });
execSync('git config user.email "test@example.com"', { cwd: projectRoot });
execSync('git config user.name "Test"', { cwd: projectRoot });

// Untracked file inside the session dir shows up as a status entry.
fs.writeFileSync(path.join(sessionDir, 'notes.txt'), 'wip\n');
let statusResult = readGitStatusSummary(projectRoot, sessionDir);
assert.strictEqual(statusResult.length, 1);
assert.strictEqual(statusResult[0].indexStatus, '?');
assert.strictEqual(statusResult[0].worktreeStatus, '?');
assert.ok(statusResult[0].path.endsWith('notes.txt'));

// Commit it -> status goes clean, and the commit shows up in the log.
execSync('git add .', { cwd: projectRoot });
execSync('git commit -q -m "add notes"', { cwd: projectRoot });

assert.deepStrictEqual(readGitStatusSummary(projectRoot, sessionDir), []);
const log = readRecentCommits(projectRoot, sessionDir);
assert.strictEqual(log.length, 1);
assert.ok(log[0].includes('add notes'));

// Modify the tracked file -> shows as modified, not untracked.
fs.writeFileSync(path.join(sessionDir, 'notes.txt'), 'wip again\n');
statusResult = readGitStatusSummary(projectRoot, sessionDir);
assert.strictEqual(statusResult.length, 1);
assert.strictEqual(statusResult[0].indexStatus, ' ');
assert.strictEqual(statusResult[0].worktreeStatus, 'M');

fs.rmSync(projectRoot, { recursive: true, force: true });
console.log('git.test.js: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/lib/git.test.js`
Expected: FAIL with `Cannot find module './git'`.

- [ ] **Step 3: Create `scripts/lib/git.js`**

```js
// scripts/lib/git.js
const path = require('path');
const { execSync } = require('child_process');

function readRecentCommits(projectRoot, sessionDir) {
  const relPath = path.relative(projectRoot, sessionDir);
  try {
    const output = execSync(`git log --oneline -n 5 -- "${relPath}"`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch (_err) {
    return [];
  }
}

function readGitStatusSummary(projectRoot, sessionDir) {
  const relPath = path.relative(projectRoot, sessionDir);
  try {
    const output = execSync(`git status --porcelain -- "${relPath}"`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => ({
        indexStatus: line[0],
        worktreeStatus: line[1],
        path: line.slice(3),
      }));
  } catch (_err) {
    return [];
  }
}

module.exports = { readRecentCommits, readGitStatusSummary };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/lib/git.test.js`
Expected: PASS, prints `git.test.js: all assertions passed`.

- [ ] **Step 5: Point `scripts/lib/status.js` at the shared module**

In `scripts/lib/status.js`, remove the inline `readRecentCommits` function (and the now-unused `execSync` import if nothing else in the file uses it) and import it instead:

```js
// scripts/lib/status.js
const fs = require('fs');
const path = require('path');
const { listSessionDirs, getCurrentSessionId } = require('./session-store');
const { resolveWriteTarget } = require('./write-target');
const { listTickets } = require('./ticket-queue');
const { readRecentCommits } = require('./git');

function readConfig(sessionsDir, sessionId) {
  const configPath = path.join(sessionsDir, sessionId, '.session-config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (_err) {
    return null;
  }
}

function summarizeSession(sessionsDir, sessionId) {
  const config = readConfig(sessionsDir, sessionId);
  return {
    sessionId,
    featureName: config ? config.feature_name : null,
    createdAt: config ? config.created_at : null,
    status: config ? config.status : null,
    phasesCompleted: config ? config.phases_completed || [] : [],
  };
}

function buildStatusReport(sessionsDir, projectRoot) {
  const sessionIds = listSessionDirs(sessionsDir);
  const sessions = sessionIds.map((sessionId) => summarizeSession(sessionsDir, sessionId));

  const currentSessionId = getCurrentSessionId(sessionsDir);
  if (!currentSessionId) {
    return { sessions, current: null };
  }

  const sessionDir = path.join(sessionsDir, currentSessionId);
  const writeTarget = resolveWriteTarget(sessionDir);
  const { tickets, nextPending } = listTickets(sessionDir);
  const gitLog = readRecentCommits(projectRoot, sessionDir);

  return {
    sessions,
    current: {
      sessionId: currentSessionId,
      writeTarget,
      tickets,
      nextPending,
      gitLog,
    },
  };
}

module.exports = { buildStatusReport };
```

- [ ] **Step 6: Run the existing status test to confirm no regression**

Run: `node scripts/lib/status.test.js`
Expected: PASS, prints `status.test.js: all assertions passed`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/git.js scripts/lib/git.test.js scripts/lib/status.js
git commit -m "refactor: extract shared git helpers into scripts/lib/git.js"
```

---

### Task 2: Add `hasHandoff` to `/gps status`

**Files:**
- Modify: `scripts/lib/status.js`
- Modify: `scripts/lib/status.test.js`

**Interfaces:**
- Consumes: nothing new (uses `fs.existsSync` directly).
- Produces: `buildStatusReport(...).current.hasHandoff: boolean` — `true` when `<sessionDir>/HANDOFF.md` exists.

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/status.test.js`, right before the final `fs.rmSync(...)` cleanup line:

```js
// No handoff saved yet -> hasHandoff is false.
report = buildStatusReport(sessionsDir, projectRoot);
assert.strictEqual(report.current.hasHandoff, false);

// Saving one flips it to true.
fs.writeFileSync(path.join(newSessionDir, 'HANDOFF.md'), '# Handoff\n');
report = buildStatusReport(sessionsDir, projectRoot);
assert.strictEqual(report.current.hasHandoff, true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/lib/status.test.js`
Expected: FAIL — `report.current.hasHandoff` is `undefined`, not `false`.

- [ ] **Step 3: Add the field**

In `scripts/lib/status.js`, inside `buildStatusReport`, add the check and include it in the returned `current` object:

```js
  const sessionDir = path.join(sessionsDir, currentSessionId);
  const writeTarget = resolveWriteTarget(sessionDir);
  const { tickets, nextPending } = listTickets(sessionDir);
  const gitLog = readRecentCommits(projectRoot, sessionDir);
  const hasHandoff = fs.existsSync(path.join(sessionDir, 'HANDOFF.md'));

  return {
    sessions,
    current: {
      sessionId: currentSessionId,
      writeTarget,
      tickets,
      nextPending,
      gitLog,
      hasHandoff,
    },
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/lib/status.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/status.js scripts/lib/status.test.js
git commit -m "feat: surface hasHandoff flag from /gps status"
```

---

### Task 3: Add the `templates/handoff.md` template

**Files:**
- Create: `templates/handoff.md`

**Interfaces:**
- Produces: a template file consumed by `scripts/handoff.js` (Task 5) via `loadTemplate('handoff.md')` / `renderTemplate(...)`. Machine-fillable placeholder keys: `feature-name`, `session-id`, `timestamp`, `current-phase`, `active-ticket`, `git-status-summary`, `ticket-queue-summary`, `git-log`. All other `{{ ... }}` placeholders are narrative and must stay untouched by the script — Claude Code fills them directly after the script runs.

- [ ] **Step 1: Create the template**

```markdown
# Handoff: {{ feature-name }}

**Session:** {{ session-id }}
**Saved:** {{ timestamp }}
**Current phase:** {{ current-phase }}
**Active ticket:** {{ active-ticket }}

## Where I Stopped

{{ One or two sentences: what were you doing the moment you stopped? }}

## Reasoning So Far

{{ Approach taken, alternatives considered and rejected, and why }}

## Next Step

{{ The exact, concrete action to take first when resuming }}

## Open Questions

{{ Anything blocked on user input, or unresolved choices }}

## Settled Decisions (do not re-litigate)

{{ Choices already made and why }}

## Uncommitted Work

- **Git status:** {{ git-status-summary }}
- **Why not committed:** {{ reason, or "n/a" if git status is clean }}

## Machine State (auto-filled)

- **Ticket queue:** {{ ticket-queue-summary }}
- **Recent commits:** {{ git-log }}
```

- [ ] **Step 2: Verify it renders correctly against a scratch session**

There's no automated test for template files in this repo (`templates.js` itself is generic and already tested). Verify manually instead:

Run:
```bash
node -e "
const { loadTemplate, renderTemplate } = require('./scripts/lib/templates');
const out = renderTemplate(loadTemplate('handoff.md'), {
  'feature-name': 'test-feature',
  'session-id': '2026-09-22__test-feature',
  timestamp: new Date().toISOString(),
  'current-phase': 'ship',
  'active-ticket': '02-add-thing',
  'git-status-summary': 'clean',
  'ticket-queue-summary': '01-add-thing: done, 02-add-thing: pending',
  'git-log': 'abc123 add thing one',
});
console.log(out);
"
```

Expected: the metadata lines (`**Session:**`, `**Saved:**`, `**Current phase:**`, `**Active ticket:**`, the `Git status`/`Ticket queue`/`Recent commits` lines) show real values; every other `{{ ... }}` line (Where I Stopped, Reasoning So Far, Next Step, Open Questions, Settled Decisions, Why not committed) is printed unchanged, braces and all.

- [ ] **Step 3: Commit**

```bash
git add templates/handoff.md
git commit -m "feat: add handoff.md template"
```

---

### Task 4: Implement `scripts/lib/handoff.js`

**Files:**
- Create: `scripts/lib/handoff.js`
- Create: `scripts/lib/handoff.test.js`

**Interfaces:**
- Consumes: `readRecentCommits`, `readGitStatusSummary` from `./git` (Task 1); `resolveWriteTarget` from `./write-target`; `listTickets` from `./ticket-queue`.
- Produces:
  - `derivePhaseLabel(writeTarget, ticketQueue): string` — one of `'grill'`, `'plan'`, `'plan-not-started'`, `'ship'`, `'finish-pending'`, `'plan-complete'`.
  - `buildHandoffData(sessionDir, projectRoot): { sessionId, featureName, currentPhase, activeTicket, ticketQueueSummary, gitLog, gitStatus, timestamp }` — `activeTicket` is `` `${num}-${slug}` `` or `null`; `ticketQueueSummary` is `string[]` like `["01-add-thing: done", "02-add-thing: pending"]`.

Phase labels, derived from `resolveWriteTarget()`'s `{ target, reason }` (`scripts/lib/write-target.js`) and `listTickets()`'s `{ tickets, nextPending }` (`scripts/lib/ticket-queue.js`):

| `writeTarget.target` | `writeTarget.reason` | ticket queue | `currentPhase` |
|---|---|---|---|
| `'grill'` | — | — | `'grill'` |
| `'plan'` | — | — | `'plan'` |
| `'none'` | `'plan-not-started'` | — | `'plan-not-started'` |
| `'none'` | `'complete'` | `nextPending` present | `'ship'` |
| `'none'` | `'complete'` | no `nextPending`, `tickets.length > 0` | `'finish-pending'` |
| `'none'` | `'complete'` | `tickets.length === 0` | `'plan-complete'` (edge case fallback) |

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/handoff.test.js`:

```js
// scripts/lib/handoff.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildHandoffData, derivePhaseLabel } = require('./handoff');

function writeConfig(sessionDir, overrides) {
  fs.writeFileSync(
    path.join(sessionDir, '.session-config.json'),
    JSON.stringify({
      session_id: '2026-09-22__test-feature',
      feature_name: 'test-feature',
      created_at: '2026-09-22T10:00:00.000Z',
      phases_completed: [],
      status: 'grill-in-progress',
      ...overrides,
    })
  );
}

// -- derivePhaseLabel, tested directly against the {target, reason} / {tickets, nextPending} shapes --
assert.strictEqual(derivePhaseLabel({ target: 'grill' }, { tickets: [], nextPending: null }), 'grill');
assert.strictEqual(derivePhaseLabel({ target: 'plan' }, { tickets: [], nextPending: null }), 'plan');
assert.strictEqual(
  derivePhaseLabel({ target: 'none', reason: 'plan-not-started' }, { tickets: [], nextPending: null }),
  'plan-not-started'
);
assert.strictEqual(
  derivePhaseLabel({ target: 'none', reason: 'complete' }, { tickets: [{ num: '01' }], nextPending: { num: '01' } }),
  'ship'
);
assert.strictEqual(
  derivePhaseLabel({ target: 'none', reason: 'complete' }, { tickets: [{ num: '01' }], nextPending: null }),
  'finish-pending'
);
assert.strictEqual(
  derivePhaseLabel({ target: 'none', reason: 'complete' }, { tickets: [], nextPending: null }),
  'plan-complete'
);

// -- buildHandoffData, end-to-end against a real session directory --
const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-handoff-'));
const sessionDir = path.join(projectRoot, '.work', 'sessions', '2026-09-22__test-feature');
fs.mkdirSync(path.join(sessionDir, '01-grill'), { recursive: true });
writeConfig(sessionDir);
fs.writeFileSync(path.join(sessionDir, '01-grill', 'resume.md'), '# {{ feature-name }}\n');

// Grill still pending.
let data = buildHandoffData(sessionDir, projectRoot);
assert.strictEqual(data.sessionId, '2026-09-22__test-feature');
assert.strictEqual(data.featureName, 'test-feature');
assert.strictEqual(data.currentPhase, 'grill');
assert.strictEqual(data.activeTicket, null);
assert.deepStrictEqual(data.ticketQueueSummary, []);
assert.deepStrictEqual(data.gitLog, []);
assert.deepStrictEqual(data.gitStatus, []);
assert.ok(typeof data.timestamp === 'string' && data.timestamp.length > 0);

// Fill grill, add one pending ticket -> phase is 'ship'.
fs.writeFileSync(path.join(sessionDir, '01-grill', 'resume.md'), '# test-feature\n\nDone.\n');
const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
fs.mkdirSync(ticketsDir, { recursive: true });
fs.writeFileSync(path.join(sessionDir, '02-plan', 'plan.md'), '# Plan\n\nNo placeholders.\n');
fs.writeFileSync(path.join(ticketsDir, '01-add-thing.md'), '# Ticket 1: add-thing\n');

data = buildHandoffData(sessionDir, projectRoot);
assert.strictEqual(data.currentPhase, 'ship');
assert.strictEqual(data.activeTicket, '01-add-thing');
assert.deepStrictEqual(data.ticketQueueSummary, ['01-add-thing: pending']);

// Mark the ticket done -> phase is 'finish-pending', no active ticket.
const implDir = path.join(sessionDir, '03-implement', '01-add-thing');
fs.mkdirSync(implDir, { recursive: true });
fs.writeFileSync(path.join(implDir, 'commit-log.md'), '**Status:** ✅ Done\n');

data = buildHandoffData(sessionDir, projectRoot);
assert.strictEqual(data.currentPhase, 'finish-pending');
assert.strictEqual(data.activeTicket, null);
assert.deepStrictEqual(data.ticketQueueSummary, ['01-add-thing: done']);

fs.rmSync(projectRoot, { recursive: true, force: true });
console.log('handoff.test.js: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/lib/handoff.test.js`
Expected: FAIL with `Cannot find module './handoff'`.

- [ ] **Step 3: Create `scripts/lib/handoff.js`**

```js
// scripts/lib/handoff.js
const fs = require('fs');
const path = require('path');
const { resolveWriteTarget } = require('./write-target');
const { listTickets } = require('./ticket-queue');
const { readRecentCommits, readGitStatusSummary } = require('./git');

function derivePhaseLabel(writeTarget, ticketQueue) {
  if (writeTarget.target === 'grill') return 'grill';
  if (writeTarget.target === 'plan') return 'plan';
  if (writeTarget.reason === 'plan-not-started') return 'plan-not-started';
  // writeTarget.target === 'none' && writeTarget.reason === 'complete' from here on.
  if (ticketQueue.nextPending) return 'ship';
  if (ticketQueue.tickets.length > 0) return 'finish-pending';
  return 'plan-complete';
}

function buildHandoffData(sessionDir, projectRoot) {
  const config = JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-config.json'), 'utf-8'));
  const writeTarget = resolveWriteTarget(sessionDir);
  const ticketQueue = listTickets(sessionDir);
  const currentPhase = derivePhaseLabel(writeTarget, ticketQueue);
  const activeTicket = ticketQueue.nextPending
    ? `${ticketQueue.nextPending.num}-${ticketQueue.nextPending.slug}`
    : null;
  const ticketQueueSummary = ticketQueue.tickets.map(
    (t) => `${t.num}-${t.slug}: ${t.done ? 'done' : 'pending'}`
  );

  return {
    sessionId: config.session_id,
    featureName: config.feature_name,
    currentPhase,
    activeTicket,
    ticketQueueSummary,
    gitLog: readRecentCommits(projectRoot, sessionDir),
    gitStatus: readGitStatusSummary(projectRoot, sessionDir),
    timestamp: new Date().toISOString(),
  };
}

module.exports = { buildHandoffData, derivePhaseLabel };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/lib/handoff.test.js`
Expected: PASS, prints `handoff.test.js: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/handoff.js scripts/lib/handoff.test.js
git commit -m "feat: add buildHandoffData for /gps handoff"
```

---

### Task 5: Implement the `scripts/handoff.js` CLI

**Files:**
- Create: `scripts/handoff.js`

**Interfaces:**
- Consumes: `loadTemplate`, `renderTemplate` from `./lib/templates`; `getCurrentSessionId` from `./lib/session-store`; `buildHandoffData` from `./lib/handoff` (Task 4); the `templates/handoff.md` file (Task 3).
- Produces: writes `<sessionDir>/HANDOFF.md`; prints the `buildHandoffData` result as JSON to stdout for Claude Code to read before filling in the narrative sections.

- [ ] **Step 1: Create `scripts/handoff.js`**

```js
#!/usr/bin/env node

/**
 * /gps handoff
 *
 * Saves a checkpoint of the current session's in-flight state before
 * stopping work: auto-fills everything derivable from disk/git into
 * HANDOFF.md (phase, active ticket, ticket queue, recent commits,
 * uncommitted files), then leaves narrative placeholders for Claude Code
 * to fill in directly (where work stopped, reasoning so far, next step,
 * open questions, settled decisions, why anything is uncommitted).
 *
 * Single file per session — each run overwrites the previous HANDOFF.md.
 */

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { getCurrentSessionId } = require('./lib/session-store');
const { buildHandoffData } = require('./lib/handoff');

function formatGitStatus(gitStatus) {
  if (gitStatus.length === 0) return 'clean';
  return gitStatus.map((e) => `${e.indexStatus}${e.worktreeStatus} ${e.path}`).join(', ');
}

function formatList(items, emptyText) {
  return items.length === 0 ? emptyText : items.join(', ');
}

function main() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const currentSession = getCurrentSessionId(sessionsDir);

  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const sessionDir = path.join(sessionsDir, currentSession);
  const data = buildHandoffData(sessionDir, projectRoot);

  const rendered = renderTemplate(loadTemplate('handoff.md'), {
    'feature-name': data.featureName,
    'session-id': data.sessionId,
    timestamp: data.timestamp,
    'current-phase': data.currentPhase,
    'active-ticket': data.activeTicket || 'none',
    'git-status-summary': formatGitStatus(data.gitStatus),
    'ticket-queue-summary': formatList(data.ticketQueueSummary, 'no tickets yet'),
    'git-log': formatList(data.gitLog, 'no commits yet'),
  });

  const handoffPath = path.join(sessionDir, 'HANDOFF.md');
  fs.writeFileSync(handoffPath, rendered);

  console.log(`Handoff saved: ${handoffPath}`);
  console.log(JSON.stringify(data, null, 2));
  console.log(
    '\nFill in the remaining sections directly in HANDOFF.md before ending this session: ' +
    'Where I Stopped, Reasoning So Far, Next Step, Open Questions, Settled Decisions, ' +
    'and Why Not Committed (only if git status above is not "clean").'
  );
}

main();
```

- [ ] **Step 2: Verify it end-to-end against a real session**

Run (from a scratch/example project, or a throwaway repo — do not run against `grill-plan-ship`'s own `.work/`, which is gitignored and not meant to hold plugin-dev fixtures):

```bash
mkdir -p /tmp/gps-handoff-manual-check && cd /tmp/gps-handoff-manual-check
git init -q
node /path/to/grill-plan-ship/scripts/start-session.js "manual-check"
node /path/to/grill-plan-ship/scripts/handoff.js
cat .work/sessions/*/HANDOFF.md
```

Expected: `HANDOFF.md` exists with the metadata lines filled in (`current-phase` should read `grill`, since `start-session.js` alone leaves grill pending), and every narrative section still shows its raw `{{ ... }}` placeholder text, ready for Claude Code to fill in.

- [ ] **Step 3: Commit**

```bash
git add scripts/handoff.js
git commit -m "feat: add /gps handoff command"
```

---

### Task 6: Implement `scripts/lib/resume.js`

**Files:**
- Create: `scripts/lib/resume.js`
- Create: `scripts/lib/resume.test.js`

**Interfaces:**
- Consumes: `buildHandoffData` from `./handoff` (Task 4).
- Produces:
  - `parseHandoffMarkdown(content: string): { meta: Record<string,string>, sections: Record<string,string> }` — `meta` holds the top `**Key:** value` lines before the first `## Heading`; `sections` maps each `## Heading` to its trimmed body text.
  - `buildResumeReport(sessionDir, projectRoot): { handoff: { meta, sections } | null, live: ReturnType<typeof buildHandoffData>, drift: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/resume.test.js`:

```js
// scripts/lib/resume.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildResumeReport, parseHandoffMarkdown } = require('./resume');

// -- parseHandoffMarkdown, tested directly against a sample document --
const sample = [
  '# Handoff: test-feature',
  '',
  '**Session:** 2026-09-22__test-feature',
  '**Current phase:** ship',
  '**Active ticket:** 01-add-thing',
  '',
  '## Where I Stopped',
  '',
  'Debugging the flaky test.',
  '',
  '## Next Step',
  '',
  'Re-run the test in isolation.',
  '',
].join('\n');

const parsed = parseHandoffMarkdown(sample);
assert.strictEqual(parsed.meta['Session'], '2026-09-22__test-feature');
assert.strictEqual(parsed.meta['Current phase'], 'ship');
assert.strictEqual(parsed.meta['Active ticket'], '01-add-thing');
assert.strictEqual(parsed.sections['Where I Stopped'], 'Debugging the flaky test.');
assert.strictEqual(parsed.sections['Next Step'], 'Re-run the test in isolation.');

// -- buildResumeReport, end-to-end against a real session directory --
const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-resume-'));
const sessionDir = path.join(projectRoot, '.work', 'sessions', '2026-09-22__test-feature');
fs.mkdirSync(path.join(sessionDir, '01-grill'), { recursive: true });
fs.writeFileSync(
  path.join(sessionDir, '.session-config.json'),
  JSON.stringify({
    session_id: '2026-09-22__test-feature',
    feature_name: 'test-feature',
    created_at: '2026-09-22T10:00:00.000Z',
    phases_completed: [],
    status: 'grill-in-progress',
  })
);
fs.writeFileSync(path.join(sessionDir, '01-grill', 'resume.md'), '# {{ feature-name }}\n');

// No HANDOFF.md yet -> handoff is null, live state is still populated, no drift.
let report = buildResumeReport(sessionDir, projectRoot);
assert.strictEqual(report.handoff, null);
assert.strictEqual(report.live.currentPhase, 'grill');
assert.strictEqual(report.drift, null);

// A handoff that matches current live state -> no drift.
fs.writeFileSync(
  path.join(sessionDir, 'HANDOFF.md'),
  '**Current phase:** grill\n**Active ticket:** none\n\n## Next Step\n\nKeep grilling.\n'
);
report = buildResumeReport(sessionDir, projectRoot);
assert.strictEqual(report.handoff.sections['Next Step'], 'Keep grilling.');
assert.strictEqual(report.drift, null);

// A stale handoff (says 'plan', but grill is still pending) -> drift is reported.
fs.writeFileSync(
  path.join(sessionDir, 'HANDOFF.md'),
  '**Current phase:** plan\n**Active ticket:** none\n\n## Next Step\n\nWrite the plan.\n'
);
report = buildResumeReport(sessionDir, projectRoot);
assert.ok(report.drift.includes('"plan"'));
assert.ok(report.drift.includes('"grill"'));

fs.rmSync(projectRoot, { recursive: true, force: true });
console.log('resume.test.js: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/lib/resume.test.js`
Expected: FAIL with `Cannot find module './resume'`.

- [ ] **Step 3: Create `scripts/lib/resume.js`**

```js
// scripts/lib/resume.js
const fs = require('fs');
const path = require('path');
const { buildHandoffData } = require('./handoff');

function parseHandoffMarkdown(content) {
  const meta = {};
  const sections = {};
  let currentHeading = null;
  let buffer = [];

  for (const line of content.split(/\r?\n/)) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      if (currentHeading) sections[currentHeading] = buffer.join('\n').trim();
      currentHeading = headingMatch[1].trim();
      buffer = [];
      continue;
    }

    if (currentHeading) {
      buffer.push(line);
      continue;
    }

    const metaMatch = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
    if (metaMatch) meta[metaMatch[1].trim()] = metaMatch[2].trim();
  }
  if (currentHeading) sections[currentHeading] = buffer.join('\n').trim();

  return { meta, sections };
}

function describeDrift(meta, live) {
  const drifts = [];

  if (meta['Current phase'] && meta['Current phase'] !== live.currentPhase) {
    drifts.push(`handoff said current phase was "${meta['Current phase']}"; it is now "${live.currentPhase}"`);
  }

  const liveActiveTicket = live.activeTicket || 'none';
  if (meta['Active ticket'] && meta['Active ticket'] !== liveActiveTicket) {
    drifts.push(`handoff said active ticket was "${meta['Active ticket']}"; it is now "${liveActiveTicket}"`);
  }

  return drifts.length ? drifts.join('; ') : null;
}

function buildResumeReport(sessionDir, projectRoot) {
  const live = buildHandoffData(sessionDir, projectRoot);
  const handoffPath = path.join(sessionDir, 'HANDOFF.md');

  if (!fs.existsSync(handoffPath)) {
    return { handoff: null, live, drift: null };
  }

  const { meta, sections } = parseHandoffMarkdown(fs.readFileSync(handoffPath, 'utf-8'));

  return {
    handoff: { meta, sections },
    live,
    drift: describeDrift(meta, live),
  };
}

module.exports = { buildResumeReport, parseHandoffMarkdown };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/lib/resume.test.js`
Expected: PASS, prints `resume.test.js: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/resume.js scripts/lib/resume.test.js
git commit -m "feat: add buildResumeReport with drift detection for /gps resume"
```

---

### Task 7: Implement the `scripts/resume.js` CLI

**Files:**
- Create: `scripts/resume.js`

**Interfaces:**
- Consumes: `getCurrentSessionId` from `./lib/session-store`; `buildResumeReport` from `./lib/resume` (Task 6).
- Produces: prints the `buildResumeReport` result as JSON to stdout. Read-only — writes nothing.

- [ ] **Step 1: Create `scripts/resume.js`**

```js
#!/usr/bin/env node

/**
 * /gps resume
 *
 * Reads the current session's HANDOFF.md (if any) plus freshly computed
 * live state (ticket queue, git log, git status), and reports both plus
 * any drift between what the handoff said and what's true now. Read-only:
 * mutates nothing.
 */

const path = require('path');
const { getCurrentSessionId } = require('./lib/session-store');
const { buildResumeReport } = require('./lib/resume');

function main() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const currentSession = getCurrentSessionId(sessionsDir);

  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const sessionDir = path.join(sessionsDir, currentSession);
  const report = buildResumeReport(sessionDir, projectRoot);

  console.log(JSON.stringify(report, null, 2));
}

main();
```

- [ ] **Step 2: Verify it end-to-end against the manual-check session from Task 5**

Run (reusing `/tmp/gps-handoff-manual-check` from Task 5's manual check):

```bash
cd /tmp/gps-handoff-manual-check
node /path/to/grill-plan-ship/scripts/resume.js
```

Expected: JSON with `handoff.meta` populated from the `HANDOFF.md` written in Task 5, `live.currentPhase` equal to `"grill"`, and `drift` equal to `null` (nothing has changed since the handoff was saved).

Then edit `.work/sessions/*/01-grill/resume.md` to remove its placeholders (simulating that grill got finished after the handoff was saved) and re-run — `drift` should now report the phase mismatch.

- [ ] **Step 3: Commit**

```bash
git add scripts/resume.js
git commit -m "feat: add /gps resume command"
```

---

### Task 8: Document both commands in SKILL.md and README.md

**Files:**
- Modify: `skills/gps/SKILL.md`
- Modify: `README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add both commands to `skills/gps/SKILL.md`'s command list**

In the `**Commands:**` bullet list near the top, add two lines after the `/gps status` line:

```markdown
- `/gps handoff` — Save an in-flight checkpoint of the current session before stopping work
- `/gps resume` — Catch up on the current session using its saved handoff plus live state
```

- [ ] **Step 2: Add a hasHandoff hint to the `/gps status` section**

In the `### /gps status` section's "What it does" list, in the sub-bullet that already lists `writeTarget` / `tickets` / `nextPending` / `gitLog` for the current session, add:

```markdown
     - `hasHandoff` — whether a saved checkpoint exists for this session (`HANDOFF.md` present). When true, Claude Code's rendered report should mention `/gps resume` is available for full context.
```

- [ ] **Step 3: Add full `### /gps handoff` and `### /gps resume` sections**

Insert these two new sections into `skills/gps/SKILL.md`, right after the existing `### /gps status` section and before `### /gps write`:

```markdown
### /gps handoff

**When:** Stopping work on the current session — end of day, context running low, switching to something else — and you want a future session (yours or a fresh AI's) to pick it back up with full context, not just "what phase is pending." Takes no arguments.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/handoff.js`, which resolves the current session and auto-fills everything derivable from disk/git into `HANDOFF.md` at the session root: current phase, active ticket, ticket-queue state, recent commits, and a summary of uncommitted changes. It prints this data as JSON.
2. Claude Code then fills in `HANDOFF.md`'s remaining narrative placeholders directly (Edit tool, not the script): where work stopped, the reasoning behind the current approach (including alternatives tried and rejected), the next concrete action to take, open questions only the user can resolve, decisions already settled (so a future session doesn't re-ask), and — only if the git-status summary isn't "clean" — why the changes aren't committed yet.
3. `HANDOFF.md` is a single file: each run overwrites the previous one. There is no history log.

**Output:** `HANDOFF.md` written to the session root with full narrative context.

**Example:**

```
/gps handoff
```

### /gps resume

**When:** Picking a session back up after a break. Takes no arguments. Read-only — never writes or modifies any session file.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/resume.js`, which resolves the current session, reads `HANDOFF.md` if one exists, and independently recomputes live state (ticket queue, git log, git status) the same way `/gps handoff` does — so it never trusts stale narrative for facts it can verify itself. If the handoff's recorded phase or active ticket disagrees with the freshly computed values, it's reported as `drift`.
2. If no `HANDOFF.md` exists, `live` is still fully populated and `handoff` is `null` — the command degrades gracefully rather than failing.
3. Claude Code renders the result as one combined briefing in chat: the handoff's narrative sections (if present), the live facts, any drift warning, and the same suggested next command `/gps status` uses.

**Output:** A catch-up briefing printed in chat. No files are created or changed.

**Example:**

```
/gps resume
```
```

- [ ] **Step 4: Update `README.md`'s command list**

`README.md`'s `**Commands:**` bullet list doesn't include `/gps status` (it only lists `start`, `write`, `plan`, `ticket`, `ship`, `finish`). Add the two new lines after `` `/gps start <feature>` — Begin a feature `` and before `` `/gps write` — ... ``:

```markdown
- `/gps handoff` — Save an in-flight checkpoint before stopping
- `/gps resume` — Catch up on a session using its checkpoint plus live state
```

- [ ] **Step 5: Commit**

```bash
git add skills/gps/SKILL.md README.md
git commit -m "docs: document /gps handoff and /gps resume"
```

---

## Status — 2026-09-22

Tasks 1–8 above were completed on `worktree-handoff-resume`. The hardening decisions revise the design; see **Revision — 2026-09-22 hardening decisions** at the end of the spec (`docs/superpowers/specs/2026-09-22-handoff-resume-design.md`). Git scope, phase computation, placeholder markers and CLI error handling were updated during hardening M2. The remaining redesign (HANDOFF.json sidecar, backups capped at 10, staleness labelling) is milestone M4 and needs a new task list written against the current code, not this one.
