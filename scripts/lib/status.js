// scripts/lib/status.js
const fs = require('fs');
const path = require('path');
const { listSessionDirs, resolveCurrentPointer, pointerError } = require('./session-store');
const { computeSessionState } = require('./phase');
const { readRecentCommits } = require('./git');
const { SEEDS_FILENAME, peekSeeds } = require('./seeds-store');

const STRENGTH_ORDER = ['Strong', 'Worth exploring', 'Speculative'];

function readConfig(sessionsDir, sessionId) {
  const configPath = path.join(sessionsDir, sessionId, '.session-config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (_err) {
    return null;
  }
}

// Phase is computed from the session's files; status / phases_completed
// fields in older configs are ignored.
function summarizeSession(sessionsDir, sessionId) {
  const config = readConfig(sessionsDir, sessionId);
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
  };
}

// Scouted ideas not yet turned into sessions (/gps start removes a seed),
// strongest first; scout order is kept within a strength.
function listPendingIdeas(sessionsDir) {
  const { seeds, problem } = peekSeeds(sessionsDir);
  const rank = (strength) => {
    const i = STRENGTH_ORDER.indexOf(strength);
    return i === -1 ? STRENGTH_ORDER.length : i;
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
  const sessionIds = listSessionDirs(sessionsDir);
  const sessions = sessionIds.map((sessionId) => summarizeSession(sessionsDir, sessionId));
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
  const currentSessionId = pointer.sessionId;

  const sessionDir = path.join(sessionsDir, currentSessionId);
  const config = readConfig(sessionsDir, currentSessionId);
  const { writeTarget, ticketQueue, phase, suggestedNext } = computeSessionState(sessionDir, config);
  const gitLog = readRecentCommits(projectRoot, config ? config.created_at : null);
  const hasHandoff = fs.existsSync(path.join(sessionDir, 'HANDOFF.md'));

  return {
    sessions,
    ideas,
    ideasProblem,
    current: {
      sessionId: currentSessionId,
      phase,
      suggestedNext,
      writeTarget,
      tickets: ticketQueue.tickets,
      nextPending: ticketQueue.nextPending,
      skippedTicketFiles: ticketQueue.skipped,
      gitLog,
      hasHandoff,
    },
  };
}

module.exports = { buildStatusReport };
