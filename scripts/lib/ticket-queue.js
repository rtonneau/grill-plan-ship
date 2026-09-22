// scripts/lib/ticket-queue.js
const fs = require('fs');
const path = require('path');
const { isSlug } = require('./guard');

const STATUS_DONE_RE = /^\*\*Status:\*\*\s*✅\s*Done\s*$/m;

// "NN-<slug>.md" with a valid slug -> { num, slug }; anything else
// (including the "[slug]" stubs /gps plan creates) -> null.
function parseTicketFilename(fileName) {
  const match = fileName.match(/^(\d+)-(.+)\.md$/);
  if (!match || !isSlug(match[2])) return null;
  return { num: match[1], slug: match[2] };
}

function isTicketDone(commitLogPath) {
  if (!fs.existsSync(commitLogPath)) return false;
  return STATUS_DONE_RE.test(fs.readFileSync(commitLogPath, 'utf-8'));
}

// Lists tickets in execution order: by number, then filename (so
// duplicate numbers are all kept, in alphabetical order). Files that
// don't match NN-<slug>.md are returned in `skipped` instead.
function listTickets(sessionDir) {
  const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
  if (!fs.existsSync(ticketsDir)) {
    return { tickets: [], nextPending: null, skipped: [] };
  }

  const skipped = [];
  const tickets = fs.readdirSync(ticketsDir)
    .filter((f) => f.endsWith('.md'))
    .map((fileName) => {
      const parsed = parseTicketFilename(fileName);
      if (!parsed) skipped.push(fileName);
      return parsed && { fileName, ...parsed };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.num) - Number(b.num) || (a.fileName < b.fileName ? -1 : 1))
    .map(({ fileName, num, slug }) => {
      const implDir = path.join(sessionDir, '03-implement', `${num}-${slug}`);
      const commitLogPath = path.join(implDir, 'commit-log.md');
      return {
        num,
        slug,
        ticketPath: path.join(ticketsDir, fileName),
        implDir,
        commitLogPath,
        done: isTicketDone(commitLogPath),
      };
    });

  const nextPending = tickets.find((t) => !t.done) || null;

  return { tickets, nextPending, skipped };
}

module.exports = { parseTicketFilename, isTicketDone, listTickets };
