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

// A marker-less directory (e.g. scout-reports) is never treated as a
// session: it has no .session-config.json, so listSessionDirs must skip
// it and getCurrentSessionId must not fall back to picking it.
const noMarkerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-session-store-nomarker-'));
fs.mkdirSync(path.join(noMarkerDir, 'scout-reports'));
fs.writeFileSync(path.join(noMarkerDir, 'scout-reports', 'some-report.html'), '<html></html>');
assert.strictEqual(getCurrentSessionId(noMarkerDir), null);
fs.rmSync(noMarkerDir, { recursive: true, force: true });

// markPhaseCompleted only pushes a phase once
const config = { phases_completed: [] };
markPhaseCompleted(config, 'grill');
markPhaseCompleted(config, 'grill');
assert.deepStrictEqual(config.phases_completed, ['grill']);

fs.rmSync(sessionsDir, { recursive: true, force: true });
console.log('session-store.test.js: all assertions passed');
