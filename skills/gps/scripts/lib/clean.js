// skills/gps/scripts/lib/clean.js
//
// /gps clean: lists sessions with their idleness and the scouted ideas not
// started yet, and deletes named ones. Only session directories and entries
// of .pending-seeds.json are removed: never .current-session, scout reports,
// git branches, pull requests or issues.

const fs = require('fs');
const path = require('path');
const { GpsError, daysSince, mdCell } = require('./guard');
const {
  SET_CURRENT, listSessionDirs, readConfigOrNull, readCurrentPointer, isSafeSessionName,
} = require('./session-store');
const { isFinished } = require('./phase');
const { computeIdleness, byIdleDaysDesc } = require('./staleness');
const { SEEDS_FILENAME, peekSeeds, removeSeeds } = require('./seeds-store');

function countImplementDirs(sessionDir) {
  try {
    return fs.readdirSync(path.join(sessionDir, '03-implement'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).length;
  } catch (_err) {
    return 0;
  }
}

// Every session, most idle first (sessions without a date last).
function listCleanable(sessionsDir, now = new Date()) {
  const current = readCurrentPointer(sessionsDir);
  return listSessionDirs(sessionsDir)
    .map((sessionId) => {
      const config = readConfigOrNull(sessionsDir, sessionId);
      return {
        sessionId,
        featureName: config ? config.feature_name || null : null,
        finished: Boolean(config) && isFinished(config),
        current: sessionId === current,
        deletable: sessionId !== current,
        ticketsStarted: countImplementDirs(path.join(sessionsDir, sessionId)),
        branch: config && config.git ? config.git.branch || null : null,
        prUrl: config && config.git ? config.git.pr_url || null : null,
        issueUrl: config && config.issue ? config.issue.url || null : null,
        ...computeIdleness(sessionsDir, sessionId, config, now),
      };
    })
    .sort(byIdleDaysDesc);
}

// Scouted ideas not started yet, oldest first. { ideas, problem }: problem is
// why .pending-seeds.json is unreadable (then ideas is empty), else null.
function listIdeas(sessionsDir, now = new Date()) {
  const { seeds, problem } = peekSeeds(sessionsDir);
  const ideas = Object.entries(seeds).map(([slug, seed]) => {
    const entry = seed || {};
    return {
      slug,
      problem: entry.problem || null,
      strength: entry.strength || null,
      sourceReport: entry.sourceReport || null,
      createdAt: entry.createdAt || null,
      idleDays: daysSince(entry.createdAt, now),
    };
  });
  ideas.sort(byIdleDaysDesc);
  return { ideas, problem };
}

// Each id names a session directory or, failing that, a scouted idea.
// Validates every id and throws on the first bad one, before anything is
// removed. Returns { sessions, ideas, warnings }: the sessions (as listed by
// listCleanable) and idea slugs to remove, plus one warning per session
// whose deletion loses something (unfinished work, a branch, PR or issue).
function planDeletion(sessionsDir, ids) {
  const listed = listCleanable(sessionsDir);
  const { seeds, problem } = peekSeeds(sessionsDir);
  const available = () => `Sessions: ${listed.map((s) => s.sessionId).join(', ') || 'none'}. Ideas: ${Object.keys(seeds).join(', ') || 'none'}.`;
  const sessions = [];
  const ideas = [];

  for (const id of new Set(ids)) {
    if (!isSafeSessionName(id)) {
      throw new GpsError(`Invalid session or idea id: ${JSON.stringify(id)}`, available());
    }
    const session = listed.find((s) => s.sessionId === id);
    if (session) {
      if (session.current) {
        throw new GpsError(`Session ${id} is the current session.`,
          `Ask the user, switch first with ${SET_CURRENT}, then clean it.`);
      }
      sessions.push(session);
    } else if (problem) {
      throw new GpsError(`${id} is not a session, and ${SEEDS_FILENAME} is unreadable (${problem}).`,
        'Run /gps scout to move the file aside and start fresh, or fix it by hand.');
    } else if (Object.prototype.hasOwnProperty.call(seeds, id)) {
      ideas.push({ slug: id, problem: (seeds[id] || {}).problem || null });
    } else {
      throw new GpsError(`${id} is neither a session nor a scouted idea.`, available());
    }
  }

  const warnings = [];
  for (const s of sessions) {
    if (!s.finished) warnings.push(`${s.sessionId} is not finished.`);
    if (s.ticketsStarted > 0) warnings.push(`${s.sessionId} has ${s.ticketsStarted} ticket(s) started.`);
    const remote = [s.branch && `branch ${s.branch}`, s.prUrl && `PR ${s.prUrl}`, s.issueUrl && `issue ${s.issueUrl}`].filter(Boolean);
    if (remote.length > 0) warnings.push(`${s.sessionId} has ${remote.join(', ')}: kept, only the local session folder goes.`);
  }
  return { sessions, ideas, warnings };
}

// Removes what planDeletion returned.
function applyDeletion(sessionsDir, plan) {
  for (const { sessionId } of plan.sessions) {
    fs.rmSync(path.join(sessionsDir, sessionId), { recursive: true, force: true });
  }
  if (plan.ideas.length > 0) removeSeeds(sessionsDir, plan.ideas.map((i) => i.slug));
}


function sessionNotes(s) {
  return [
    s.current && 'current (not deletable)',
    s.staleness,
    s.ticketsStarted > 0 && `${s.ticketsStarted} ticket(s) started`,
    s.branch && `branch ${s.branch}`,
    s.prUrl && 'PR',
    s.issueUrl && 'issue',
  ].filter(Boolean).join(', ');
}

// The list mode's text: one table per non-empty list.
function renderList(sessions, ideas, ideasProblem) {
  const lines = [];
  if (sessions.length > 0) {
    lines.push('## Sessions (most idle first)', '', '| Session | Feature | State | Idle days | Notes |', '|---|---|---|---|---|');
    for (const s of sessions) {
      lines.push(`| ${mdCell(s.sessionId)} | ${mdCell(s.featureName)} | ${s.finished ? 'finished' : 'unfinished'} | ${mdCell(s.idleDays)} | ${mdCell(sessionNotes(s))} |`);
    }
    lines.push('');
  }
  if (ideas.length > 0) {
    lines.push('## Scouted ideas not started (oldest first)', '', '| Idea | Strength | Idle days | Problem |', '|---|---|---|---|');
    for (const i of ideas) lines.push(`| ${mdCell(i.slug)} | ${mdCell(i.strength)} | ${mdCell(i.idleDays)} | ${mdCell(i.problem)} |`);
    lines.push('');
  }
  if (ideasProblem) lines.push(`⚠️ The ideas file is unreadable (${ideasProblem}): ideas can't be dropped until /gps scout moves it aside.`, '');
  lines.push('Next: pick the ids to remove; clean.js --dry-run <id>... shows exactly what would go.');
  return lines.join('\n');
}

// The --dry-run text: exactly what --delete would remove.
function renderPlan(plan) {
  const lines = ['Would delete (cannot be undone):', ''];
  for (const s of plan.sessions) {
    lines.push(`- session ${s.sessionId} (${s.featureName || 'no name'}): ${s.finished ? 'finished' : 'unfinished'}, idle ${s.idleDays === null ? '?' : s.idleDays} days`);
  }
  for (const i of plan.ideas) lines.push(`- idea ${i.slug}: ${i.problem || 'no problem recorded'}`);
  if (plan.warnings.length > 0) lines.push('', ...plan.warnings.map((w) => `⚠️ ${w}`));
  lines.push('', 'Never touched: .current-session, scout reports, git branches, pull requests, issues.');
  return lines.join('\n');
}

module.exports = { listCleanable, listIdeas, planDeletion, applyDeletion, renderList, renderPlan };
