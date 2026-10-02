#!/usr/bin/env node

/**
 * check-skill-size.js [--max <lines>]
 *
 * CI check: fails (exit 1) when any SKILL.md under skills/ has more than
 * --max lines (default 200), listing each offender. Exit 2 on bad arguments.
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const DEFAULT_MAX = 200;

function findSkillFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findSkillFiles(full);
    return entry.name === 'SKILL.md' ? [full] : [];
  });
}

const lineCount = (file) => fs.readFileSync(file, 'utf-8').replace(/\n$/, '').split('\n').length;

function check(max = DEFAULT_MAX) {
  return findSkillFiles(SKILLS_DIR).map((file) => ({
    file: path.relative(path.join(__dirname, '..'), file).split(path.sep).join('/'),
    lines: lineCount(file),
    max,
  }));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let max = DEFAULT_MAX;
  if (args.length > 0) {
    if (args[0] !== '--max' || !/^\d+$/.test(args[1] || '') || args.length > 2) {
      console.error('❌ Usage: check-skill-size.js [--max <lines>]');
      process.exit(2);
    }
    max = Number(args[1]);
  }
  const results = check(max);
  if (results.length === 0) {
    console.error('❌ No SKILL.md found under skills/.');
    process.exit(1);
  }
  const over = results.filter((r) => r.lines > r.max);
  for (const r of results) console.log(`${r.lines > r.max ? '❌' : '✅'} ${r.file}: ${r.lines} lines (max ${r.max})`);
  process.exit(over.length > 0 ? 1 : 0);
}

module.exports = { DEFAULT_MAX, check };
