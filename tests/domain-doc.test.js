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
h.assertFails(h.run(root, 'domain-doc.js', ['notes']), 2, /Unknown kind: notes \(use where, glossary or adr\)/);
h.assertFails(h.run(root, 'domain-doc.js', ['where', 'extra']), 2, /where takes no other arguments/);
h.assertFails(h.run(root, 'domain-doc.js', ['glossary', 'extra']), 2, /no other arguments/);
h.assertFails(h.run(root, 'domain-doc.js', ['adr', '--title', 'Use Postgres']), 2, /needs a slug/);
h.assertFails(h.run(root, 'domain-doc.js', ['adr', 'Bad Slug', '--title', 'x']), 2, /needs a slug/);
h.assertFails(h.run(root, 'domain-doc.js', ['adr', 'postgres']), 2, /--title/);
assert.ok(!fs.existsSync(path.join(root, '.work')));

// where: read-only, says there is nothing yet and where it would go.
let res0 = h.ok(root, 'domain-doc.js', ['where']);
assert.match(res0.out, /Glossary: none yet \(domain-doc\.js glossary creates \.work[\\/]GLOSSARY\.md/);
assert.match(res0.out, /ADRs: none yet \(domain-doc\.js adr creates the first in \.work[\\/]adr\/\)/);
assert.ok(!fs.existsSync(path.join(root, '.work')), 'where writes nothing');

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
assert.strictEqual(h.json(root, 'domain-doc.js', ['glossary']).path, glossaryPath);
assert.match(h.ok(root, 'domain-doc.js', ['where']).out, /Glossary: \.work[\\/]GLOSSARY\.md/);


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

{
  // A project with its own glossary under the old name, CONTEXT.md: gps uses it and creates nothing.
  const p = h.gitProject();
  const own = '# dnachem\n\n## Language\n\n**Radical**:\nA reactive species.\n_Avoid_: species\n';
  fs.writeFileSync(path.join(p, 'CONTEXT.md'), own);
  assert.match(h.ok(p, 'domain-doc.js', ['where']).out, /^Glossary: CONTEXT\.md$/m);
  const g = h.ok(p, 'domain-doc.js', ['glossary']);
  assert.match(g.out, /Glossary: .*CONTEXT\.md \(the project's own\)\nNext: add or update the resolved term/);
  assert.ok(!fs.existsSync(path.join(p, '.work', 'GLOSSARY.md')), 'no parallel .work/GLOSSARY.md');
  assert.strictEqual(fs.readFileSync(path.join(p, 'CONTEXT.md'), 'utf-8'), own, 'the project glossary is not rewritten');

  // A CONTEXT.md that isn't a glossary (e.g. notes for an AI tool) is ignored.
  const q = h.gitProject();
  fs.writeFileSync(path.join(q, 'CONTEXT.md'), '# Context for the assistant\n\nUse tabs.\n');
  assert.match(h.ok(q, 'domain-doc.js', ['glossary']).out, /✅ Glossary created: .*\.work[\\/]GLOSSARY\.md/);

  // GLOSSARY.md wins over CONTEXT.md; a leftover .work/GLOSSARY.md is flagged as a duplicate.
  fs.writeFileSync(path.join(q, 'GLOSSARY.md'), '# Glossary\n');
  const dup = h.ok(q, 'domain-doc.js', ['glossary']);
  assert.match(dup.out, /Glossary: .*GLOSSARY\.md \(the project's own\)/);
  assert.match(dup.err, /\.work[\\/]GLOSSARY\.md duplicates the project's GLOSSARY\.md: move its terms into GLOSSARY\.md, then delete it/);
  assert.ok(fs.existsSync(path.join(q, '.work', 'GLOSSARY.md')), 'the duplicate is reported, never deleted');

  // A glossary map (several contexts): nothing is created, the map is pointed at.
  const m = h.gitProject();
  fs.writeFileSync(path.join(m, 'CONTEXT-MAP.md'), '# Contexts\n');
  const mapped = h.json(m, 'domain-doc.js', ['glossary']);
  assert.strictEqual(mapped.map, 'CONTEXT-MAP.md');
  assert.strictEqual(mapped.created, false);
  assert.match(h.ok(m, 'domain-doc.js', ['glossary']).out, /find the context the term belongs to in CONTEXT-MAP\.md/);
  assert.ok(!fs.existsSync(path.join(m, '.work')), 'nothing created with a map');

  // ADRs go to the project's docs/adr/ when it exists, numbered after the ones there.
  fs.mkdirSync(path.join(p, 'docs', 'adr'), { recursive: true });
  fs.writeFileSync(path.join(p, 'docs', 'adr', '0003-existing.md'), '# Existing\n');
  const a = h.json(p, 'domain-doc.js', ['adr', 'time-step', '--title', 'One time step']);
  assert.strictEqual(a.number, '0004');
  assert.strictEqual(a.path, path.join(p, 'docs', 'adr', '0004-time-step.md'));
  assert.ok(!fs.existsSync(path.join(p, '.work', 'adr')));
  assert.match(h.ok(p, 'domain-doc.js', ['where']).out, /ADRs: docs[\\/]adr\/ \(2\)/);
}

h.done('domain-doc.test.js');
