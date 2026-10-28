// tests/lib/setup.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('../helpers');
const { LOCAL_ONLY, STALE_IGNORES, SETUP_MESSAGE, ensureLocalIgnores, needsSetup, inspectSetup, applySetup } = require('../../skills/gps/scripts/lib/setup');

// LOCAL_ONLY keeps per-machine files out of git, never .work/ itself.
assert.deepStrictEqual(LOCAL_ONLY, ['.scratch/']);
assert.ok(!LOCAL_ONLY.includes('.work/'));
assert.deepStrictEqual(STALE_IGNORES, [
  '.work/sessions/.current-session',
  '.work/sessions/.pending-seeds.json*',
  '.work/sessions/*/.write-payload.md',
  '.work/sessions/*/.changelog-payload.md',
]);

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

// Stale ignores an older gps added: not ready until stripped, exactly those lines, committed.
const stale = h.gitProject();
fs.writeFileSync(path.join(stale, '.gitignore'), `node_modules/\n${STALE_IGNORES.join('\n')}\ndist/\n.scratch/\n`);
h.git(stale, 'add', '.gitignore');
h.git(stale, 'commit', '-q', '-m', 'old ignores');
assert.deepStrictEqual(inspectSetup(stale).staleIgnores, STALE_IGNORES);
assert.strictEqual(inspectSetup(stale).ready, false);
const stripped = applySetup(stale);
assert.deepStrictEqual(stripped.removed, STALE_IGNORES);
assert.deepStrictEqual(stripped.added, []);
assert.strictEqual(fs.readFileSync(path.join(stale, '.gitignore'), 'utf-8'), 'node_modules/\ndist/\n.scratch/\n');
assert.ok(stripped.commit.ok && stripped.commit.files.includes('.gitignore'), 'the removal is in the setup commit');
assert.strictEqual(h.git(stale, 'status', '--porcelain', '--', '.gitignore'), '');
assert.deepStrictEqual(inspectSetup(stale).staleIgnores, []);
assert.strictEqual(inspectSetup(stale).ready, true);
assert.deepStrictEqual(applySetup(stale).removed, []);

// A user's own .gitignore edit stays untouched and uncommitted next to the stale lines.
const mixed = h.gitProject();
fs.writeFileSync(path.join(mixed, '.gitignore'), '.work/sessions/.current-session\n.scratch/\n');
h.git(mixed, 'add', '.gitignore');
h.git(mixed, 'commit', '-q', '-m', 'old ignores');
fs.appendFileSync(path.join(mixed, '.gitignore'), 'coverage/\n');
const kept = applySetup(mixed);
assert.deepStrictEqual(kept.removed, ['.work/sessions/.current-session']);
assert.strictEqual(fs.readFileSync(path.join(mixed, '.gitignore'), 'utf-8'), '.scratch/\ncoverage/\n');
assert.ok(!kept.commit.files.includes('.gitignore'), 'user edits are not committed');
assert.ok(kept.commit.skipped);

// A failed commit (pre-commit hook) is returned, not thrown.
const hooked = h.gitProject();
fs.writeFileSync(path.join(hooked, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "lint failed" >&2\nexit 1\n', { mode: 0o755 });
const failed = applySetup(hooked).commit;
assert.strictEqual(failed.ok, false);
assert.strictEqual(failed.reason, 'lint failed');

console.log('setup.test.js: all assertions passed');
