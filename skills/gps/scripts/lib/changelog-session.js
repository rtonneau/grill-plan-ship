// skills/gps/scripts/lib/changelog-session.js
//
// What changelog-prepare.js and changelog-apply.js share: the check that a
// session can still get its CHANGELOG entry, and the commits that entry is
// about (and so the bump floor).

const { GpsError } = require('./guard');
const { isFinished } = require('./phase');
const { resolveWriteTarget } = require('./write-target');
const { commitMessages } = require('./git');
const { bumpFloor } = require('./semver');

// Commits gps itself makes carry no user-facing change.
const OWN_COMMIT_RE = /^(chore\(gps\)|docs\(changelog\)):/;

// Refuses, changing nothing, on a finished session or an unwritten phase
// (same wording as finish.js).
function checkChangelogable(sessionId, sessionDir, config) {
  if (isFinished(config)) {
    throw new GpsError(`Session ${sessionId} is already finished; nothing was changed.`,
      'Run /gps status to pick another session, or /gps start <feature-name>.');
  }
  const { target } = resolveWriteTarget(sessionDir);
  if (target === 'grill') {
    throw new GpsError('The grill phase is not written yet; nothing was changed.', 'Run /gps write first.');
  }
  if (target === 'plan') {
    throw new GpsError('The plan and tickets are not written yet; nothing was changed.', 'Run /gps write, then /gps ship.');
  }
}

// The session's commits (full messages, newest first) without gps's own, and
// the bump floor they imply.
function sessionCommits(projectRoot, config) {
  const range = config.git
    ? { base: config.git.base_branch, branch: config.git.branch }
    : { since: new Date(config.created_at).getTime() / 1000 };
  const messages = commitMessages(projectRoot, range).filter((m) => !OWN_COMMIT_RE.test(m.split('\n')[0]));
  return { messages, subjects: messages.map((m) => m.split('\n')[0]), floor: bumpFloor(messages) };
}

module.exports = { checkChangelogable, sessionCommits };
