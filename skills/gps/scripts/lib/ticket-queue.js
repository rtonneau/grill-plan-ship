// skills/gps/scripts/lib/ticket-queue.js
//
// The session's tickets (02-plan/tickets/NN-<slug>.md) in execution order,
// each with its commit-log path, Done state and model hint.
const fs = require('fs');
const path = require('path');
const { isSlug } = require('./guard');
const { TICKET_MODELS, normalizeTicketModel } = require('./ticket-model');

const STATUS_DONE_RE = /^\*\*Status:\*\*\s*✅\s*Done\s*$/m;

// "NN-<slug>.md" with a valid slug -> { num, slug }; anything else
// (including the "[slug]" stubs /gps plan creates) -> null.
function parseTicketFilename(fileName) {
  const match = fileName.match(/^(\d+)-(.+)\.md$/);
  if (!match || !isSlug(match[2])) return null;
  return { num: match[1], slug: match[2] };
}

// The ticket spec's model and, when its **Model:** line holds something
// unknown, that raw value. An unreadable spec counts as "inherit": callers
// that only want the queue must not fail on it.
function readTicketSpec(ticketPath) {
  try {
    const { model, raw } = normalizeTicketModel(fs.readFileSync(ticketPath, 'utf-8'));
    return { model, modelInvalid: raw !== null && raw.toLowerCase() !== model ? raw : null };
  } catch {
    return { model: 'inherit', modelInvalid: null };
  }
}

function isTicketDone(commitLogPath) {
  if (!fs.existsSync(commitLogPath)) return false;
  return STATUS_DONE_RE.test(fs.readFileSync(commitLogPath, 'utf-8'));
}

// Lists tickets in execution order: by number, then filename (so
// duplicate numbers are all kept, in alphabetical order). Files that
// don't match NN-<slug>.md are returned in `skipped` instead.
// Each ticket is { num, slug, ticketPath, implDir, commitLogPath, done, model,
// modelInvalid }: `model` is haiku|sonnet|opus|inherit; `modelInvalid` is the
// unknown value (not null) when its **Model:** line was hand-edited to one, so
// the caller can warn. /gps write rejects such values, so only hand edits reach it.
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
      const ticketPath = path.join(ticketsDir, fileName);
      return {
        num,
        slug,
        ticketPath,
        implDir,
        commitLogPath,
        done: isTicketDone(commitLogPath),
        ...readTicketSpec(ticketPath),
      };
    });

  const nextPending = tickets.find((t) => !t.done) || null;

  return { tickets, nextPending, skipped };
}

module.exports = { TICKET_MODELS, STATUS_DONE_RE, parseTicketFilename, isTicketDone, listTickets };
