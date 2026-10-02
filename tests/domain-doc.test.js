// tests/domain-doc.test.js — domain-doc.js (the built-in grill's glossary and ADRs)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.gitProject();
const glossaryPath = path.join(root, '.work', 'GLOSSARY.md');
const adrDir = path.join(root, '.work', 'adr');

// Usage errors change nothing.
h.assertFails(h.run(root, 'domain-doc.js'), 2);
h.assertFails(h.run(root, 'domain-doc.js', ['notes']), 2, /Unknown kind: notes/);
h.assertFails(h.run(root, 'domain-doc.js', ['glossary', 'extra']), 2, /no other arguments/);
h.assertFails(h.run(root, 'domain-doc.js', ['adr', '--title', 'Use Postgres']), 2, /needs a slug/);
h.assertFails(h.run(root, 'domain-doc.js', ['adr', 'Bad Slug', '--title', 'x']), 2, /needs a slug/);
h.assertFails(h.run(root, 'domain-doc.js', ['adr', 'postgres']), 2, /--title/);
assert.ok(!fs.existsSync(path.join(root, '.work')));

// Glossary: created lazily from the template (no session needed), then left alone.
let res = h.ok(root, 'domain-doc.js', ['glossary']);
assert.match(res.out, /✅ Glossary created: .*\.work[\\/]GLOSSARY\.md/);
assert.match(res.out, /Next: replace its gps:fill marker/);
let text = fs.readFileSync(glossaryPath, 'utf-8');
assert.match(text, new RegExp(`^# ${path.basename(root)} glossary`));
assert.match(text, /## Language/);
assert.doesNotMatch(text, /\{\{/);
fs.appendFileSync(glossaryPath, '\n**Order**:\nA request to buy.\n');
res = h.ok(root, 'domain-doc.js', ['glossary']);
assert.match(res.out, /^Glossary: /);
assert.match(fs.readFileSync(glossaryPath, 'utf-8'), /\*\*Order\*\*/);
assert.deepStrictEqual(h.json(root, 'domain-doc.js', ['glossary']), { path: glossaryPath, created: false, rootDocs: [] });

// Another skill's root glossary is pointed out.
fs.writeFileSync(path.join(root, 'GLOSSARY.md'), '# Root\n');
assert.match(h.ok(root, 'domain-doc.js', ['glossary']).err, /⚠️ {2}The repo also has GLOSSARY\.md at its root/);

// ADRs: numbered in order, outside any session, never overwritten.
res = h.ok(root, 'domain-doc.js', ['adr', 'postgres-write-model', '--title', 'Postgres for the write model']);
assert.match(res.out, /✅ ADR 0001 created: .*0001-postgres-write-model\.md/);
text = fs.readFileSync(path.join(adrDir, '0001-postgres-write-model.md'), 'utf-8');
assert.match(text, /^# Postgres for the write model\n\n_ADR 0001, recorded \d{4}-\d{2}-\d{2} \(no gps session\)\._/);
assert.match(text, /gps:fill/);
h.assertFails(h.run(root, 'domain-doc.js', ['adr', 'postgres-write-model', '--title', 'Again']), 1, /ADR 0001 already records "postgres-write-model"/);

// Inside a session, the next number, and the session is named.
h.ok(root, 'start.js', ['orders']);
fs.writeFileSync(path.join(adrDir, '0007-hand-made.md'), '# Hand made\n');
const data = h.json(root, 'domain-doc.js', ['adr', 'events-between-contexts', '--title', 'Events between contexts']);
assert.strictEqual(data.number, '0008');
assert.match(fs.readFileSync(data.path, 'utf-8'), new RegExp(`\\(session ${h.currentSession(root)}\\)`));

h.done('domain-doc.test.js');
