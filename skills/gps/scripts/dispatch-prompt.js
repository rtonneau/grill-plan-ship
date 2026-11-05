#!/usr/bin/env node

/**
 * dispatch-prompt.js <number> [--role <implementer|reviewer>] [--base <sha>] [--host <claude|codex>] [--model <m>] [--effort <e>] [--json]
 *
 * /gps ship, delegate mode: builds the shared ticket brief and the host's
 * spawn call. Behavioral roles share context, permissions and host adapters.
 * The parent owns acceptance, Git writes and session state (decision 0016).
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
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { commitExists } = require('./lib/git');

function buildPrompt(ticket, { role, base, projectRoot, scratchDir }) {
  const roleTemplate = role === 'reviewer' ? 'role-reviewer.md' : 'role-implementer.md';
  return renderTemplate(`${loadTemplate('role-context.md')}\n${loadTemplate(roleTemplate)}`, {
    role, base, projectRoot, scratchDir, number: ticket.num, slug: ticket.slug,
    ticketPath: ticket.ticketPath, commitLogPath: ticket.commitLogPath,
  }).trimEnd();
}

main({
  usage: 'dispatch-prompt.js <number> [--role <implementer|reviewer>] [--base <sha>] [--host <claude|codex>] [--model <fast|medium|heavy|inherit>] [--effort <low|medium|high|xhigh|inherit>] [--json]',
  positionals: { min: 1, max: 1 },
  options: { host: 'string', model: 'string', effort: 'string', role: 'string', base: 'string' },
  run({ positionals: [arg], options, projectRoot }) {
    if (!/^\d+$/.test(arg)) throw new UsageError(`Invalid ticket number: ${arg}`);
    const host = options.host || 'claude';
    const role = options.role || 'implementer';
    const base = options.base;
    if (!['implementer', 'reviewer'].includes(role)) throw new UsageError('--role must be one of: implementer, reviewer.');
    if (role === 'reviewer' && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(base || '')) {
      throw new UsageError('--base must be a full commit SHA for reviewer dispatch.');
    }
    if (role !== 'reviewer' && base !== null) throw new UsageError('--base is only used by the reviewer role.');
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
    if (role === 'reviewer' && !commitExists(projectRoot, base)) {
      throw new GpsError(`Review base ${base} is not an available commit.`, 'Use the base recorded before implementation; do not substitute a moving ref.');
    }

    const model = options.model || ticket.model;
    const effort = options.effort || ticket.effort;
    const prompt = buildPrompt(ticket, { role, base, projectRoot, scratchDir: config.scratch_dir || `.scratch/tests/${sessionId}` });
    const { call, notes, lifecycle } = buildDispatch(host, {
      model, effort,
      requiredModel: options.model !== null && model !== 'inherit',
      requiredEffort: options.effort !== null && effort !== 'inherit',
      description: `gps ${role === 'reviewer' ? 'review' : 'ticket'} ${ticket.num} ${ticket.slug}`.slice(0, 60),
      taskName: `gps_${role === 'reviewer' ? 'review' : 'ticket'}_${ticket.num}`,
      prompt,
    }, host === 'codex' ? readConfig(projectRoot) || {} : {});
    const text = [
      `${host === 'claude' ? 'Agent' : 'Codex spawn_agent'} tool call for ticket ${ticket.num} (${ticket.slug}), model ${model}, effort ${effort}:`,
      ...Object.entries(call).filter(([key]) => !['prompt', 'message'].includes(key)).map(([key, value]) => `- ${key}: ${value}`),
      ...notes.map((note) => `- Note: ${note}`),
      `- Lifecycle: ${lifecycle}`,
      host === 'claude' ? '- prompt:' : '- message:',
      '',
      '````',
      prompt,
      '````',
    ].join('\n');
    return { text, data: { ticket: `${ticket.num}-${ticket.slug}`, role, base, host, model, effort, call, notes, lifecycle } };
  },
});
