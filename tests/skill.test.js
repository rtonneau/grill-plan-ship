// tests/skill.test.js
//
// The skill's structure: SKILL.md stays a short router, every command it
// lists has a references file, every script a reference names exists, and
// every script has its own test file.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { SKILL_DIR, SCRIPTS } = require('./helpers');
const { check, DEFAULT_MAX } = require('./check-skill-size');

const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf-8');
const refsDir = path.join(SKILL_DIR, 'references');
const refs = Object.fromEntries(fs.readdirSync(refsDir).map((f) => [f.replace(/\.md$/, ''), fs.readFileSync(path.join(refsDir, f), 'utf-8')]));
const scripts = fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.js'));

// Size: hard limit 200 lines (CI), target under 100.
for (const result of check()) assert.ok(result.lines <= DEFAULT_MAX, `${result.file} has ${result.lines} lines`);
assert.ok(skill.split('\n').length < 100, 'SKILL.md should stay under 100 lines');
for (const [name, text] of Object.entries(refs)) assert.ok(text.split('\n').length <= 40, `references/${name}.md must stay short`);

// The size check itself fails on an oversized SKILL.md.
const failing = spawnSync(process.execPath, [path.join(__dirname, 'check-skill-size.js'), '--max', '5'], { encoding: 'utf-8' });
assert.strictEqual(failing.status, 1);
assert.match(failing.stdout, /❌ skills\/gps\/SKILL\.md: \d+ lines \(max 5\)/);
assert.strictEqual(spawnSync(process.execPath, [path.join(__dirname, 'check-skill-size.js'), '--max'], { encoding: 'utf-8' }).status, 2);

// Router: the command table and the references files match one to one.
const listed = [...skill.matchAll(/^\| `\/gps (\w+)/gm)].map((m) => m[1]).sort();
assert.deepStrictEqual(Object.keys(refs).sort(), listed);
for (const command of listed) assert.ok(skill.includes(`\`references/${command}.md\``), `SKILL.md must route /gps ${command}`);
assert.match(skill, /`<name>\.js` means `node \$\{CLAUDE_SKILL_DIR\}\/scripts\/<name>\.js`/);
// The scripts are pre-approved under the same path the router gives them.
// Pre-approved: exactly one rule per script (the directory's review asks for the
// exact commands, not a wildcard over scripts/), each matching it with or without arguments.
const approved = [...skill.split(/^---$/m)[1].matchAll(/^  - Bash\(node \$\{CLAUDE_SKILL_DIR\}\/scripts\/([a-z-]+\.js) \*\)$/gm)].map((m) => m[1]);
assert.deepStrictEqual(approved, [...scripts].sort(), 'allowed-tools lists every script once, in order, and nothing else');
assert.doesNotMatch(skill, /scripts\/\*\)/, 'no wildcard over scripts/');
assert.match(skill, /^argument-hint: "<[a-z|]+> \[args\]"$/m);
assert.match(skill, /unless the references file says how to recover/);
// The description names every command, so the skill triggers on each.
const description = skill.match(/^description: "(.*)"$/m)[1];
for (const command of listed) assert.ok(description.includes(`/gps ${command}`), `description must mention /gps ${command}`);
// No procedures in the router: no numbered steps.
assert.doesNotMatch(skill, /^\d+\. /m, 'SKILL.md holds no step-by-step procedures');

