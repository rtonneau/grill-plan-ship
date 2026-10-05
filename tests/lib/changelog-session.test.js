// tests/lib/changelog-session.test.js
const assert = require('assert');
const h = require('../helpers');
const { sessionCommits, checkChangelogable } = require('../../skills/gps/scripts/lib/changelog-session');
const { GpsError } = require('../../skills/gps/scripts/lib/guard');

const root = h.gitProject('gps-cls-');
h.shipReady(root, 'Lib check', ['a']);
h.completeTicket(root, 1, 'a');
const config = h.readConfig(root);
const { subjects, floor, messages } = sessionCommits(root, config);
assert.ok(subjects.includes('feat: a'));
assert.ok(subjects.every((s) => !s.startsWith('chore(gps):')));
assert.strictEqual(messages.length, subjects.length);
assert.strictEqual(floor, 'minor');
checkChangelogable(config.session_id, h.sessionDir(root), config);
assert.throws(() => checkChangelogable('x', h.sessionDir(root), { ...config, finished_at: 'now' }), GpsError);

h.done('changelog-session.test.js');
