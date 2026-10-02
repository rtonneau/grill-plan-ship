#!/usr/bin/env node

/**
 * write-prepare.js [--json]
 *
 * /gps write, step 1: detects which phase (grill or plan) still needs its
 * output saved and prints the payload skeleton for it: header fields,
 * "## " sections and (plan) a ticket block, each gap marked with
 * <!-- gps:fill … -->. Claude writes the filled skeleton to the printed
 * payload path; write-apply.js turns it into the phase's files. On the plan
 * phase of a GitHub project the skeleton also asks for the session branch.
 * Nothing pending is not an error: it says what to run instead.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { resolveWriteTarget } = require('./lib/write-target');
const { resolveSession } = require('./lib/session-store');
const { touchPhase } = require('./lib/token-usage');
const { PAYLOAD_FILENAME, loadPhaseFile, expectedHeadings, expectedFields, buildSkeleton } = require('./lib/write-payload');
const { BRANCH_TYPES, BRANCH_PATTERN } = require('./lib/git');
const { githubEnabled } = require('./lib/project-config');
const { writeJsonAtomic } = require('./lib/guard');

const NOTHING_PENDING = {
  'plan-not-started': 'Nothing to write: the grill is saved and no plan is started. Next: /gps plan (bounded work: implement it, then /gps finish).',
  complete: 'Nothing to write: the grill and the plan are saved. Next: /gps status.',
};

main({
  usage: 'write-prepare.js [--json]',
  run({ projectRoot }) {
    const { sessionId, sessionDir, configPath, config } = resolveSession(projectRoot);
    const result = resolveWriteTarget(sessionDir);
    if (result.target === 'none') {
      return { text: NOTHING_PENDING[result.reason], data: { sessionId, sessionDir, ...result } };
    }

    touchPhase(config, result.target);
    writeJsonAtomic(configPath, config);

    const phaseFile = loadPhaseFile(sessionDir, result.target, config);
    const payloadPath = path.join(sessionDir, PAYLOAD_FILENAME);
    const existingPayload = fs.existsSync(payloadPath);
    const fields = expectedFields(phaseFile);
    const extraFields = [];
    // GitHub projects: the plan payload also names the session branch
    // (unless the session already has one); write-apply.js creates it.
    if (result.target === 'plan' && !config.git && githubEnabled(projectRoot)) {
      fields.unshift('Branch');
      extraFields.push(`**Branch:** <!-- gps:fill ${BRANCH_PATTERN}: the type that fits (${BRANCH_TYPES.join(', ')}), then a short slug naming the change -->`);
    }
    const skeleton = buildSkeleton(phaseFile, result.target, extraFields);

    const lines = [
      `Pending: the ${result.target} phase of ${sessionId}.`,
      existingPayload
        ? `A payload from an earlier run is at ${payloadPath}: fix it in place (Read, then Edit) instead of starting over.`
        : `Write the payload to ${payloadPath} in one Write call.`,
      'Transcribe what was agreed in this conversation into the skeleton below: replace every <!-- gps:fill … --> marker, '
        + 'keep the headings and their order, and leave out Token Usage (the script fills it).',
    ];
    if (result.target === 'plan') {
      lines.push('Repeat the ticket block once per approved ticket, renaming 01-<slug> (NN-<slug>, lowercase a-z 0-9 with -, _ or . between). '
        + 'Its **Model:** line takes one value, or delete the line for inherit.');
    }
    lines.push(`Then run write-apply.js.`, '', '````markdown', skeleton.trimEnd(), '````');

    return {
      text: lines.join('\n'),
      data: {
        sessionId, sessionDir, ...result, payloadPath, existingPayload, fields,
        sections: expectedHeadings(phaseFile),
        ...(fields.includes('Branch') && { branchPattern: BRANCH_PATTERN }),
        ...(result.target === 'plan' && { ticketSeparator: '--- ticket: NN-<slug> ---' }),
        skeleton,
      },
    };
  },
});
