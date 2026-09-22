// scripts/lib/token-usage.js
//
// Records which phase(s) of a session touched which Claude Code session
// ID(s), then computes real token usage for a phase by summing the
// `usage` objects logged in Claude Code's own transcript JSONL files.
//
// This reads an undocumented Claude Code internal (transcript file
// location/format), so every failure mode here must degrade to
// `{ available: false }` rather than throw — a missing/garbled transcript
// must never block a /gps write or /gps ship run.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Claude Code names a project's transcript folder by replacing every
// non-alphanumeric character of the cwd with "-" (e.g. "C:\a.b\é c" ->
// "C--a-b--c"), as observed in ~/.claude/projects.
function mangleCwd(cwd) {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

// The main transcript plus any sub-agent transcripts, which Claude Code
// writes to <transcriptsDir>/<sessionId>/subagents/*.jsonl.
function transcriptFiles(transcriptsDir, sessionId) {
  const files = [path.join(transcriptsDir, `${sessionId}.jsonl`)];
  const subagentsDir = path.join(transcriptsDir, sessionId, 'subagents');
  if (fs.existsSync(subagentsDir)) {
    for (const name of fs.readdirSync(subagentsDir).sort()) {
      if (name.endsWith('.jsonl')) files.push(path.join(subagentsDir, name));
    }
  }
  return files.filter((file) => fs.existsSync(file));
}

function defaultTranscriptsDir(cwd = process.cwd()) {
  return path.join(os.homedir(), '.claude', 'projects', mangleCwd(cwd));
}

function touchPhase(config, phaseKey) {
  if (!config.usage) config.usage = {};
  if (!config.usage[phaseKey]) {
    config.usage[phaseKey] = { startedAt: new Date().toISOString(), sessionIds: [] };
  }

  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  if (sessionId && !config.usage[phaseKey].sessionIds.includes(sessionId)) {
    config.usage[phaseKey].sessionIds.push(sessionId);
  }
}

const UNAVAILABLE = { available: false };

function computeUsage(config, phaseKey, transcriptsDir = defaultTranscriptsDir()) {
  try {
    const phase = config.usage && config.usage[phaseKey];
    if (!phase || !phase.sessionIds || phase.sessionIds.length === 0) return UNAVAILABLE;

    // One API response can be logged as several transcript lines that all
    // repeat the same message.id and usage; count each message once (the
    // last line seen wins). Lines without an id are counted individually.
    const usageByMessage = new Map();
    let anonymous = 0;

    for (const sessionId of phase.sessionIds) {
      for (const transcriptPath of transcriptFiles(transcriptsDir, sessionId)) {
        const lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;

          let entry;
          try {
            entry = JSON.parse(line);
          } catch (_err) {
            continue;
          }

          if (entry.type !== 'assistant') continue;
          if (!entry.timestamp || entry.timestamp < phase.startedAt) continue;

          const usage = entry.message && entry.message.usage;
          if (!usage) continue;

          const key = entry.message.id || `anonymous-${anonymous++}`;
          usageByMessage.set(key, usage);
        }
      }
    }

    if (usageByMessage.size === 0) return UNAVAILABLE;

    const totals = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
    for (const usage of usageByMessage.values()) {
      totals.input += usage.input_tokens || 0;
      totals.output += usage.output_tokens || 0;
      totals.cacheRead += usage.cache_read_input_tokens || 0;
      totals.cacheCreation += usage.cache_creation_input_tokens || 0;
    }

    const total = totals.input + totals.output + totals.cacheRead + totals.cacheCreation;
    return { available: true, ...totals, total };
  } catch (_err) {
    return UNAVAILABLE;
  }
}

module.exports = { mangleCwd, defaultTranscriptsDir, touchPhase, computeUsage };
