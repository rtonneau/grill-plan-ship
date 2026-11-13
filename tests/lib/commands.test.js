// tests/lib/commands.test.js
const assert = require('assert');
const { COMMANDS, commandSpec } = require('../../skills/gps/scripts/lib/commands');

assert.ok(Object.isFrozen(COMMANDS));
assert.deepStrictEqual(Object.keys(COMMANDS).filter((name) => COMMANDS[name].sendable).sort(),
  ['auto', 'finish', 'handoff', 'help', 'ship', 'status']);

// Every argument follows the grammar documented in docs/STATUS-JSON.md.
for (const [name, spec] of Object.entries(COMMANDS)) {
  assert.strictEqual(typeof spec.sendable, 'boolean', `${name}.sendable`);
  for (const arg of spec.args) {
    assert.strictEqual(typeof arg.name, 'string', `${name} arg name`);
    assert.ok(['flag', 'enum', 'ticket', 'text', 'path'].includes(arg.kind), `${name}.${arg.name} kind`);
    assert.strictEqual(typeof arg.optional, 'boolean', `${name}.${arg.name} optional`);
    if (arg.kind === 'flag' || arg.kind === 'enum') assert.ok(Array.isArray(arg.values) && arg.values.length > 0);
    if (arg.kind === 'flag') assert.ok(arg.values.every((v) => v.startsWith('--')) && arg.optional);
  }
}

// Sendable commands take nothing the dashboard could not check: no free path.
for (const [name, spec] of Object.entries(COMMANDS)) {
  if (spec.sendable) assert.ok(spec.args.every((a) => a.kind !== 'path'), `${name} takes no path`);
}

assert.strictEqual(commandSpec('ship'), COMMANDS.ship);
assert.strictEqual(commandSpec('bogus'), null);
assert.strictEqual(commandSpec('toString'), null, 'inherited names are not commands');

console.log('commands.test.js: all assertions passed');
