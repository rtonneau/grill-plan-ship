#!/usr/bin/env node

/**
 * dispatch-prompt.js <number> --mode <subagent|subagent+inline> [--host <claude|codex>] [--model <m>] [--effort <e>] [--parent-effort <low|medium|high|xhigh>] [--json]
 *
 * /gps ship, subagent modes: builds one shared ticket brief and a host call.
 * --host defaults to claude; codex uses built-in tier mappings, optionally
 * overridden by delegation.codex mappings in the project config.
 * --model overrides the portable ticket tier (fast, medium, heavy, inherit).
 * --effort overrides low, medium, high, xhigh or inherit (no max).
 * Run ticket-start.js <number> first: the prompt points at its log.
 *
 *   subagent          the subagent implements, verifies and completes the
 *                     ticket itself (ticket-complete.js), then reports DONE.
 *   subagent+inline   the subagent implements and verifies only, then
 *                     reports READY; this session reviews and completes it.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { resolveSession } = require('./lib/session-store');
const { findTicketByNumber } = require('./lib/ticket-lookup');
const { TICKET_MODELS, TICKET_EFFORTS, SHIP_MODES } = require('./lib/ticket-queue');
const { MAX_EFFORT_REASON } = require('./lib/ticket-model');
const { GpsError, UsageError } = require('./lib/guard');
const { readConfig } = require('./lib/project-config');
const { buildDispatch, validateParentEffort } = require('./lib/host-dispatch');

const MODES = SHIP_MODES.filter((mode) => mode !== 'inline');
const script = (name) => `node "${path.join(__dirname, name)}"`;

function buildPrompt(ticket, mode, scratchDir) {
  const n = Number(ticket.num);
  const lines = [
    `You are implementing ticket ${ticket.num} (${ticket.slug}) of a planned session, in the current repository.`,
    'Earlier tickets were implemented by other agents that share no memory with you: the ticket text and the repository are all you can rely on.',
    '',
    `- Spec (read it in full; it is your complete brief): ${ticket.ticketPath}`,
    `- Commit log: ${ticket.commitLogPath}`,
    `- Scratch dir for every build/run/test artifact (never the source tree): ${scratchDir}`,
    '',
    '1. Orient: run `git log --oneline -n 20` and read the files the ticket names before assuming anything about earlier tickets.',
    '2. Implement the ticket so every Acceptance Criterion holds.',
    '3. Run its Verification Step command until it passes.',
  ];
  if (mode === 'subagent') {
    lines.push(
      '4. In the commit log, replace the gps:fill markers of Local Test Result, Review Notes and Blockers / Challenges ("None" if none).',
      `5. Commit and close the ticket: ${script('ticket-complete.js')} ${n} --message "<type>: <summary> (ticket ${ticket.num})" --file <path> (one --file per file you changed, nothing else).`,
      `If the Verification Step won't pass after reasonable attempts, or you need something only the user can provide: run ${script('ticket-block.js')} ${n} --reason "<one line>", commit nothing, and stop.`,
      '',
      'Do this ticket yourself: never dispatch subagents of your own.',
      'End with exactly one line: `DONE <commit sha> — <one-line test summary>` or `BLOCKED — <one-line reason>`.',
    );
  } else {
    lines.push(
      '4. Stop there: do not edit the commit log, do not stage or commit anything, and do not run ticket-complete.js or ticket-block.js. This session reviews and commits your work.',
      '',
      'Do this ticket yourself: never dispatch subagents of your own.',
      'End with exactly one line: `READY — <files you changed, comma-separated> — <one-line verification result>` or `BLOCKED — <one-line reason>`.',
    );
  }
  return lines.join('\n');
}

main({
  usage: 'dispatch-prompt.js <number> --mode <subagent|subagent+inline> [--host <claude|codex>] [--model <fast|medium|heavy|inherit>] [--effort <low|medium|high|xhigh|inherit>] [--parent-effort <low|medium|high|xhigh>] [--json]',
  positionals: { min: 1, max: 1 },
  options: { mode: 'string', host: 'string', model: 'string', effort: 'string', 'parent-effort': 'string' },
  run({ positionals: [arg], options, projectRoot }) {
    if (!/^\d+$/.test(arg)) throw new UsageError(`Invalid ticket number: ${arg}`);
    const host = options.host || 'claude';
    if (!['claude', 'codex'].includes(host)) throw new UsageError('--host must be one of: claude, codex.');
    if (!MODES.includes(options.mode)) throw new UsageError(`--mode must be one of: ${MODES.join(', ')}.`);
    if (options.model !== null && !TICKET_MODELS.includes(options.model)) {
      throw new UsageError(`--model must be one of: ${TICKET_MODELS.join(', ')}.`);
    }
    if (options.effort !== null && !TICKET_EFFORTS.includes(options.effort)) {
      const why = options.effort === 'max' ? ` (${MAX_EFFORT_REASON})` : '';
      throw new UsageError(`--effort must be one of: ${TICKET_EFFORTS.join(', ')}${why}.`);
    }

    validateParentEffort(host, options['parent-effort']);

    const { sessionId, sessionDir, config } = resolveSession(projectRoot);
    const ticket = findTicketByNumber(sessionDir, Number(arg));
    if (ticket.done) throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) is already Done.`, 'Run ticket-start.js for the next ticket.');
    if (!fs.existsSync(ticket.commitLogPath)) {
      throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) has no workspace yet.`, `Run ticket-start.js ${Number(ticket.num)} first.`);
    }

    const model = options.model || ticket.model;
    const effort = options.effort || ticket.effort;
    const prompt = buildPrompt(ticket, options.mode, config.scratch_dir || `.scratch/tests/${sessionId}`);
    const call = buildDispatch(host, {
      model, effort, parentEffort: options['parent-effort'],
      description: `gps ticket ${ticket.num} ${ticket.slug}`.slice(0, 60),
      taskName: `gps_ticket_${ticket.num}`,
      prompt,
    }, host === 'codex' ? readConfig(projectRoot) || {} : {});
    const text = [
      `${host === 'claude' ? 'Agent' : 'Codex spawn_agent'} tool call for ticket ${ticket.num} (${ticket.slug}), mode ${options.mode}, model ${model}, effort ${effort}:`,
      ...Object.entries(call).filter(([key]) => !['prompt', 'message'].includes(key)).map(([key, value]) =>
        `- ${key}: ${value}${key === 'subagent_type' ? (effort === 'inherit' ? ' (effort: inherit, the session\'s own)' : ` (sets effort ${effort})`) : ''}`),
      host === 'claude' ? '- prompt:' : '- message:',
      '',
      '````',
      prompt,
      '````',
      '',
      `Wait for its last line. ${options.mode === 'subagent'
        ? `On DONE run ticket-check.js ${Number(ticket.num)}; on BLOCKED stop the run.`
        : 'On READY review and complete it in this session; on BLOCKED stop the run and leave its changes in place.'}`,
    ].join('\n');
    return { text, data: { ticket: `${ticket.num}-${ticket.slug}`, host, mode: options.mode, model, effort, call } };
  },
});
