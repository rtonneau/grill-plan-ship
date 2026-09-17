// scripts/lib/ticket-queue.js
const fs = require('fs');
const path = require('path');

const STATUS_DONE_RE = /^\*\*Status:\*\*\s*✅\s*Done\s*$/m;

function parseTicketFilename(fileName) {
  const match = fileName.match(/^(\d+)-(.+)\.md$/);
  if (!match) return null;
  return { num: match[1], slug: match[2] };
}

function isTicketDone(commitLogPath) {
  if (!fs.existsSync(commitLogPath)) return false;
  return STATUS_DONE_RE.test(fs.readFileSync(commitLogPath, 'utf-8'));
}

function listTickets(sessionDir) {
  const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
  if (!fs.existsSync(ticketsDir)) {
    return { tickets: [], nextPending: null };
  }

  const tickets = fs.readdirSync(ticketsDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((fileName) => {
      const parsed = parseTicketFilename(fileName);
      if (!parsed) return null;
      const { num, slug } = parsed;
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
    })
    .filter(Boolean);

  const nextPending = tickets.find((t) => !t.done) || null;

  return { tickets, nextPending };
}

module.exports = { parseTicketFilename, isTicketDone, listTickets };
