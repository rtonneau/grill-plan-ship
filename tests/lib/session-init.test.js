// tests/lib/session-init.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initSession } = require('../../skills/gps/scripts/lib/session-init');
const { LOCAL_ONLY } = require('../../skills/gps/scripts/lib/setup');
const { localDate } = require('../../skills/gps/scripts/lib/guard');

const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-init-'));
fs.writeFileSync(path.join(projectRoot, '.gitignore'), 'node_modules/');

const session = initSession(projectRoot, 'Add Dark Mode!', { kind: 'issue' });
assert.strictEqual(session.slug, 'add-dark-mode');
assert.strictEqual(session.cleaned, true);
assert.strictEqual(session.sessionId, `${localDate()}__add-dark-mode`);
assert.deepStrictEqual(session.gitignoreAdded, LOCAL_ONLY);
assert.ok(LOCAL_ONLY.includes('.work/sessions/.current-session'));
assert.ok(!LOCAL_ONLY.includes('.work/'), '.work/ itself is committed');
assert.strictEqual(session.scratchDir, `.scratch/tests/${session.sessionId}`);
assert.strictEqual(fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf-8'), `node_modules/\n${LOCAL_ONLY.join('\n')}\n`);

// Only the config and the resume template: nothing that is never filled.
assert.deepStrictEqual(fs.readdirSync(session.workDir).sort(), ['.session-config.json', '01-grill']);
assert.deepStrictEqual(fs.readdirSync(session.grillDir), ['resume.md']);
assert.match(fs.readFileSync(path.join(session.grillDir, 'resume.md'), 'utf-8'), /^# Session: Add Dark Mode!\n/);

const config = JSON.parse(fs.readFileSync(path.join(session.workDir, '.session-config.json'), 'utf-8'));
assert.strictEqual(config.feature_name, 'Add Dark Mode!');
assert.strictEqual(config.kind, 'issue');
assert.strictEqual(config.template_version, 2);
assert.strictEqual(config.usage, undefined, 'no token-usage tracking');
assert.deepStrictEqual(config.history.map((e) => [e.event, e.detail]), [['session_started', { kind: 'issue' }]]);
assert.strictEqual(fs.readFileSync(path.join(session.sessionsDir, '.current-session'), 'utf-8'), session.sessionId);

// The same name again is refused, pointing at another name; a clean name is reported as not cleaned.
assert.throws(() => initSession(projectRoot, 'add dark mode'), (err) => /already exists; nothing was changed/.test(err.message)
  && /Pick a different feature name/.test(err.hint) && !/\/gps status/.test(err.hint));
assert.strictEqual(initSession(projectRoot, 'plain').cleaned, false);
assert.deepStrictEqual(initSession(projectRoot, 'other').gitignoreAdded, []);

// `now` dates the session: its id, created_at and first history event.
const then = new Date(2026, 0, 2, 10, 30);
const older = initSession(projectRoot, 'add dark mode', {}, then);
assert.strictEqual(older.sessionId, '2026-01-02__add-dark-mode');
const olderConfig = JSON.parse(fs.readFileSync(path.join(older.workDir, '.session-config.json'), 'utf-8'));
assert.strictEqual(olderConfig.created_at, then.toISOString());
assert.deepStrictEqual(olderConfig.history.map((e) => e.at), [then.toISOString()]);

fs.rmSync(projectRoot, { recursive: true, force: true });
console.log('session-init.test.js: all assertions passed');
