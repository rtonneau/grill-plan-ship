// tests/lib/setup.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('../helpers');
const { LOCAL_ONLY, SETUP_MESSAGE, ensureLocalIgnores, needsSetup, inspectSetup, applySetup } = require('../../skills/gps/scripts/lib/setup');

// LOCAL_ONLY keeps per-machine files out of git, never .work/ itself.
assert.ok(LOCAL_ONLY.includes('.work/sessions/.current-session'));
assert.ok(!LOCAL_ONLY.includes('.work/'));

// Outside git: no setup to commit, so no hint.
const plain = h.tempProject();
assert.strictEqual(needsSetup(plain), false);
assert.deepStrictEqual(ensureLocalIgnores(plain), LOCAL_ONLY);
assert.deepStrictEqual(ensureLocalIgnores(plain), [], 'already there');

// In git: needed until the config is committed.
const root = h.gitProject();
assert.strictEqual(needsSetup(root), true);
let state = inspectSetup(root);
assert.strictEqual(state.gitRepo, true);
assert.strictEqual(state.branch, 'main');
assert.strictEqual(state.storedGithub, null);
assert.strictEqual(state.ready, false);
assert.deepStrictEqual(state.missingIgnores, LOCAL_ONLY);

const result = applySetup(root);
assert.strictEqual(result.configCreated, true);
assert.strictEqual(result.unignored, false);
assert.deepStrictEqual(result.added, LOCAL_ONLY);
assert.ok(result.commit.ok && result.commit.sha);
assert.strictEqual(h.git(root, 'log', '-1', '--format=%s'), SETUP_MESSAGE);
assert.strictEqual(needsSetup(root), false);
state = inspectSetup(root);
assert.strictEqual(state.ready, true);
assert.strictEqual(state.configTracked, true);
assert.deepStrictEqual(applySetup(root).commit, { ok: true, sha: null, files: [], skipped: null });

// A failed commit (pre-commit hook) is returned, not thrown.
const hooked = h.gitProject();
fs.writeFileSync(path.join(hooked, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "lint failed" >&2\nexit 1\n', { mode: 0o755 });
const failed = applySetup(hooked).commit;
assert.strictEqual(failed.ok, false);
assert.strictEqual(failed.reason, 'lint failed');

console.log('setup.test.js: all assertions passed');
