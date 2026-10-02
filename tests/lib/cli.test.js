// tests/lib/cli.test.js — the shared script contract
const assert = require('assert');
const { parseArgs, runScript, EXIT_OK, EXIT_FAILURE, EXIT_USAGE } = require('../../skills/gps/scripts/lib/cli');
const { GpsError, UsageError } = require('../../skills/gps/scripts/lib/guard');

const spec = { positionals: { min: 0, max: 2 }, options: { flag: 'boolean', name: 'string', file: 'list' } };

// Parsing: positionals, booleans, --name value / --name=value, lists, "--".
let parsed = parseArgs(['a', '--flag', '--name', 'x', '--file', 'f1', '--file=f2', 'b'], spec);
assert.deepStrictEqual(parsed.positionals, ['a', 'b']);
assert.deepStrictEqual(parsed.options, { json: false, help: false, flag: true, name: 'x', file: ['f1', 'f2'] });
parsed = parseArgs(['--name=--odd', '--', '--not-an-option'], spec);
assert.strictEqual(parsed.options.name, '--odd');
assert.deepStrictEqual(parsed.positionals, ['--not-an-option']);
assert.strictEqual(parseArgs(['--json'], spec).options.json, true);

// Every bad argument is a UsageError.
for (const [argv, message] of [
  [['--bogus'], /Unknown option: --bogus/],
  [['--flag=1'], /takes no value/],
  [['--name'], /needs a value/],
  [['--name='], /needs a value/],
  [['--name', 'a', '--name', 'b'], /given twice/],
  [['a', 'b', 'c'], /Unexpected argument: c/],
]) {
  assert.throws(() => parseArgs(argv, spec), (err) => err instanceof UsageError && message.test(err.message), argv.join(' '));
}
assert.throws(() => parseArgs([], { positionals: { min: 1, max: 1 } }), /Missing arguments/);
assert.doesNotThrow(() => parseArgs(['--help'], { positionals: { min: 1, max: 1 } }), '--help skips the arity check');

// runScript: output and exit codes, with console captured.
function capture(fn) {
  const out = [];
  const err = [];
  const { log, error } = console;
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => err.push(a.join(' '));
  try {
    return { code: fn(), out: out.join('\n'), err: err.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}
const script = (run) => ({ usage: 'demo.js [--json]', options: { flag: 'boolean' }, run });

let res = capture(() => runScript(script(() => ({ text: 'hello', data: { a: 1 } })), []));
assert.deepStrictEqual(res, { code: EXIT_OK, out: 'hello', err: '' });
res = capture(() => runScript(script(() => ({ text: 'hello', data: { a: 1 } })), ['--json']));
assert.deepStrictEqual(JSON.parse(res.out), { a: 1 });
res = capture(() => runScript(script(() => ({ text: 'x' })), ['--json']));
assert.strictEqual(res.out, '{}');
res = capture(() => runScript(script(() => { throw new Error('never'); }), ['--help']));
assert.deepStrictEqual(res, { code: EXIT_OK, out: 'Usage: demo.js [--json]', err: '' });

res = capture(() => runScript(script(({ warn }) => { warn('careful'); return { text: 'ok' }; }), []));
assert.strictEqual(res.err, '⚠️  careful');

res = capture(() => runScript(script(() => { throw new GpsError('It broke.', 'Do this.'); }), []));
assert.deepStrictEqual(res, { code: EXIT_FAILURE, out: '', err: '❌ It broke.\n   Do this.' });
res = capture(() => runScript(script(() => { throw new Error('boom'); }), []));
assert.deepStrictEqual(res, { code: EXIT_FAILURE, out: '', err: '❌ Unexpected error: boom' });
res = capture(() => runScript(script(() => ({})), ['--nope']));
assert.deepStrictEqual(res, { code: EXIT_USAGE, out: '', err: '❌ Unknown option: --nope\n   Usage: demo.js [--json]' });
res = capture(() => runScript(script(() => { throw new UsageError('Bad id.', 'Ids: a, b'); }), []));
assert.deepStrictEqual(res, { code: EXIT_USAGE, out: '', err: '❌ Bad id.\n   Ids: a, b' });

console.log('cli.test.js: all assertions passed');
