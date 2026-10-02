#!/usr/bin/env node

/**
 * dispatch-prompt.js <number> --mode <subagent|subagent+inline> [--model <m>] [--json]
 *
 * /gps ship, subagent modes: prints the Agent tool call for one ticket —
 * subagent_type, model (left out for inherit), description and the full
 * prompt, with every path and command already filled in. --model overrides
 * the ticket's **Model:** hint and must be haiku, sonnet, opus or inherit.
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
const { TICKET_MODELS, SHIP_MODES } = require('./lib/ticket-queue');
const { GpsError, UsageError } = require('./lib/guard');

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
  usage: 'dispatch-prompt.js <number> --mode <subagent|subagent+inline> [--model <haiku|sonnet|opus|inherit>] [--json]',
  positionals: { min: 1, max: 1 },
  options: { mode: 'string', model: 'string' },
  run({ positionals: [arg], options, projectRoot }) {
    if (!/^\d+$/.test(arg)) throw new UsageError(`Invalid ticket number: ${arg}`);
    if (!MODES.includes(options.mode)) throw new UsageError(`--mode must be one of: ${MODES.join(', ')}.`);
    if (options.model !== null && !TICKET_MODELS.includes(options.model)) {
      throw new UsageError(`--model must be one of: ${TICKET_MODELS.join(', ')}.`);
    }

    const { sessionId, sessionDir, config } = resolveSession(projectRoot);
    const ticket = findTicketByNumber(sessionDir, Number(arg));
    if (ticket.done) throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) is already Done.`, 'Run ticket-start.js for the next ticket.');
    if (!fs.existsSync(ticket.commitLogPath)) {
      throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) has no workspace yet.`, `Run ticket-start.js ${Number(ticket.num)} first.`);
    }

    const model = options.model || ticket.model;
    const call = {
      subagent_type: 'general-purpose',
      ...(model !== 'inherit' && { model }),
      description: `gps ticket ${ticket.num} ${ticket.slug}`.slice(0, 60),
      prompt: buildPrompt(ticket, options.mode, config.scratch_dir || `.scratch/tests/${sessionId}`),
    };
    const text = [
      `Agent tool call for ticket ${ticket.num} (${ticket.slug}), mode ${options.mode}, model ${model}:`,
      `- subagent_type: ${call.subagent_type}`,
      `- model: ${model === 'inherit' ? '(leave out: inherit)' : model}`,
      `- description: ${call.description}`,
      '- prompt:',
      '',
      '````',
      call.prompt,
      '````',
      '',
      `Wait for its last line. ${options.mode === 'subagent'
        ? `On DONE run ticket-check.js ${Number(ticket.num)}; on BLOCKED stop the run.`
        : 'On READY review and complete it in this session; on BLOCKED stop the run and leave its changes in place.'}`,
    ].join('\n');
    return { text, data: { ticket: `${ticket.num}-${ticket.slug}`, mode: options.mode, model, call } };
  },
});
