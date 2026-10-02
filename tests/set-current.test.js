// tests/set-current.test.js — set-current.js (switching the current session)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.tempProject();
h.ok(root, 'start.js', ['older']);
const older = h.currentSession(root);
h.ok(root, 'start.js', ['bounded']);
const bounded = h.currentSession(root);
h.writeGrill(root);
h.ok(root, 'finish.js');

// Switches to an unfinished session.
const res = h.ok(root, 'set-current.js', [older]);
assert.match(res.out, /✅ Current session is now .*older/);
assert.strictEqual(h.currentSession(root), older);
assert.deepStrictEqual(h.json(root, 'set-current.js', [older]), { sessionId: older });

// Finished, missing and unsafe ids are refused; the pointer stays.
h.assertFails(h.run(root, 'set-current.js', [bounded]), 1, /already finished/);
h.assertFails(h.run(root, 'set-current.js', ['2026-01-01__missing']), 1, /not found.*\n.*Unfinished sessions: .*older/);
h.assertFails(h.run(root, 'set-current.js', ['../../x']), 2, /Invalid session id/);
h.assertFails(h.run(root, 'set-current.js'), 2, /Usage: set-current\.js/);
assert.strictEqual(h.currentSession(root), older);

// It is also the recovery for a stale pointer.
fs.writeFileSync(path.join(h.sessionsDir(root), '.current-session'), 'zzz');
h.assertFails(h.run(root, 'ticket-queue.js'), 1, /current session zzz no longer exists[\s\S]*set-current\.js/);
h.ok(root, 'set-current.js', [older]);
h.ok(root, 'write-prepare.js');

h.done('set-current.test.js');
