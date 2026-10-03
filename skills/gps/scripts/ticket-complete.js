#!/usr/bin/env node

/**
 * ticket-complete.js <number> --message <text> --file <path>... [--json]
 * ticket-complete.js <number> --commit <sha> [--json]
 *
 * /gps ship: closes a ticket whose Verification Step passed. Refuses while
 * the commit log's narrative sections (Local Test Result, Review Notes,
 * Blockers / Challenges) still have gps:fill markers. Then:
 *   1. commits exactly the given files with the given message (nothing
 *      else that is staged goes in), or records an existing --commit;
 *   2. sets the log's Status to "✅ Done" and fills Commits, Time Spent
 *      (since ticket-start.js);
 *   3. records a `ticket_done` event in the session history;
 *   4. commits .work/ (the completed log and history) as its own
 *      `chore(gps)` commit, since the log names the ticket's commit; a
 *      failed record commit only warns.
 * A failed commit (e.g. a pre-commit hook) changes nothing: the ticket stays
 * In Progress. A ticket already completed is reported and left alone.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { resolveSession } = require('./lib/session-store');
const { findTicketsByNumber } = require('./lib/ticket-lookup');
const { listTickets } = require('./lib/ticket-queue');
const { unfilledSections, completeLog } = require('./lib/commit-log');
const { commitFiles, describeCommit, commitWorkDir, describeWorkCommit } = require('./lib/git');
const { getHistory, hasEvent, recordEvent, sessionPath } = require('./lib/history');
const { GpsError, UsageError } = require('./lib/guard');

const OFF_LIMITS = ['.work/', '.scratch/'];

// Project-relative, forward-slash paths; refuses paths outside the project
// or inside gps's own directories (session state and scratch output are
// never part of a ticket's commit).
function normalizeFiles(projectRoot, files) {
  return files.map((file) => {
    const rel = path.relative(projectRoot, path.resolve(projectRoot, file)).split(path.sep).join('/');
    if (!rel || rel.startsWith('../') || path.isAbsolute(rel)) throw new UsageError(`--file ${file} is outside the project.`);
    if (OFF_LIMITS.some((dir) => rel.startsWith(dir))) {
      throw new UsageError(`--file ${file} is inside ${OFF_LIMITS.join(' or ')}, which never belongs in a ticket's commit.`);
    }
    return rel;
  });
}

main({
  usage: 'ticket-complete.js <number> (--message <text> --file <path>... | --commit <sha>) [--json]',
  positionals: { min: 1, max: 1 },
  options: { message: 'string', file: 'list', commit: 'string' },
  run({ positionals: [arg], options, projectRoot, warn }) {
    if (!/^\d+$/.test(arg)) throw new UsageError(`Invalid ticket number: ${arg}`);
    if (options.commit && (options.message || options.file.length > 0)) {
      throw new UsageError('--commit records an existing commit: leave out --message and --file.');
    }
    if (!options.commit && (!options.message || options.file.length === 0)) {
      throw new UsageError('Give --message and at least one --file (every file this ticket changed), or --commit <sha>.');
    }
    const files = options.commit ? [] : normalizeFiles(projectRoot, options.file);

    const { sessionDir, configPath, config } = resolveSession(projectRoot);
    const keyOf = (t) => `${t.num}-${t.slug}`;
    const completed = (t) => t.done && hasEvent(config, 'ticket_done', { ticket: keyOf(t) });
    const candidates = findTicketsByNumber(sessionDir, Number(arg));
    const ticket = candidates.find((t) => !completed(t));
    if (!ticket) {
      const t = candidates[0];
      return {
        text: `✅ Ticket ${t.num} (${t.slug}) is already Done; nothing was changed.`,
        data: { ticket: keyOf(t), alreadyDone: true },
      };
    }

    const key = keyOf(ticket);
    if (!fs.existsSync(ticket.commitLogPath)) {
      throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) was never started.`, `Run ticket-start.js ${Number(ticket.num)} first.`);
    }
    const log = fs.readFileSync(ticket.commitLogPath, 'utf-8');
    const missing = unfilledSections(log);
    if (missing.length > 0) {
      throw new GpsError(`Fill these sections of ${ticket.commitLogPath} first: ${missing.join(', ')}. Nothing was committed.`,
        'Replace each <!-- gps:fill … --> marker, then run ticket-complete.js again.');
    }

    let sha = options.commit;
    let committedFiles = [];
    if (sha) {
      const described = describeCommit(projectRoot, sha);
      if (!described) throw new GpsError(`Commit ${sha} not found.`, 'Pass a commit that exists in this repository.');
      sha = described.split(' ')[0];
    } else {
      const commit = commitFiles(projectRoot, files, options.message);
      if (!commit.ok) {
        throw new GpsError(`Commit failed (${commit.reason}); the ticket stays In Progress.`,
          `Fix the cause and run ticket-complete.js again, or commit by hand and pass --commit <sha>: ${commit.commands.join(' && ')}`);
      }
      sha = commit.sha;
      committedFiles = commit.files;
    }

    const finishedAt = new Date().toISOString();
    const started = getHistory(config).find((e) => e.event === 'ticket_started' && e.detail && e.detail.ticket === key);
    fs.writeFileSync(ticket.commitLogPath, completeLog(log, {
      commits: [describeCommit(projectRoot, sha) || sha],
      startedAt: started ? started.at : null,
      finishedAt,
    }));
    recordEvent(configPath, config, sessionDir, {
      event: 'ticket_done',
      files: [sessionPath(sessionDir, ticket.commitLogPath)],
      detail: { ticket: key, commit: sha },
      at: finishedAt,
    });

    const record = commitWorkDir(projectRoot, `chore(gps): ticket ${key} done`);
    const recorded = describeWorkCommit(record);
    if (recorded.warning) warn(recorded.warning);

    const next = listTickets(sessionDir).nextPending;
    const what = committedFiles.length > 0 ? `committed ${sha} (${committedFiles.length} file(s))` : `recorded commit ${sha}`;
    return {
      text: `✅ Ticket ${ticket.num} (${ticket.slug}) done: ${what}.\n`
        + (recorded.line ? `${recorded.line}\n` : '')
        + `Next: ${next ? `ticket ${next.num} (${next.slug})` : 'every ticket is done: /gps finish'}`,
      data: { ticket: key, commit: sha, files: committedFiles, record, nextPending: next ? keyOf(next) : null },
    };
  },
});
