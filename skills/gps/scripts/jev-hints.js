#!/usr/bin/env node

/**
 * jev-hints.js [--json]
 *
 * /gps plan, step 4: reads drafted ticket blocks from stdin (the same
 * "--- ticket: NN-<slug> ---" format write-apply.js's payload uses) and,
 * if Jev is enabled (.work/gps-config.json jev.enabled, backed by
 * TYPESAFE_API_KEY), asks it to judge each ticket's Model and Effort in
 * one batched call. Falls back to { used: false } — never a GpsError —
 * when Jev is not enabled or the call fails for any reason; Claude then
 * applies its own judgment for those tickets instead.
 */

const fs = require('fs');
const { mainAsync } = require('./lib/cli');
const { parsePayload } = require('./lib/write-payload');
const { jevEnabled } = require('./lib/project-config');
const { classifyTickets, diagnoseJev } = require('./lib/jev');
const { UsageError } = require('./lib/guard');

function readTickets() {
  const raw = fs.readFileSync(0, 'utf-8');
  const { tickets, errors } = parsePayload(raw);
  if (errors.length > 0) throw new UsageError(errors.join(' '));
  if (tickets.length === 0) {
    throw new UsageError('No tickets: pipe at least one "--- ticket: NN-<slug> ---" block via stdin.');
  }
  const empty = tickets.find((t) => !t.body.trim());
  if (empty) throw new UsageError(`Ticket "${empty.name}" is empty.`);
  return tickets;
}

function formatLine(name, hint) {
  return `${name}: Model ${hint.model} (${hint.modelRaw}, confidence ${hint.modelConfidence}) · Effort ${hint.effort} (confidence ${hint.effortConfidence})`;
}

mainAsync({
  usage: 'jev-hints.js [--json]',
  async run({ projectRoot, warn }) {
    const tickets = readTickets();
    if (!jevEnabled(projectRoot)) {
      return {
        text: 'Jev is not enabled; use your own judgment for every ticket.',
        data: { used: false, reason: 'jev.enabled is false', tickets: {} },
      };
    }
    const diagnosis = diagnoseJev();
    if (!diagnosis.enabled) {
      return {
        text: 'Jev is not enabled; use your own judgment for every ticket.',
        data: { used: false, reason: `${diagnosis.reason}.`, tickets: {} },
      };
    }
    try {
      const result = await classifyTickets(tickets);
      return {
        text: tickets.map((t) => formatLine(t.name, result[t.name])).join('\n'),
        data: { used: true, tickets: result },
      };
    } catch (err) {
      warn(`Jev call failed: ${err.message}`);
      return {
        text: 'Jev call failed; use your own judgment for every ticket.',
        data: { used: false, reason: err.message, tickets: {} },
      };
    }
  },
});
