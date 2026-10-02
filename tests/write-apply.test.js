// tests/write-apply.test.js — write-apply.js (/gps write, step 2)
// GitHub branch and issue creation are covered in github-flow.test.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const payloadPath = (root) => path.join(h.sessionDir(root), '.write-payload.md');
const sections = (headings) => headings.map((x) => `## ${x}\n\n${x} content.\n`).join('\n');

{
  // Grill phase: fills resume.md (CRLF payloads too), generates Token Usage, deletes the payload.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['applied']);
  h.assertFails(h.run(root, 'write-apply.js'), 1, /No payload at/);
  const prep = h.json(root, 'write-prepare.js');
  fs.writeFileSync(prep.payloadPath, sections(prep.sections).replace(/\n/g, '\r\n'));
  const res = h.ok(root, 'write-apply.js');
  assert.match(res.out, /✅ Grill written for .*applied/);
  assert.match(res.out, /Next: \/gps plan \(bounded work skips the plan/);
  const text = fs.readFileSync(path.join(h.sessionDir(root), '01-grill', 'resume.md'), 'utf-8');
  assert.match(text, /^# Session: applied/);
  assert.match(text, /## Problem Statement\n\nProblem Statement content\./);
  assert.match(text, /- \*\*Total:\*\* unavailable/);
  assert.doesNotMatch(text, /gps:fill/);
  assert.ok(!fs.existsSync(prep.payloadPath));
  assert.deepStrictEqual(h.history(root).map((e) => [e.event, e.phase]).pop(), ['grill_written', 'plan-not-started']);

  // Nothing pending -> clear error.
  h.assertFails(h.run(root, 'write-apply.js'), 1, /Nothing to write[\s\S]*\/gps plan/);
}

{
  // A bad payload writes nothing and is kept; the fixed one then succeeds.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['retry']);
  const resume = path.join(h.sessionDir(root), '01-grill', 'resume.md');
  const before = fs.readFileSync(resume, 'utf-8');
  fs.writeFileSync(payloadPath(root), '## Problem Statement\n\nOnly one.\n## Bogus\n\nx\n');
  const bad = h.run(root, 'write-apply.js');
  h.assertFails(bad, 1, /nothing was written/);
  assert.match(bad.err, /Missing section "## Notes"/);
  assert.match(bad.err, /Unknown section "## Bogus"/);
  assert.strictEqual(fs.readFileSync(resume, 'utf-8'), before);
  assert.ok(fs.existsSync(payloadPath(root)));

  // An unfilled skeleton is refused too.
  fs.writeFileSync(payloadPath(root), h.json(root, 'write-prepare.js').skeleton);
  h.assertFails(h.run(root, 'write-apply.js'), 1, /still has a placeholder/);

  h.writeGrill(root);
}

{
  // Plan phase: writes plan.md and the tickets; refuses leftover hand-written tickets.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['planned-apply']);
  h.writeGrill(root);
  h.ok(root, 'plan.js');
  const planDir = path.join(h.sessionDir(root), '02-plan');
  const ticketsDir = path.join(planDir, 'tickets');
  const prep = h.json(root, 'write-prepare.js');

  fs.mkdirSync(ticketsDir, { recursive: true });
  const leftover = path.join(ticketsDir, '07-old.md');
  fs.writeFileSync(leftover, '# Ticket 07: old\n\nHand-written.\n');
  fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: 'a' }]));
  h.assertFails(h.run(root, 'write-apply.js'), 1, /07-old\.md already exists/);
  assert.strictEqual(fs.readFileSync(leftover, 'utf-8'), '# Ticket 07: old\n\nHand-written.\n');
  fs.unlinkSync(leftover);

  // Ticket models: unknown or empty values are refused.
  fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: 'a', model: 'gpt-9' }]));
  h.assertFails(h.run(root, 'write-apply.js'), 1, /unknown model "gpt-9"/);
  fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: 'a', body: '**Model:**\n\nDo a.' }]));
  h.assertFails(h.run(root, 'write-apply.js'), 1, /empty \*\*Model:\*\* line/);
  fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: '<slug>' }]));
  h.assertFails(h.run(root, 'write-apply.js'), 1, /Invalid ticket name/);

  fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: 'a', model: 'haiku' }, { slug: 'b' }]));
  const data = JSON.parse(h.ok(root, 'write-apply.js', ['--json']).out);
  assert.deepStrictEqual(data.tickets, ['01-a', '02-b']);
  assert.strictEqual(data.git, null);
  assert.deepStrictEqual(fs.readdirSync(ticketsDir).sort(), ['01-a.md', '02-b.md']);
  assert.strictEqual(fs.readFileSync(path.join(ticketsDir, '02-b.md'), 'utf-8'), '# Ticket 02: b\n\nDo b.\n');
  const plan = fs.readFileSync(path.join(planDir, 'plan.md'), 'utf-8');
  assert.match(plan, /^# Implementation Plan/);
  assert.match(plan, /\*\*Estimated effort:\*\* 1 day/);
  assert.doesNotMatch(plan, /gps:fill/);
  const written = h.history(root).pop();
  assert.strictEqual(written.event, 'plan_written');
  assert.deepStrictEqual(written.files, ['02-plan/plan.md', '02-plan/tickets/01-a.md', '02-plan/tickets/02-b.md']);
  assert.deepStrictEqual(written.detail, { tickets: 2 });
}

{
  // A placeholder the payload can't reach (hand-edited header) is caught before anything is written.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['atomic']);
  h.writeGrill(root);
  h.ok(root, 'plan.js');
  const planPath = path.join(h.sessionDir(root), '02-plan', 'plan.md');
  fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf-8').replace('# Implementation Plan', '# Implementation Plan\n\nOwner: <!-- gps:fill someone -->'));
  const planBefore = fs.readFileSync(planPath, 'utf-8');
  const prep = h.json(root, 'write-prepare.js');
  fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: 'a' }]));
  h.assertFails(h.run(root, 'write-apply.js'), 1, /plan\.md would still have a placeholder outside the payload's reach/);
  assert.strictEqual(fs.readFileSync(planPath, 'utf-8'), planBefore);
  assert.ok(fs.existsSync(prep.payloadPath));
}

{
  // A deleted resume.md is recreated from the template.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['recreated']);
  const resume = path.join(h.sessionDir(root), '01-grill', 'resume.md');
  fs.unlinkSync(resume);
  h.writeGrill(root);
  assert.match(fs.readFileSync(resume, 'utf-8'), /^# Session: recreated[\s\S]*## Notes\n\nNotes content\./);
}

{
  // An issue session with GitHub off files no issue and still succeeds.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['--issue', 'Local report']);
  const res = h.writeGrill(root);
  assert.doesNotMatch(res.out, /Issue #/);
  assert.strictEqual(h.readConfig(root).issue, undefined);
}

h.done('write-apply.test.js');
