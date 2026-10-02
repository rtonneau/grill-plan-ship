// tests/ticket-check.test.js — ticket-check.js (/gps ship: verify a DONE report)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.gitProject();
h.shipReady(root, 'checked', ['a']);
const log = path.join(h.sessionDir(root), '03-implement', '01-a', 'commit-log.md');

h.assertFails(h.run(root, 'ticket-check.js'), 2);

// Not started: every problem is named, and the hint says to stop the run.
let res = h.run(root, 'ticket-check.js', ['1']);
h.assertFails(res, 1, /not complete: its commit log does not say/);
assert.match(res.err, /ticket-complete\.js never ran/);
assert.match(res.err, /lists no commit/);
assert.match(res.err, /DONE report was inaccurate/);

// Marked Done by hand (what a careless subagent might do): still not complete.
h.ok(root, 'ticket-start.js', ['1']);
fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace('**Status:** In Progress', '**Status:** ✅ Done'));
res = h.run(root, 'ticket-check.js', ['1']);
h.assertFails(res, 1, /ticket_done event/);
assert.doesNotMatch(res.err, /does not say/);
fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace('**Status:** ✅ Done', '**Status:** In Progress'));

// Completed through ticket-complete.js: complete.
h.fillLog(root, '01-a');
fs.writeFileSync(path.join(root, 'a.js'), 'a\n');
h.ok(root, 'ticket-complete.js', ['1', '--message', 'feat: a', '--file', 'a.js']);
const sha = h.git(root, 'rev-parse', '--short', 'HEAD');
assert.match(h.ok(root, 'ticket-check.js', ['1']).out, new RegExp(`✅ Ticket 01 \\(a\\) is complete: ${sha}`));
assert.deepStrictEqual(h.json(root, 'ticket-check.js', ['1']), { ticket: '01-a', complete: true, commits: [sha] });

// A commit that no longer exists (rewritten history) is caught.
fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace(`- ${sha}`, '- 0000000'));
h.assertFails(h.run(root, 'ticket-check.js', ['1']), 1, /0000000 not found in git/);

h.done('ticket-check.test.js');
