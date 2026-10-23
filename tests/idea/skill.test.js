// tests/idea/skill.test.js
//
// The idea skill's structure: SKILL.md stays a short router, every command
// it lists has a references file, every script a reference names exists,
// and every script has its own test file. A trimmed adaptation of
// tests/skill.test.js's router checks, pointed at skills/idea.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..', '..', 'skills', 'idea');
const SCRIPTS = path.join(SKILL_DIR, 'scripts');
const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf-8');
const refsDir = path.join(SKILL_DIR, 'references');
const refs = Object.fromEntries(
  fs.readdirSync(refsDir).map((f) => [f.replace(/\.md$/, ''), fs.readFileSync(path.join(refsDir, f), 'utf-8')])
);
const scripts = fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.js'));

// Size: SKILL.md under 100 lines, every reference under 40.
assert.ok(skill.split('\n').length < 100, 'SKILL.md should stay under 100 lines');
for (const [name, text] of Object.entries(refs)) assert.ok(text.split('\n').length <= 40, `references/${name}.md must stay short`);

// Frontmatter basics.
assert.match(skill, /^name: idea$/m);
assert.match(skill, /^argument-hint: "<[a-z|]+> \[args\]"$/m);

// Router: the command table and the references files match one to one, exactly the eight commands.
const listed = [...skill.matchAll(/^\| `\/idea (\w+)/gm)].map((m) => m[1]).sort();
assert.deepStrictEqual(listed, ['capture', 'config', 'drop', 'list', 'plan', 'promote', 'review', 'start']);
assert.deepStrictEqual(Object.keys(refs).sort(), listed);
for (const command of listed) assert.ok(skill.includes(`\`references/${command}.md\``), `SKILL.md must route /idea ${command}`);

// allowed-tools: exactly one Bash line per script on disk, nothing else (six scripts).
const approved = [...skill.split(/^---$/m)[1].matchAll(/^  - Bash\(node \$\{CLAUDE_SKILL_DIR\}\/scripts\/([a-z-]+\.js) \*\)$/gm)].map((m) => m[1]);
assert.strictEqual(scripts.length, 6, 'expected six idea-*.js scripts');
assert.deepStrictEqual(approved.sort(), [...scripts].sort(), 'allowed-tools lists every script once, and nothing else');
assert.doesNotMatch(skill, /scripts\/\*\)/, 'no wildcard over scripts/');

// Every idea-*.js name mentioned in SKILL.md or a reference exists on disk; every script on
// disk is named by at least one reference. No leftover bare `idea.js` reference anywhere.
const named = new Set();
for (const text of [skill, ...Object.values(refs)]) {
  for (const [, name] of text.matchAll(/`([a-z-]+\.js)\b/g)) named.add(name);
}
for (const name of named) assert.ok(scripts.includes(name), `a reference names ${name}, which does not exist`);
for (const name of scripts) assert.ok(named.has(name), `no reference uses ${name}`);
assert.doesNotMatch(skill, /\bidea\.js\b/, 'SKILL.md must not reference the removed single idea.js script');
for (const [name, text] of Object.entries(refs)) {
  assert.doesNotMatch(text, /\bidea\.js\b/, `references/${name}.md must not reference the removed single idea.js script`);
}

// capture.md: the new "no personal repo configured" case, and the reworded Global bullet.
assert.match(refs.capture, /idea-resolve\.js --global/);
assert.match(refs.capture, /idea-config\.js --set-global-root/);
assert.match(refs.capture, /your configured personal repo/);
assert.doesNotMatch(refs.capture, /dotfiles, the skill's own store/);
assert.doesNotMatch(skill, /dotfiles\/\.work\/idea\/global/);

// config.md: new eighth command, calling idea-config.js.
assert.match(refs.config, /idea-config\.js --set-global-root/);

// One test file per script and per lib file.
for (const name of scripts) {
  assert.ok(fs.existsSync(path.join(__dirname, name.replace(/\.js$/, '.test.js'))), `tests/idea/${name.replace(/\.js$/, '.test.js')} is missing`);
}
const libs = fs.readdirSync(path.join(SCRIPTS, 'lib')).filter((f) => f.endsWith('.js'));
for (const name of libs) {
  assert.ok(fs.existsSync(path.join(__dirname, 'lib', name.replace(/\.js$/, '.test.js'))), `tests/idea/lib/${name.replace(/\.js$/, '.test.js')} is missing`);
}

console.log('idea/skill.test.js: all assertions passed');
