#!/usr/bin/env node

/**
 * domain-doc.js glossary [--json]
 * domain-doc.js adr <slug> --title <title> [--json]
 *
 * The built-in grill's project docs, kept in .work/ next to the sessions:
 *
 * - glossary: creates .work/GLOSSARY.md from its template if it is missing
 *   and prints its path. Claude then adds the resolved term with Edit.
 *   Warns when the repo also has a root GLOSSARY.md or GLOSSARY-MAP.md
 *   (another grill skill's), whose vocabulary still applies.
 * - adr: creates the next numbered ADR, .work/adr/NNNN-<slug>.md, and
 *   prints its path. Refuses a slug that already has an ADR (edit that
 *   one instead): an ADR is never overwritten.
 *
 * Neither is session state: no session is needed, and none is changed.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { GpsError, UsageError, isSlug, localDate } = require('./lib/guard');
const { readCurrentPointer, sessionsDirOf } = require('./lib/session-store');

const ADR_RE = /^(\d{4})-(.+)\.md$/;

function glossary(projectRoot, warn) {
  const glossaryPath = path.join(projectRoot, '.work', 'GLOSSARY.md');
  const created = !fs.existsSync(glossaryPath);
  if (created) {
    fs.mkdirSync(path.dirname(glossaryPath), { recursive: true });
    fs.writeFileSync(glossaryPath, renderTemplate(loadTemplate('glossary.md'), { 'project-name': path.basename(projectRoot) }));
  }
  const rootDocs = ['GLOSSARY.md', 'GLOSSARY-MAP.md'].filter((f) => fs.existsSync(path.join(projectRoot, f)));
  for (const file of rootDocs) warn(`The repo also has ${file} at its root: read it, and keep both glossaries consistent.`);
  return {
    text: [
      created ? `✅ Glossary created: ${glossaryPath}` : `Glossary: ${glossaryPath}`,
      created
        ? 'Next: replace its gps:fill marker, then add the resolved term under "## Language" (Edit), following the rules in its comment.'
        : 'Next: add or update the resolved term under "## Language" (Edit), following the rules in its comment.',
    ].join('\n'),
    data: { path: glossaryPath, created, rootDocs },
  };
}

function adr(projectRoot, slug, title) {
  const adrDir = path.join(projectRoot, '.work', 'adr');
  const existing = fs.existsSync(adrDir) ? fs.readdirSync(adrDir).map((f) => f.match(ADR_RE)).filter(Boolean) : [];
  const same = existing.find((m) => m[2] === slug);
  if (same) {
    throw new GpsError(`ADR ${same[1]} already records "${slug}": ${path.join(adrDir, same[0])}`,
      'Edit that ADR, or pick another slug for a different decision.');
  }
  const number = String(existing.reduce((max, m) => Math.max(max, Number(m[1])), 0) + 1).padStart(4, '0');
  const adrPath = path.join(adrDir, `${number}-${slug}.md`);
  const sessionId = readCurrentPointer(sessionsDirOf(projectRoot)) || null;
  fs.mkdirSync(adrDir, { recursive: true });
  fs.writeFileSync(adrPath, renderTemplate(loadTemplate('adr.md'), {
    title, number, date: localDate(), origin: sessionId ? `session ${sessionId}` : 'no gps session',
  }));
  return {
    text: [`✅ ADR ${number} created: ${adrPath}`, 'Next: replace its gps:fill marker (Edit): the context, the decision and why, in 1–3 sentences.'].join('\n'),
    data: { path: adrPath, number, slug },
  };
}

main({
  usage: 'domain-doc.js glossary | domain-doc.js adr <slug> --title <title> [--json]',
  positionals: { min: 1, max: 2 },
  options: { title: 'string' },
  run({ positionals: [kind, slug], options, projectRoot, warn }) {
    if (kind === 'glossary') {
      if (slug !== undefined || options.title !== null) throw new UsageError('glossary takes no other arguments.');
      return glossary(projectRoot, warn);
    }
    if (kind === 'adr') {
      if (!isSlug(slug)) throw new UsageError(`adr needs a slug (lowercase a-z 0-9 . _ -), got: ${slug === undefined ? 'nothing' : slug}`);
      if (!options.title || !options.title.trim()) throw new UsageError('adr needs --title <title>.');
      return adr(projectRoot, slug, options.title.trim());
    }
    throw new UsageError(`Unknown kind: ${kind} (use glossary or adr).`);
  },
});