// Every script a reference or SKILL.md names exists; every script is used by a reference.
const named = new Set();
for (const text of [skill, ...Object.values(refs)]) {
  for (const [, name] of text.matchAll(/`([a-z-]+\.js)\b/g)) named.add(name);
}
for (const name of named) {
  if (name !== '<name>.js') assert.ok(scripts.includes(name), `a reference names ${name}, which does not exist`);
}
for (const name of scripts) assert.ok(named.has(name), `no reference uses ${name}`);

// Each command's references file runs its own scripts.
const expected = {
  scout: ['scout-merge.js'], start: ['start.js', 'domain-doc.js'], status: ['status.js', 'set-current.js'], clean: ['clean.js'],
  config: ['config.js'], write: ['write-prepare.js', 'write-apply.js'], plan: ['write-prepare.js', 'plan.js'],
  ship: ['write-prepare.js', 'ticket-queue.js', 'ticket-start.js', 'dispatch-prompt.js', 'ticket-check.js', 'ticket-complete.js', 'ticket-block.js'],
  finish: ['finish.js', 'set-current.js'], auto: ['auto-route.js', 'ticket-check.js'], handoff: ['handoff.js'],
  help: ['help.js', 'status.js'], init: ['init.js'],
};
assert.deepStrictEqual(Object.keys(expected).sort(), listed);
for (const [command, names] of Object.entries(expected)) {
  for (const name of names) assert.ok(refs[command].includes(name), `${command}.md must run ${name}`);
}

// Behaviors the references must keep.
assert.match(refs.write, /fix those items in the payload and run it again/);
assert.match(refs.plan, /`references\/write\.md` steps 2–3/);
assert.match(refs.ship, /`references\/write\.md` steps 2–3/);
assert.match(refs.ship, /under `\/gps auto`: back to `references\/auto\.md`/i);
assert.match(refs.ship, /never two subagents live at once/);
assert.match(refs.auto, /writing-plans only drafts/);
assert.match(refs.auto, /except its `Next:` line/);
assert.match(refs.auto, /`⚠️` lines included/);
assert.match(refs.finish, /--close-issue` \(yes\) or `--keep-issue` \(no\)/);
assert.match(refs.start, /Ready for me to implement this\?/);
assert.match(refs.clean, /--dry-run/);
assert.match(refs.help, /Never run a command that changes state/);
for (const name of ['SKILL.md', ...Object.keys(refs)]) {
  const text = name === 'SKILL.md' ? skill : refs[name];
  assert.doesNotMatch(text, /\/gps (ticket|issue|resume)\b/, `${name} names a removed command`);
}

// One test file per script.
for (const name of scripts) {
  assert.ok(fs.existsSync(path.join(__dirname, name.replace(/\.js$/, '.test.js'))), `tests/${name.replace(/\.js$/, '.test.js')} is missing`);
}
const libs = fs.readdirSync(path.join(SCRIPTS, 'lib')).filter((f) => f.endsWith('.js'));
for (const name of libs) {
  assert.ok(fs.existsSync(path.join(__dirname, 'lib', name.replace(/\.js$/, '.test.js'))), `tests/lib/${name.replace(/\.js$/, '.test.js')} is missing`);
}

// Assets are templates only, and every one is used by a script.
const scriptSources = [...scripts.map((f) => path.join(SCRIPTS, f)), ...libs.map((f) => path.join(SCRIPTS, 'lib', f))]
  .map((f) => fs.readFileSync(f, 'utf-8')).join('\n');
for (const asset of fs.readdirSync(path.join(SKILL_DIR, 'assets'))) {
  assert.ok(asset.endsWith('.md'), `assets/${asset} is not a template`);
  assert.ok(scriptSources.includes(`'${asset}'`), `assets/${asset} is never loaded`);
}

// The plugin manifests and package.json carry the same version.
const repo = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf-8'));
const version = readJson('package.json').version;
assert.strictEqual(readJson('.claude-plugin/plugin.json').version, version);
assert.ok(readJson('.claude-plugin/marketplace.json').plugins.every((p) => p.version === version));

// Ready for the Claude plugin directory (claude.com/docs/plugins/pre-submission-checklist):
// `claude plugin validate --strict` warns on a CLAUDE.md at the plugin root, the
// listing needs a README of 40+ words and a license, and the listing fields point
// at a bundled icon and https pages.
assert.ok(!fs.existsSync(path.join(repo, 'CLAUDE.md')), 'developer notes live in .claude/CLAUDE.md, not at the plugin root');
const manifest = readJson('.claude-plugin/plugin.json');
for (const field of ['displayName', 'description', 'author', 'homepage', 'repository', 'license']) assert.ok(manifest[field], `plugin.json sets ${field}`);
assert.ok(fs.existsSync(path.join(repo, manifest.icon)), `plugin.json icon ${manifest.icon} exists`);
for (const field of ['documentationUrl', 'supportUrl', 'privacyPolicyUrl']) assert.match(manifest[field], /^https:\/\//, `plugin.json ${field} is an https URL`);
for (const file of ['README.md', 'LICENSE', 'PRIVACY.md', 'CHANGELOG.md']) assert.ok(fs.existsSync(path.join(repo, file)), `${file} exists`);
const readmeWords = fs.readFileSync(path.join(repo, 'README.md'), 'utf-8').replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length;
// No SVG in the plugin: the directory holds every SVG for review (an SVG can carry
// script); the sources live on the design-sources branch.
assert.deepStrictEqual(spawnSync('git', ['ls-files', '*.svg'], { cwd: repo, encoding: 'utf-8' }).stdout.trim(), '', 'no SVG files in the plugin');
// Effort subagents (decision 0001): one per TICKET_EFFORTS level but inherit, no max,
// identical bodies so a level never changes what the subagent is told.
const { TICKET_EFFORTS } = require('../skills/gps/scripts/lib/ticket-model');
const agentsDir = path.join(repo, 'agents');
const agentFiles = fs.readdirSync(agentsDir).sort();
assert.deepStrictEqual(agentFiles, TICKET_EFFORTS.filter((e) => e !== 'inherit').map((e) => `gps-ticket-${e}.md`).sort());
const agentBodies = new Set();
for (const file of agentFiles) {
  const level = file.match(/^gps-ticket-(.+)\.md$/)[1];
  const text = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
  const [, front, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.match(front, new RegExp(`^name: gps-ticket-${level}$`, 'm'), `${file} name`);
  assert.match(front, new RegExp(`^effort: ${level}$`, 'm'), `${file} effort`);
  assert.match(front, new RegExp(`^description: ".* at ${level} effort\\. Only for /gps ship`, 'm'), `${file} description`);
  assert.doesNotMatch(front, /^(model|tools|hooks|mcpServers|permissionMode):/m, `${file} sets only name, description and effort`);
  agentBodies.add(body);
}
assert.strictEqual(agentBodies.size, 1, 'every gps-ticket agent has the same body');
// The shared .work/ contract names every path gps owns (docs/WORK-DIR.md).
const { GPS_WORK_PATHS } = require('../skills/gps/scripts/lib/git');
const workDirDoc = fs.readFileSync(path.join(repo, 'docs', 'WORK-DIR.md'), 'utf-8');
for (const p of GPS_WORK_PATHS) assert.ok(workDirDoc.includes(`\`${p}`), `docs/WORK-DIR.md names ${p}`);
assert.ok(readmeWords >= 40, 'README has at least 40 words outside code blocks');
assert.match(fs.readFileSync(path.join(repo, 'CHANGELOG.md'), 'utf-8'), new RegExp(`^## ${version.replace(/\./g, '\\.')}$`, 'm'), 'CHANGELOG has an entry for the current version');

console.log('skill.test.js: all assertions passed');
