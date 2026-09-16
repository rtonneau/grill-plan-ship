# Task 3: Add `scripts/lib/session-store.js`

**Context:** This is the third task in the fix. This module handles current session resolution (via an explicit `.current-session` pointer file instead of directory-name sorting) and idempotent phase tracking.

**Files:**
- Create: `scripts/lib/session-store.js`
- Create: `scripts/lib/session-store.test.js` (plain Node assertions)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: Four exports used by Tasks 4-7:
  - `setCurrentSession(sessionsDir, sessionId): void` — writes `.current-session` pointer file
  - `getCurrentSessionId(sessionsDir): string | null` — reads pointer file or falls back to most-recent by created_at
  - `markPhaseCompleted(config, phase): void` — adds phase to config.phases_completed only once (idempotent)
  - `CURRENT_SESSION_FILENAME` constant (the string `.current-session`)

**The problem it solves:**
- Old code: `fs.readdirSync(sessionsDir).sort().reverse()[0]` — picks lexically last session name, wrong if two sessions started same day
- New code: Write an explicit pointer file when a session starts, use that; fall back to most-recent by `created_at` if pointer is stale
- Old code: `config.phases_completed.push('grill')` every run — can duplicate if run twice
- New code: Only push if not already present

**What to do:**

1. **Create `scripts/lib/session-store.test.js`** with this exact content:

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

2. **Create `scripts/lib/session-store.js`** with this exact content:

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

3. **Test it:** Run `node scripts/lib/session-store.test.js` and confirm it prints `session-store.test.js: all assertions passed`

4. **Commit:** `git add scripts/lib/session-store.js scripts/lib/session-store.test.js && git commit -m "feat: resolve current gps session via explicit pointer, not name sort"`

**Report to:**
.superpowers/sdd/2026-09-16-fix-gps-build-inconsistencies/task-3-report.md

When done, post only:
- Status (one word)
- Commits (hash space message)
- One-line test summary
- Any concerns
