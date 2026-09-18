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

function mangleCwd(cwd) {
  return cwd.replace(/[:\\/]/g, '-');
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

    const totals = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
    let matchedAny = false;

    for (const sessionId of phase.sessionIds) {
      const transcriptPath = path.join(transcriptsDir, `${sessionId}.jsonl`);
      if (!fs.existsSync(transcriptPath)) continue;

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

        totals.input += usage.input_tokens || 0;
        totals.output += usage.output_tokens || 0;
        totals.cacheRead += usage.cache_read_input_tokens || 0;
        totals.cacheCreation += usage.cache_creation_input_tokens || 0;
        matchedAny = true;
      }
    }

    if (!matchedAny) return UNAVAILABLE;

    const total = totals.input + totals.output + totals.cacheRead + totals.cacheCreation;
    return { available: true, ...totals, total };
  } catch (_err) {
    return UNAVAILABLE;
  }
}

module.exports = { mangleCwd, defaultTranscriptsDir, touchPhase, computeUsage };
