// skills/gps/scripts/lib/status.js
//
// /gps status: every session, every scouted idea not started yet, and for
// the current session its phase, tickets, recent commits and saved handoff
// (with drift against live state). buildStatusReport gathers the data;
// renderStatus turns it into the text relayed to the user. Read-only.

const fs = require('fs');
const path = require('path');
const {
  listSessionDirs, readConfigOrNull, resolveCurrentPointer, pointerError,
} = require('./session-store');
const { computeSessionState } = require('./phase');
const { readRecentCommits } = require('./git');
const { SEEDS_FILENAME, STRENGTHS, peekSeeds } = require('./seeds-store');
const { computeIdleness, STALE_DAYS } = require('./staleness');
const { readHandoff } = require('./handoff');
const { mdCell } = require('./guard');

// Phase is computed from the session's files; status / phases_completed
// fields in older configs are ignored.
function summarizeSession(sessionsDir, sessionId) {
  const config = readConfigOrNull(sessionsDir, sessionId);
  const { phase } = computeSessionState(path.join(sessionsDir, sessionId), config);
  return {
    sessionId,
    featureName: config ? config.feature_name : null,
    createdAt: config ? config.created_at : null,
    finishedAt: config ? config.finished_at || null : null,
    phase,
    currentPhase: config && config.current_phase ? config.current_phase : null,
    phaseDrift: config && config.current_phase && config.current_phase !== phase
      ? { recorded: config.current_phase, derived: phase }
      : null,
    branch: config && config.git ? config.git.branch || null : null,
    prUrl: config && config.git ? config.git.pr_url || null : null,
    issueUrl: config && config.issue ? config.issue.url || null : null,
    configReadable: Boolean(config),
    ...computeIdleness(sessionsDir, sessionId, config),
  };
}

// Scouted ideas not yet turned into sessions, strongest first; scout order
// is kept within a strength.
function listPendingIdeas(sessionsDir) {
  const { seeds, problem } = peekSeeds(sessionsDir);
  const rank = (strength) => {
    const i = STRENGTHS.indexOf(strength);
    return i === -1 ? STRENGTHS.length : i;
  };
  const ideas = Object.entries(seeds)
    .map(([slug, seed], index) => ({ slug, seed: seed || {}, index }))
    .sort((a, b) => rank(a.seed.strength) - rank(b.seed.strength) || a.index - b.index)
    .map(({ slug, seed }) => ({
      slug,
      strength: seed.strength || null,
      severity: seed.severity || null,
      problem: seed.problem || null,
      sourceReport: seed.sourceReport || null,
      sourcePath: seed.sourcePath || null,
      createdAt: seed.createdAt || null,
      startCommand: `/gps start ${slug}`,
    }));
  const ideasProblem = problem
    ? `${SEEDS_FILENAME} is unreadable (${problem}); the next /gps scout will move it aside and start fresh.`
    : null;
  return { ideas, ideasProblem };
}

function buildStatusReport(sessionsDir, projectRoot) {
  const sessions = listSessionDirs(sessionsDir).map((sessionId) => summarizeSession(sessionsDir, sessionId));
  const { ideas, ideasProblem } = listPendingIdeas(sessionsDir);

  const pointer = resolveCurrentPointer(sessionsDir);
  if (pointer.problem) {
    const { message, hint } = pointerError(sessionsDir, pointer);
    const report = { sessions, ideas, ideasProblem, current: null, currentProblem: { code: pointer.problem, message, hint } };
    if (pointer.problem === 'no-sessions' && ideas.length > 0) {
      report.suggestedNext = {
        command: ideas[0].startCommand,
        why: `No session started yet; ${ideas.length} scouted idea(s) are waiting and ${ideas[0].slug} is ranked first (${ideas[0].strength}).`,
      };
    }
    return report;
  }

  const sessionId = pointer.sessionId;
  const sessionDir = path.join(sessionsDir, sessionId);
  const config = readConfigOrNull(sessionsDir, sessionId);
  const { writeTarget, ticketQueue, phase, suggestedNext } = computeSessionState(sessionDir, config);
  const nextPending = ticketQueue.nextPending;
  const activeTicket = nextPending ? `${nextPending.num}-${nextPending.slug}` : null;

  return {
    sessions,
    ideas,
    ideasProblem,
    current: {
      sessionId,
      phase,
      suggestedNext,
      writeTarget,
      tickets: ticketQueue.tickets,
      nextPending,
      skippedTicketFiles: ticketQueue.skipped,
      gitLog: readRecentCommits(projectRoot, config ? config.created_at : null),
      handoff: readHandoff(sessionDir, { phase, activeTicket }),
    },
    suggestedNext,
  };
}


