// skills/gps/scripts/lib/semver.js
//
// Plain X.Y.Z versions: parsing, comparison, bumps (with the 0.x rule), and
// the minimum bump implied by conventional-commit messages.

const LEVELS = ['patch', 'minor', 'major'];

function parseVersion(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(s).trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function formatVersion(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function compareVersions(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return 0;
}

function levelRank(level) {
  return LEVELS.indexOf(level);
}

// 0.x rule: a major bump on 0.y.z gives 0.(y+1).0.
function bumpVersion(v, level) {
  if (level === 'major') {
    return v.major === 0
      ? { major: 0, minor: v.minor + 1, patch: 0 }
      : { major: v.major + 1, minor: 0, patch: 0 };
  }
  if (level === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0 };
  return { major: v.major, minor: v.minor, patch: v.patch + 1 };
}

// The level of the step from `from` to a greater `to`: the highest component
// that changed (so 0.4.2 → 0.5.0 is minor, whatever the 0.x rule).
function levelBetween(from, to) {
  if (to.major !== from.major) return 'major';
  if (to.minor !== from.minor) return 'minor';
  return 'patch';
}

function maxLevel(levels) {
  let best = null;
  for (const level of levels) {
    if (best === null || levelRank(level) > levelRank(best)) best = level;
  }
  return best;
}

const TYPE_LINE = /^(\w+)(\([^)]*\))?(!)?:\s/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;

// Minimum bump implied by full commit messages; `patch` for an empty list.
function bumpFloor(messages) {
  let level = 'patch';
  for (const message of messages) {
    const m = TYPE_LINE.exec(message.split('\n')[0]);
    if ((m && m[3]) || BREAKING_FOOTER.test(message)) return 'major';
    if (m && m[1] === 'feat') level = 'minor';
  }
  return level;
}

module.exports = {
  LEVELS, parseVersion, formatVersion, compareVersions, bumpVersion, maxLevel, levelRank, bumpFloor, levelBetween,
};
