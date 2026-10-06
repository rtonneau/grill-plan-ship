#!/usr/bin/env node

/**
 * help.js [command] [--json]
 *
 * /gps help: where the current session stands and what to run next, the
 * workflow in one screen, and every command with when to use it. With a
 * command name: its usage, purpose, when to use it and examples. Commands
 * come from SKILL.md's table and references/<command>.md, so this never
 * drifts from the router. Read-only; works with no session at all.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { sessionsDirOf, resolveCurrentPointer, pointerError, readConfigOrNull } = require('./lib/session-store');
const { computeSessionState } = require('./lib/phase');
const { needsSetup } = require('./lib/setup');
const { UsageError, mdCell } = require('./lib/guard');

const SKILL_DIR = path.join(__dirname, '..');
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const WORKFLOW = [
  '1. **Scout** (optional): `/gps scout` turns a codebase review into ideas.',
  '2. **Grill**: `/gps start <name>` opens a session and questions you until the design is clear.',
  '3. **Plan**: `/gps plan` saves the design and drafts small tickets for you to approve.',
  '4. **Ship**: `/gps ship` implements the tickets, one commit each.',
  '5. **Finish**: `/gps finish` writes the summary (and opens the PR on GitHub projects).',
  '6. **Release** (when you choose): `/gps release` turns the finished sessions\' changelog entries into a version, a tag and, if you say so, a push.',
  '',
  '`/gps auto` runs from the current phase to the end without stopping. `/gps status`, `/gps handoff` and `/gps help` work at any time.',
];

const PHASES = {
  grill: 'Grill: the design is being discussed; once you approve it, it gets saved.',
  'plan-not-started': 'Grill saved: break the work into tickets, or for a small change implement it and finish.',
  plan: 'Plan: tickets are being drafted; once you approve them, they get saved.',
  ship: 'Ship: tickets are being implemented.',
  'finish-pending': 'All tickets are done: close the session.',
  'plan-complete': 'The plan has no tickets left: close the session.',
};

// The command table of SKILL.md: [{ name, usage, summary }].
function readCommands() {
  const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf-8');
  return [...skill.matchAll(/^\| `(\/gps (\w+)[^`]*)` \| (.+?) \| `references\/\w+\.md` \|$/gm)]
    .map(([, usage, name, summary]) => ({ name, usage: usage.replace(/\\\|/g, '|'), summary }));
}

// The **When:** and **Examples:** lines of references/<name>.md.
function readReference(name) {
  const text = fs.readFileSync(path.join(SKILL_DIR, 'references', `${name}.md`), 'utf-8');
  const field = (label) => {
    const match = text.match(new RegExp(`^\\*\\*${label}:\\*\\* (.+)$`, 'm'));
    return match ? match[1].trim() : null;
  };
  return { when: field('When'), examples: field('Examples') };
}

// Where the current session stands, without failing when there is none.
function whereYouAre(projectRoot) {
  const sessionsDir = sessionsDirOf(projectRoot);
  const pointer = resolveCurrentPointer(sessionsDir);
  if (pointer.problem === 'no-sessions') {
    const setup = needsSetup(projectRoot);
    return {
      sessionId: null,
      phase: null,
      lines: setup ? ['No session yet, and gps is not set up in this repository (optional: /gps init).'] : ['No session yet.'],
      next: setup
        ? { command: '/gps init', why: 'Check the project and commit gps\'s setup once; then /gps start <feature-name>.' }
        : { command: '/gps start <feature-name>', why: 'Begin a feature (or /gps scout for ideas first).' },
    };
  }
  if (pointer.problem) {
    const { message, hint } = pointerError(sessionsDir, pointer);
    return {
      sessionId: null, phase: null, lines: [`⚠️ ${message}`, hint],
      next: { command: '/gps status', why: 'See every session and pick one.' },
    };
  }
  const config = readConfigOrNull(sessionsDir, pointer.sessionId);
  const { phase, suggestedNext } = computeSessionState(path.join(sessionsDir, pointer.sessionId), config);
  const name = (config && config.feature_name) || pointer.sessionId;
  return {
    sessionId: pointer.sessionId,
    phase,
    lines: [`- **Session:** ${name} (${pointer.sessionId})`, `- **Phase:** ${PHASES[phase] || phase}`],
    next: suggestedNext,
  };
}

function overview(commands, where) {
  const lines = ['## Where you are', '', ...where.lines, '', '## The workflow', '', ...WORKFLOW, '',
    '## Commands', '', '| Command | When to use it |', '|---|---|'];
  for (const c of commands) lines.push(`| \`${mdCell(c.usage)}\` | ${mdCell(capitalize(c.when || c.summary))} |`);
  lines.push('', 'Details on one command: `/gps help <command>`. Any other question: `/gps help <your question>`.', '',
    `Next: ${where.next.command} — ${where.next.why}`);
  return lines.join('\n');
}

function commandHelp(command, where) {
  const lines = [`## ${command.usage}`, '', command.summary, ''];
  if (command.when) lines.push(`**When:** ${command.when}`, '');
  if (command.examples) lines.push(`**Examples:** ${command.examples}`, '');
  lines.push(`**Right now:** ${where.phase ? `phase ${where.phase}; ` : ''}the next command is \`${where.next.command}\`.`, '',
    `Next: ${where.next.command} — ${where.next.why}`);
  return lines.join('\n');
}

main({
  usage: 'help.js [command] [--json]',
  positionals: { min: 0, max: 1 },
  run({ positionals, projectRoot }) {
    const commands = readCommands().map((c) => ({ ...c, ...readReference(c.name) }));
    const where = whereYouAre(projectRoot);
    const data = { sessionId: where.sessionId, phase: where.phase, suggestedNext: where.next, commands };
    if (positionals.length === 0) return { text: overview(commands, where), data };

    const wanted = positionals[0].replace(/^\/?(gps\s+)?/, '').toLowerCase();
    const command = commands.find((c) => c.name === wanted);
    if (!command) {
      throw new UsageError(`Unknown command "${positionals[0]}".`, `Commands: ${commands.map((c) => c.name).join(', ')}.`);
    }
    return { text: commandHelp(command, where), data: { ...data, command } };
  },
});
