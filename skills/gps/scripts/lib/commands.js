// skills/gps/scripts/lib/commands.js
//
// The command manifest outside tools read through help.js --json
// (docs/STATUS-JSON.md): each command's argument grammar and whether it is
// sendable, that is safe to queue on an agent thread that lacks the
// conversation which built the session. SKILL.md's command table stays the
// router; tests/help.test.js fails when the two name different commands.
//
// An argument is { name, kind, optional } plus:
//   kind 'flag'    values: the switches, at most one of them given
//   kind 'enum'    values: the words it may be
//   kind 'ticket'  a ticket number, 1-99
//   kind 'text' | 'path'  free text or a file path
//   flag           set when the value follows a switch (--from <path>);
//                  otherwise the argument is positional
//   repeat         true when it may be given several times

const flag = (name, values, extra = {}) => ({ name, kind: 'flag', optional: true, values, ...extra });
const MODE = flag('mode', ['--inline', '--delegate']);

const COMMANDS = Object.freeze({
  init: { sendable: false, args: [] },
  scout: {
    sendable: false,
    args: [
      { name: 'review-file', kind: 'path', optional: true, flag: '--from' },
      { name: 'direction', kind: 'text', optional: true },
    ],
  },
  start: {
    sendable: false,
    args: [flag('issue', ['--issue']), flag('worktree', ['--worktree']), { name: 'name', kind: 'text', optional: false }],
  },
  status: { sendable: true, args: [] },
  clean: { sendable: false, args: [{ name: 'id', kind: 'text', optional: true, repeat: true }] },
  config: { sendable: false, args: [flag('rescan', ['--rescan'])] },
  write: { sendable: false, args: [] },
  plan: { sendable: false, args: [] },
  ship: { sendable: true, args: [{ name: 'ticket', kind: 'ticket', optional: true }, MODE] },
  finish: { sendable: true, args: [] },
  auto: { sendable: true, args: [MODE, { name: 'target', kind: 'enum', optional: true, values: ['plan', 'ship', 'finish'] }] },
  handoff: { sendable: true, args: [] },
  release: {
    sendable: false,
    args: [flag('publish', ['--publish']), { name: 'version', kind: 'text', optional: true, flag: '--version' }],
  },
  help: { sendable: true, args: [{ name: 'topic', kind: 'text', optional: true }] },
});

// The manifest entry of a command, or null for a name it does not hold.
function commandSpec(name) {
  return Object.prototype.hasOwnProperty.call(COMMANDS, name) ? COMMANDS[name] : null;
}

module.exports = { COMMANDS, commandSpec };
