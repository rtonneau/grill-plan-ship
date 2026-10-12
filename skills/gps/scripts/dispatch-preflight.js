#!/usr/bin/env node

// Read-only validation of the entire pending delegated queue. Runtime tool and
// account capabilities must still be verified by the host before ticket-start.
const { main } = require('./lib/cli');
const { resolveSession } = require('./lib/session-store');
const { readyTickets } = require('./lib/ticket-lookup');
const { TICKET_MODELS, TICKET_EFFORTS, SHIP_MODES } = require('./lib/ticket-queue');
const { readConfig } = require('./lib/project-config');
const { buildDispatch, resolveCodexHints, validateParentEffort } = require('./lib/host-dispatch');
const { GpsError, UsageError } = require('./lib/guard');

main({
  usage: 'dispatch-preflight.js --host <claude|codex> --mode <subagent|subagent+inline> [--parent-effort <low|medium|high|xhigh>] [--override <N>=<model>/<effort>]... [--json]',
  options: { host: 'string', mode: 'string', 'parent-effort': 'string', override: 'list' },
  run({ options, projectRoot, warn }) {
    const { host, mode } = options;
    if (!['claude', 'codex'].includes(host)) throw new UsageError('--host must be one of: claude, codex.');
    if (!SHIP_MODES.filter((m) => m !== 'inline').includes(mode)) {
      throw new UsageError('--mode must be one of: subagent, subagent+inline.');
    }
    const parentEffort = options['parent-effort'];
    validateParentEffort(host, parentEffort);
    const overrides = new Map();
    for (const raw of options.override) {
      const match = /^(\d+)=([^/]+)\/([^/]+)$/.exec(raw);
      if (!match || !Number.isSafeInteger(Number(match[1]))
        || !TICKET_MODELS.includes(match[2]) || !TICKET_EFFORTS.includes(match[3])) {
        throw new UsageError(`Invalid --override ${raw}; expected N=model/effort using ticket aliases and levels.`);
      }
      const number = Number(match[1]);
      if (overrides.has(number)) throw new UsageError(`Duplicate --override for ticket ${number}.`);
      overrides.set(number, { model: match[2], effort: match[3] });
    }
    const { sessionId, sessionDir } = resolveSession(projectRoot);
    const pending = readyTickets(sessionDir).tickets.filter((t) => !t.done);
    for (const number of overrides.keys()) {
      if (!pending.some((t) => Number(t.num) === number)) {
        throw new GpsError(`Override ticket ${number} has no pending ticket.`, 'Run ticket-queue.js to inspect the pending queue.');
      }
    }
    const config = readConfig(projectRoot) || {};
    const tickets = [];
    const errors = [];
    for (const ticket of pending) {
      const key = `${ticket.num}-${ticket.slug}`;
      for (const field of ['model', 'effort']) {
        if (ticket[`${field}Invalid`] !== null) {
          warn(`${key}: unknown ${field} ${ticket[`${field}Invalid`]} normalized to inherit.`);
        }
      }
      const { model, effort } = overrides.get(Number(ticket.num)) || ticket;
      try {
        const brief = { model, effort, parentEffort };
        const resolved = host === 'codex' ? resolveCodexHints(brief, config) : buildDispatch(host, brief);
        // Claude's brief fields are absent from this validation report.
        delete resolved.prompt;
        delete resolved.description;
        tickets.push({ ticket: key, model, effort, resolved });
      } catch (err) {
        if (!(err instanceof GpsError) || err instanceof UsageError) throw err;
        errors.push(`${key}: ${err.message}${err.hint ? ` ${err.hint}` : ''}`);
      }
    }
    if (errors.length) throw new GpsError(`Delegation preflight failed:\n${errors.join('\n')}`, 'Fix the reported settings or explicitly choose supported overrides, then run preflight again.');
    const allDone = pending.length === 0;
    return {
      data: { sessionId, host, mode, allDone, tickets },
      text: [allDone ? 'All tickets are done.' : `Delegation preflight passed for ${tickets.length} pending tickets.`,
        ...tickets.map((t) => `${t.ticket}: ${t.model}/${t.effort} -> ${JSON.stringify(t.resolved)}`),
        'Runtime capability verification is still required before ticket-start.'].join('\n'),
    };
  },
});
