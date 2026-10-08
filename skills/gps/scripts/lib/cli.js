// skills/gps/scripts/lib/cli.js
//
// The one entry point every script uses, so all of them share one contract:
//
//   args    positionals, then long options: --flag (boolean), --name <value>
//           or --name=<value> (string), repeatable list options; "--" ends
//           options. Every script also accepts --json and --help.
//   stdout  the handler's text (plain markdown, relayed to the user as is),
//           or with --json a single JSON object (the handler's data).
//   stderr  "⚠️  <warning>" lines; on failure "❌ <what failed>" and a
//           "   <hint>" line.
//   exit    0 success, 1 failure (a precondition or validation failed;
//           nothing was changed unless the message says otherwise),
//           2 usage error (bad arguments; nothing was changed).

const { GpsError, UsageError } = require('./guard');

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

// spec.options: { name: 'boolean' | 'string' | 'list' }. Returns
// { positionals, options } or throws a UsageError.
function parseArgs(argv, spec) {
  const types = { json: 'boolean', help: 'boolean', ...(spec.options || {}) };
  const options = {};
  for (const [name, type] of Object.entries(types)) {
    options[name] = type === 'boolean' ? false : type === 'list' ? [] : null;
  }
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    const type = types[name];
    if (!type) throw new UsageError(`Unknown option: --${name}`);
    if (type === 'boolean') {
      if (eq !== -1) throw new UsageError(`--${name} takes no value.`);
      options[name] = true;
      continue;
    }
    let value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (value === undefined || value === '') throw new UsageError(`--${name} needs a value.`);
    if (type === 'list') options[name].push(value);
    else if (options[name] !== null) throw new UsageError(`--${name} given twice.`);
    else options[name] = value;
  }

  const { min = 0, max = 0 } = spec.positionals || {};
  if (!options.help) {
    if (positionals.length < min) throw new UsageError('Missing arguments.');
    if (positionals.length > max) throw new UsageError(`Unexpected argument: ${positionals[max]}`);
  }
  return { positionals, options };
}

function warn(message) {
  console.error(`⚠️  ${message}`);
}

function printFailure(err, usage) {
  if (err instanceof GpsError) {
    console.error(`❌ ${err.message}`);
    const hint = err instanceof UsageError ? err.hint || `Usage: ${usage}` : err.hint;
    if (hint) console.error(`   ${hint}`);
    return err instanceof UsageError ? EXIT_USAGE : EXIT_FAILURE;
  }
  console.error(`❌ Unexpected error: ${err && err.message ? err.message : err}`);
  return EXIT_FAILURE;
}

// Runs a script. spec: { usage, positionals: { min, max }, options, run }.
// run({ positionals, options, projectRoot, warn }) returns { text, data }.
function runScript(spec, argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv, spec);
    if (parsed.options.help) {
      console.log(`Usage: ${spec.usage}`);
      return EXIT_OK;
    }
    const { text, data } = spec.run({ ...parsed, projectRoot: process.cwd(), warn }) || {};
    if (parsed.options.json) console.log(JSON.stringify(data === undefined ? {} : data, null, 2));
    else if (text) console.log(text);
    return EXIT_OK;
  } catch (err) {
    return printFailure(err, spec.usage);
  }
}

// What scripts call: runs and exits with the contract's code.
function main(spec) {
  process.exitCode = runScript(spec);
}

// Async counterpart to runScript/main: for scripts whose run() returns a
// Promise (e.g. ones that call fetch). Scripts that don't need this keep
// using the synchronous runScript/main.
async function runScriptAsync(spec, argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv, spec);
    if (parsed.options.help) {
      console.log(`Usage: ${spec.usage}`);
      return EXIT_OK;
    }
    const { text, data } = (await spec.run({ ...parsed, projectRoot: process.cwd(), warn })) || {};
    if (parsed.options.json) console.log(JSON.stringify(data === undefined ? {} : data, null, 2));
    else if (text) console.log(text);
    return EXIT_OK;
  } catch (err) {
    return printFailure(err, spec.usage);
  }
}

function mainAsync(spec) {
  runScriptAsync(spec).then((code) => { process.exitCode = code; });
}

module.exports = {
  EXIT_OK, EXIT_FAILURE, EXIT_USAGE, parseArgs, runScript, main, runScriptAsync, mainAsync, warn,
};
