// tests/lib/session-store.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  setCurrentSession,
  resolveCurrentPointer,
  pointerError,
  resolveSession,
  isSafeSessionName,
  findUnfinishedBySlug,
} = require('../../skills/gps/scripts/lib/session-store');
const { initSession } = require('../../skills/gps/scripts/lib/session-init');
const { GpsError } = require('../../skills/gps/scripts/lib/guard');

const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-session-store-'));

// No pointer, no sessions -> null
assert.strictEqual(resolveCurrentPointer(sessionsDir).sessionId, null);

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
assert.strictEqual(resolveCurrentPointer(sessionsDir).sessionId, '2026-09-16__a-feature');

// Pointer removed -> no silent fallback to another session
fs.unlinkSync(path.join(sessionsDir, '.current-session'));
assert.strictEqual(resolveCurrentPointer(sessionsDir).sessionId, null);
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
  assert.strictEqual(resolveCurrentPointer(sessionsDir).sessionId, null);
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

// findUnfinishedBySlug skips finished sessions and other slugs
assert.strictEqual(findUnfinishedBySlug(sessionsDir, 'a-feature').sessionId, '2026-09-16__a-feature');
assert.strictEqual(findUnfinishedBySlug(sessionsDir, 'a-feature').config.created_at, '2026-09-16T10:00:00.000Z');
assert.strictEqual(findUnfinishedBySlug(sessionsDir, 'b-feature'), null, 'finished');
assert.strictEqual(findUnfinishedBySlug(sessionsDir, 'feature'), null);
assert.strictEqual(findUnfinishedBySlug(sessionsDir, '2026-09-16__a-feature'), null, 'a slug, not a session id');

// resolveSession throws the same error
assert.throws(() => resolveSession(path.dirname(path.dirname(sessionsDir))), GpsError);

// Legacy session names that aren't strict slugs are still safe names
assert.ok(isSafeSessionName('2026-09-16__My_Feature!'));
assert.ok(!isSafeSessionName('../x'));

// A marker-less directory (e.g. scout-reports) is never treated as a
// session: it has no .session-config.json, so listSessionDirs must skip
// it and resolveCurrentPointer must not fall back to picking it.
const noMarkerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-session-store-nomarker-'));
fs.mkdirSync(path.join(noMarkerDir, 'scout-reports'));
fs.writeFileSync(path.join(noMarkerDir, 'scout-reports', 'some-report.html'), '<html></html>');
assert.strictEqual(resolveCurrentPointer(noMarkerDir).sessionId, null);
fs.rmSync(noMarkerDir, { recursive: true, force: true });

fs.rmSync(sessionsDir, { recursive: true, force: true });

// Across days, the newest unfinished session of the slug wins (by created_at, not directory order).
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-session-store-slug-'));
const day = (d) => new Date(2026, 0, d, 12);
initSession(project, 'feat', {}, day(5));
initSession(project, 'feat', {}, day(20));
initSession(project, 'feat', {}, day(12));
initSession(project, 'feat-more', {}, day(25));
const projectSessions = path.join(project, '.work', 'sessions');
assert.strictEqual(findUnfinishedBySlug(projectSessions, 'feat').sessionId, '2026-01-20__feat');
assert.strictEqual(findUnfinishedBySlug(projectSessions, 'missing'), null);
assert.strictEqual(findUnfinishedBySlug(path.join(project, 'nowhere'), 'feat'), null);
fs.rmSync(project, { recursive: true, force: true });

// ADR 0002: with no pointer file, the single unfinished session that owns
// the checked-out branch is restored; anything else is left as it was.
{
  const h = require('../helpers');
  const root = h.gitProject('gps-store-busy-');
  const dir = path.join(root, '.work', 'sessions');
  const make = (id, config) => {
    fs.mkdirSync(path.join(dir, id), { recursive: true });
    fs.writeFileSync(path.join(dir, id, '.session-config.json'), JSON.stringify(config));
  };
  const pointerFile = path.join(dir, '.current-session');
  make('2026-11-20__done', { finished_at: '2026-11-20T00:00:00Z', git: { branch: 'main' } });
  make('2026-11-20__other', { git: { branch: 'feat/other' } });
  // No match on main (only a finished session records it).
  assert.strictEqual(resolveCurrentPointer(dir).problem, 'no-pointer');
  assert.ok(!fs.existsSync(pointerFile));
  // One match: restored and written.
  make('2026-11-20__owner', { git: { branch: 'main' } });
  assert.deepStrictEqual(resolveCurrentPointer(dir), { sessionId: '2026-11-20__owner', problem: null });
  assert.strictEqual(fs.readFileSync(pointerFile, 'utf-8'), '2026-11-20__owner');
  // A finished pointer is never replaced.
  setCurrentSession(dir, '2026-11-20__done');
  assert.strictEqual(resolveCurrentPointer(dir).problem, 'finished-session');
  assert.strictEqual(fs.readFileSync(pointerFile, 'utf-8'), '2026-11-20__done');
  // Several matches: nothing restored.
  fs.rmSync(pointerFile);
  make('2026-11-20__twin', { git: { branch: 'main' } });
  assert.strictEqual(resolveCurrentPointer(dir).problem, 'no-pointer');
  assert.ok(!fs.existsSync(pointerFile));
  // Detached HEAD: nothing restored.
  fs.rmSync(path.join(dir, '2026-11-20__twin'), { recursive: true });
  h.git(root, 'checkout', '-q', '--detach');
  assert.strictEqual(resolveCurrentPointer(dir).problem, 'no-pointer');
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('session-store.test.js: all assertions passed');