function sessionLine(s, currentId) {
  const parts = [`- ${s.sessionId === currentId ? '**' : ''}${s.featureName || s.sessionId}${s.sessionId === currentId ? '** (current)' : ''} — ${s.phase}`];
  if (s.branch) parts.push(`branch \`${s.branch}\``);
  if (s.prUrl) parts.push(`PR ${s.prUrl}`);
  if (s.issueUrl) parts.push(`issue ${s.issueUrl}`);
  if (s.staleness) parts.push(`${s.staleness}, idle ${s.idleDays} days`);
  let line = parts.join(' · ');
  if (s.phaseDrift) {
    line += `\n  ⚠️ recorded phase "${s.phaseDrift.recorded}" differs from its files ("${s.phaseDrift.derived}"); `
      + 'usually a ticket set to Done by hand, not with ticket-complete.js. The files are the truth.';
  }
  return line;
}

function ideasTable(ideas) {
  return [
    '| Idea | Badge | Problem | Start |',
    '|---|---|---|---|',
    ...ideas.map((i) => `| ${mdCell(i.slug)} | ${mdCell(i.severity ? `${i.severity} · ${i.strength}` : i.strength)} | ${mdCell(i.problem)} | \`${i.startCommand}\` |`),
  ];
}

function currentBlock(current, sessions) {
  const name = (sessions.find((s) => s.sessionId === current.sessionId) || {}).featureName || current.sessionId;
  const done = current.tickets.filter((t) => t.done).length;
  const lines = [`## Current: ${name}`, '', `- **Session:** ${current.sessionId}`, `- **Phase:** ${current.phase}`];
  if (current.tickets.length > 0) {
    const next = current.nextPending ? `; next ${current.nextPending.num} ${current.nextPending.slug}` : '';
    lines.push(`- **Tickets:** ${done}/${current.tickets.length} done${next}`);
  }
  for (const fileName of current.skippedTicketFiles) lines.push(`- ⚠️ Ignored ${fileName}: ticket files must be named NN-<slug>.md`);
  lines.push('', '**Commits since the session started:**', '');
  lines.push(...(current.gitLog.length > 0 ? current.gitLog.map((c) => `- ${c}`) : ['- none']));

  const handoff = current.handoff;
  if (handoff) {
    lines.push('', `## Handoff (saved ${handoff.meta.Saved || 'earlier'})`, '');
    if (handoff.drift) lines.push(`⚠️ Drift since the handoff: ${handoff.drift}.`, '');
    for (const [heading, body] of Object.entries(handoff.sections)) {
      if (heading.startsWith('Machine State')) continue;
      const text = (body || '').replace(/<!--\s*gps:fill[\s\S]*?-->/g, '(not filled)') || '(empty)';
      lines.push(`**${heading}:**${text.includes('\n') ? '\n' : ' '}${text}`, '');
    }
  }
  return lines;
}

function renderStatus(report) {
  const currentId = report.current ? report.current.sessionId : null;
  const lines = [];
  if (report.sessions.length > 0) {
    lines.push('## Sessions', '', ...report.sessions.map((s) => sessionLine(s, currentId)), '');
  }
  if (report.ideas.length > 0) lines.push('## Scouted ideas not started', '', ...ideasTable(report.ideas), '');
  if (report.ideasProblem) lines.push(`⚠️ ${report.ideasProblem}`, '');
  if (report.current) lines.push(...currentBlock(report.current, report.sessions), '');
  if (report.currentProblem && report.currentProblem.code !== 'no-sessions') {
    lines.push(`⚠️ ${report.currentProblem.message}`, report.currentProblem.hint, '');
  }
  if (report.sessions.some((s) => s.staleness)) {
    lines.push(`Sessions idle ${STALE_DAYS}+ days are flagged stale; /gps clean removes the ones you no longer need.`, '');
  }
  if (report.suggestedNext) lines.push(`Next: ${report.suggestedNext.command} — ${report.suggestedNext.why}`);
  return lines.join('\n').trimEnd();
}

module.exports = { buildStatusReport, renderStatus };
