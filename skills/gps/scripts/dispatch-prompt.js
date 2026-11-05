#!/usr/bin/env node

/**
 * dispatch-prompt.js <number> [--host <claude|codex>] [--model <m>] [--effort <e>] [--json]
 *
 * /gps ship, delegate mode: builds the shared ticket brief and the host's
 * spawn call. The child implements, verifies and fills the commit log; the
 * parent stays the only process that touches git and session state, so a
 * sandbox with a read-only .git works the same way (decision 0014).
 * --model overrides the portable ticket tier (fast, medium, heavy, inherit).
 * --effort overrides low, medium, high, xhigh or inherit (no max).
 * Run ticket-start.js <number> first: the prompt points at its log. Read-only.
 */

const fs = require('fs');
const { main } = require('./lib/cli');
const { resolveSession } = require('./lib/session-store');
const { findTicketByNumber } = require('./lib/ticket-lookup');
const { TICKET_MODELS, TICKET_EFFORTS } = require('./lib/ticket-queue');
const { MAX_EFFORT_REASON } = require('./lib/ticket-model');
const { GpsError, UsageError } = require('./lib/guard');
const { readConfig } = require('./lib/project-config');
const { buildDispatch } = require('./lib/host-dispatch');

function buildPrompt(ticket, scratchDir) {
  return [
    `Implement ticket ${ticket.num} (${ticket.slug}) of a planned session, in the current repository. Earlier tickets are already committed: the ticket text and the repository are your whole context.`,
    '',
    `- Spec: ${ticket.ticketPath}`,
    `- Commit log: ${ticket.commitLogPath}`,
    `- Scratch dir for every build, run and test artifact: ${scratchDir} (copy any output you cite into its evidence/ folder; build trees there are deleted when the session finishes)`,
    '',
    '1. Read the spec and the code it names, then implement it so every Acceptance Criterion holds.',
    '2. Run its Verification Step. On a failure, find the cause and fix it, then run it again.',
    '3. In the commit log, replace the gps:fill markers of Local Test Result, Review Notes and Blockers / Challenges ("None" if none).',
    '',
    'You are the only writer in this tree. The parent session owns git and session state: leave your changes unstaged and uncommitted, and leave the ticket scripts to it.',
    'When a permission or sandbox denial stops you, report it as BLOCKED with the exact denied action.',
    '',
    'End with exactly one line: `READY — <files you changed, comma-separated> — <verification result>` or `BLOCKED — <cause, and what you tried>`.',
  ].join('\n');
}

main({
  usage: 'dispatch-prompt.js <number> [--host <claude|codex>] [--model <fast|medium|heavy|inherit>] [--effort <low|medium|high|xhigh|inherit>] [--json]',
  positionals: { min: 1, max: 1 },
  options: { host: 'string', model: 'string', effort: 'string' },
  run({ positionals: [arg], options, projectRoot }) {
    if (!/^\d+$/.test(arg)) throw new UsageError(`Invalid ticket number: ${arg}`);
    const host = options.host || 'claude';
    if (!['claude', 'codex'].includes(host)) throw new UsageError('--host must be one of: claude, codex.');
    if (options.model !== null && !TICKET_MODELS.includes(options.model)) {
      throw new UsageError(`--model must be one of: ${TICKET_MODELS.join(', ')}.`);
    }
    if (options.effort !== null && !TICKET_EFFORTS.includes(options.effort)) {
      const why = options.effort === 'max' ? ` (${MAX_EFFORT_REASON})` : '';
      throw new UsageError(`--effort must be one of: ${TICKET_EFFORTS.join(', ')}${why}.`);
    }

    const { sessionId, sessionDir, config } = resolveSession(projectRoot);
    const ticket = findTicketByNumber(sessionDir, Number(arg));
    if (ticket.done) throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) is already Done.`, 'Run ticket-start.js for the next ticket.');
    if (!fs.existsSync(ticket.commitLogPath)) {
      throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) has no workspace yet.`, `Run ticket-start.js ${Number(ticket.num)} first.`);
    }

    const model = options.model || ticket.model;
    const effort = options.effort || ticket.effort;
    const prompt = buildPrompt(ticket, config.scratch_dir || `.scratch/tests/${sessionId}`);
    const { call, notes } = buildDispatch(host, {
      model, effort,
      description: `gps ticket ${ticket.num} ${ticket.slug}`.slice(0, 60),
      taskName: `gps_ticket_${ticket.num}`,
      prompt,
    }, host === 'codex' ? readConfig(projectRoot) || {} : {});
    const text = [
      `${host === 'claude' ? 'Agent' : 'Codex spawn_agent'} tool call for ticket ${ticket.num} (${ticket.slug}), model ${model}, effort ${effort}:`,
      ...Object.entries(call).filter(([key]) => !['prompt', 'message'].includes(key)).map(([key, value]) => `- ${key}: ${value}`),
      ...notes.map((note) => `- Note: ${note}`),
      host === 'claude' ? '- prompt:' : '- message:',
      '',
      '````',
      prompt,
      '````',
    ].join('\n');
    return { text, data: { ticket: `${ticket.num}-${ticket.slug}`, host, model, effort, call, notes } };
  },
});
