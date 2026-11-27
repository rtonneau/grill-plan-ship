#!/usr/bin/env node

/**
 * dispatch-prompt.js [<number>] [--role <role>] [--base <sha>] [--host <claude|codex>] [--model <m>] [--effort <e>] [--json]
 *
 * Builds a role's shared brief (assets/role-<role>.md) and the host's spawn
 * call: on Claude the role's plugin agent, on Codex a fresh child (decision 0019).
 * Ticket roles (implementer, reviewer) take a ticket number; run
 * ticket-start.js <number> first, the prompt points at its log. The
 * branch-reviewer (/gps finish --review) reviews the session from --base;
 * the plan-checker (/gps plan) checks the drafted plan payload before it is saved;
 * the scout (/gps scout) explores one --area, toward an optional --direction, with no session.
 * The parent owns acceptance, Git writes and session state (decision 0016).
 * --model overrides the portable tier (fast, medium, heavy, inherit).
 * --effort overrides low, medium, high, xhigh or inherit (no max). Read-only.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { resolveSession } = require('./lib/session-store');
const { findTicketByNumber } = require('./lib/ticket-lookup');
const { TICKET_MODELS, TICKET_EFFORTS } = require('./lib/ticket-queue');
const { MAX_EFFORT_REASON } = require('./lib/ticket-model');
const { GpsError, UsageError } = require('./lib/guard');
const { readConfig } = require('./lib/project-config');
const { ROLES, buildDispatch } = require('./lib/host-dispatch');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { commitExists } = require('./lib/git');
const { PAYLOAD_FILENAME } = require('./lib/write-payload');

const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

// Ticket roles open with the ticket header, the scout with its area, others with the
// session header; the rules every role shares follow, then the role's own brief.
function buildPrompt(role, vars) {
  const spec = ROLES[role];
  const context = loadTemplate((spec.ticket && 'role-context.md') || (spec.noSession && 'role-scout-context.md') || 'role-session-context.md');
  const text = `${context}${loadTemplate('role-rules.md')}\n${loadTemplate(`role-${role}.md`)}`;
  return renderTemplate(text, { role, ...vars }).trimEnd();
}

function checkArgs([arg], options) {
  const role = options.role || 'implementer';
  const spec = ROLES[role];
  if (!spec) throw new UsageError(`--role must be one of: ${Object.keys(ROLES).join(', ')}.`);
  if (spec.ticket && arg === undefined) throw new UsageError(`The ${role} role needs a ticket number.`);
  if (!spec.ticket && arg !== undefined) throw new UsageError(`The ${role} role takes no ticket number.`);
  if (arg !== undefined && !/^\d+$/.test(arg)) throw new UsageError(`Invalid ticket number: ${arg}`);
  if (spec.base && !SHA.test(options.base || '')) throw new UsageError(`--base must be a full commit SHA for ${role} dispatch.`);
  if (!spec.base && options.base !== null) throw new UsageError('--base is only used by the reviewer roles.');
  if (spec.noSession && !(options.area || '').trim()) throw new UsageError(`The ${role} role needs --area "<architecture area>".`);
  if (!spec.noSession && (options.area !== null || options.direction !== null)) throw new UsageError('--area and --direction are only used by the scout role.');
  const host = options.host || 'claude';
  if (!['claude', 'codex'].includes(host)) throw new UsageError('--host must be one of: claude, codex.');
  if (options.model !== null && !TICKET_MODELS.includes(options.model)) {
    throw new UsageError(`--model must be one of: ${TICKET_MODELS.join(', ')}.`);
  }
  if (options.effort !== null && !TICKET_EFFORTS.includes(options.effort)) {
    const why = options.effort === 'max' ? ` (${MAX_EFFORT_REASON})` : '';
    throw new UsageError(`--effort must be one of: ${TICKET_EFFORTS.join(', ')}${why}.`);
  }
  return { role, spec, arg, host, base: options.base };
}

// The session files a non-ticket role reads, as the brief's bullet lines. The plan
// checker reads the drafted plan payload, before write-apply.js saves it.
function sessionFiles(role, sessionDir) {
  const resume = `- Grill resume: ${path.join(sessionDir, '01-grill', 'resume.md')}`;
  if (role === 'plan-checker') {
    const draft = path.join(sessionDir, PAYLOAD_FILENAME);
    if (!fs.existsSync(draft) || !/^--- ticket: /m.test(fs.readFileSync(draft, 'utf-8'))) {
      throw new GpsError('No drafted plan to check.', `Write the drafted plan and tickets to ${draft} first (write-prepare.js prints the skeleton), then dispatch the plan checker.`);
    }
    return [resume, `- Plan draft: ${draft}`].join('\n');
  }
  return [resume, `- Plan: ${path.join(sessionDir, '02-plan', 'plan.md')}`, `- Tickets: ${path.join(sessionDir, '02-plan', 'tickets')}`].join('\n');
}

// What the brief is about, one ticket or the whole session: label, id, hints and template slots.
function subject(role, spec, arg, sessionId, sessionDir) {
  if (!spec.ticket) {
    return {
      label: `session ${sessionId}`, id: sessionId, name: sessionId, task: `gps_${spec.task}`, model: 'inherit', effort: 'inherit',
      vars: { sessionId, sessionFiles: sessionFiles(role, sessionDir) },
    };
  }
  const ticket = findTicketByNumber(sessionDir, Number(arg));
  if (ticket.done) throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) is already Done.`, 'Run ticket-start.js for the next ticket.');
  if (!fs.existsSync(ticket.commitLogPath)) {
    throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) has no workspace yet.`, `Run ticket-start.js ${Number(ticket.num)} first.`);
  }
  return {
    label: `ticket ${ticket.num} (${ticket.slug})`, id: `${ticket.num}-${ticket.slug}`, name: `${ticket.num} ${ticket.slug}`,
    task: `gps_${spec.task}_${ticket.num}`, model: ticket.model, effort: ticket.effort,
    vars: { number: ticket.num, slug: ticket.slug, ticketPath: ticket.ticketPath, commitLogPath: ticket.commitLogPath },
  };
}

// The scout explores one architecture area, with no session: its task name carries
// the area so several explorers can run side by side.
function scoutSubject(spec, area, direction) {
  const slug = area.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'area';
  return {
    label: `area "${area}"`, id: area, name: area, task: `gps_${spec.task}_${slug}`, model: 'inherit', effort: 'inherit',
    vars: { area, direction: direction || 'none given: report the strongest improvements you find' },
  };
}

main({
  usage: `dispatch-prompt.js [<number>] [--role <${Object.keys(ROLES).join('|')}>] [--base <sha>] [--area <a> [--direction <d>]] [--host <claude|codex>] [--model <fast|medium|heavy|inherit>] [--effort <low|medium|high|xhigh|inherit>] [--json]`,
  positionals: { min: 0, max: 1 },
  options: { host: 'string', model: 'string', effort: 'string', role: 'string', base: 'string', area: 'string', direction: 'string' },
  run({ positionals, options, projectRoot }) {
    const { role, spec, arg, host, base } = checkArgs(positionals, options);
    let about;
    let scratchDir = '';
    if (spec.noSession) {
      about = scoutSubject(spec, options.area.trim(), (options.direction || '').trim());
    } else {
      const { sessionId, sessionDir, config } = resolveSession(projectRoot);
      about = subject(role, spec, arg, sessionId, sessionDir);
      scratchDir = config.scratch_dir || `.scratch/tests/${sessionId}`;
    }
    if (spec.base && !commitExists(projectRoot, base)) {
      throw new GpsError(`Review base ${base} is not an available commit.`, 'Use the base recorded before implementation; do not substitute a moving ref.');
    }

    const model = options.model || about.model;
    const effort = options.effort || about.effort;
    const prompt = buildPrompt(role, { ...about.vars, base, projectRoot, scratchDir });
    const { call, notes, lifecycle } = buildDispatch(host, {
      role, model, effort,
      requiredModel: options.model !== null && model !== 'inherit',
      requiredEffort: options.effort !== null && effort !== 'inherit',
      description: `gps ${spec.task.replace(/_/g, ' ')} ${about.name}`.slice(0, 60),
      taskName: about.task,
      prompt,
    }, host === 'codex' ? readConfig(projectRoot) || {} : {});
    const text = [
      `${host === 'claude' ? 'Agent' : 'Codex spawn_agent'} tool call for ${about.label}, model ${model}, effort ${effort}:`,
      ...Object.entries(call).filter(([key]) => !['prompt', 'message'].includes(key)).map(([key, value]) => `- ${key}: ${value}`),
      ...notes.map((note) => `- Note: ${note}`),
      `- Lifecycle: ${lifecycle}`,
      host === 'claude' ? '- prompt:' : '- message:',
      '',
      '````',
      prompt,
      '````',
    ].join('\n');
    return { text, data: { [(spec.ticket && 'ticket') || (spec.noSession && 'area') || 'session']: about.id, role, base, host, model, effort, call, notes, lifecycle } };
  },
});
