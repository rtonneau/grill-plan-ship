// scripts/lib/resume.js
const fs = require('fs');
const path = require('path');
const { buildHandoffData } = require('./handoff');

function parseHandoffMarkdown(content) {
  const meta = {};
  const sections = {};
  let currentHeading = null;
  let buffer = [];

  for (const line of content.split(/\r?\n/)) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      if (currentHeading) sections[currentHeading] = buffer.join('\n').trim();
      currentHeading = headingMatch[1].trim();
      buffer = [];
      continue;
    }

    if (currentHeading) {
      buffer.push(line);
      continue;
    }

    const metaMatch = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
    if (metaMatch) meta[metaMatch[1].trim()] = metaMatch[2].trim();
  }
  if (currentHeading) sections[currentHeading] = buffer.join('\n').trim();

  return { meta, sections };
}

function describeDrift(meta, live) {
  const drifts = [];

  if (meta['Current phase'] && meta['Current phase'] !== live.currentPhase) {
    drifts.push(`handoff said current phase was "${meta['Current phase']}"; it is now "${live.currentPhase}"`);
  }

  const liveActiveTicket = live.activeTicket || 'none';
  if (meta['Active ticket'] && meta['Active ticket'] !== liveActiveTicket) {
    drifts.push(`handoff said active ticket was "${meta['Active ticket']}"; it is now "${liveActiveTicket}"`);
  }

  return drifts.length ? drifts.join('; ') : null;
}

function buildResumeReport(sessionDir, projectRoot) {
  const live = buildHandoffData(sessionDir, projectRoot);
  const handoffPath = path.join(sessionDir, 'HANDOFF.md');

  if (!fs.existsSync(handoffPath)) {
    return { handoff: null, live, drift: null };
  }

  const { meta, sections } = parseHandoffMarkdown(fs.readFileSync(handoffPath, 'utf-8'));

  return {
    handoff: { meta, sections },
    live,
    drift: describeDrift(meta, live),
  };
}

module.exports = { buildResumeReport, parseHandoffMarkdown };
