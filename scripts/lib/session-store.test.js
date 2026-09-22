// scripts/lib/session-store.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  setCurrentSession,
  getCurrentSessionId,
  resolveCurrentPointer,
  pointerError,
  resolveSession,
  isSafeSessionName,
  markPhaseCompleted,
} = require('./session-store');
const { GpsError } = require('./guard');

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

// Pointer removed -> no silent fallback to another session
fs.unlinkSync(path.join(sessionsDir, '.current-session'));
assert.strictEqual(getCurrentSessionId(sessionsDir), null);
assert.strictEqual(resolveCurrentPointer(sessionsDir).problem, 'no-pointer');

// Invalid, missing and finished pointer targets are reported, never followed
const pointerFile = path.join(sessionsDir, '.current-session');
for (const [content, problem] of [
  ['../../etc', 'invalid-pointer'],
  ['a/b', 'invalid-pointer'],
  ['..', 'invalid-pointer'],
  ['', 'invalid-pointer'],
  ['2026-01-01__gone', 'missing-session'],
]) {
  fs.writeFileSync(pointerFile, content);
  assert.strictEqual(resolveCurrentPointer(sessionsDir).problem, problem, content);
  assert.strictEqual(getCurrentSessionId(sessionsDir), null);
}
fs.writeFileSync(
  path.join(sessionsDir, '2026-09-16__b-feature', '.session-config.json'),
  JSON.stringify({ created_at: '2026-09-16T11:00:00.000Z', finished_at: '2026-09-17T00:00:00.000Z' })
);
setCurrentSession(sessionsDir, '2026-09-16__b-feature');
assert.strictEqual(resolveCurrentPointer(sessionsDir).problem, 'finished-session');

// pointerError hints list the unfinished sessions and set-current.js
const err = pointerError(sessionsDir, resolveCurrentPointer(sessionsDir));
assert.ok(err instanceof GpsError);
assert.match(err.message, /already finished/);
assert.match(err.hint, /2026-09-16__a-feature/);
assert.match(err.hint, /set-current\.js/);
assert.doesNotMatch(err.hint, /b-feature/);

// resolveSession throws the same error
assert.throws(() => resolveSession(path.dirname(path.dirname(sessionsDir))), GpsError);

// Legacy session names that aren't strict slugs are still safe names
assert.ok(isSafeSessionName('2026-09-16__My_Feature!'));
assert.ok(!isSafeSessionName('../x'));

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
