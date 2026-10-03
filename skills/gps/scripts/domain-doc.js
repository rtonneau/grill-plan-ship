#!/usr/bin/env node

/**
 * domain-doc.js where [--json]
 * domain-doc.js glossary [--json]
 * domain-doc.js adr <slug> --title <title> [--json]
 *
 * The built-in grill's project docs. A project that already keeps domain
 * docs the mattpocock-skills way keeps them there: a root GLOSSARY.md (or
 * CONTEXT.md, its name before the skills renamed it, when it reads like a
 * glossary), a root GLOSSARY-MAP.md / CONTEXT-MAP.md for several contexts,
 * and ADRs in docs/adr/. Otherwise gps keeps its own in .work/ next to the
 * sessions: .work/GLOSSARY.md and .work/adr/.
 *
 * - where: read-only; prints where the glossary and the ADRs live (or that
 *   there are none yet), for the grill to read first.
 * - glossary: prints the glossary to add the resolved term to (Claude then
 *   edits it). Creates .work/GLOSSARY.md from its template only when the
 *   project has no glossary at all; with a glossary map it creates nothing
 *   and points at the map. Warns when .work/GLOSSARY.md duplicates the
 *   project's own glossary.
 * - adr: creates the next numbered ADR, NNNN-<slug>.md, in docs/adr/ when
 *   it exists, else in .work/adr/, and prints its path. Refuses a slug that
 *   already has an ADR (edit that one instead): an ADR is never overwritten.
 *
 * None of this is session state: no session is needed, and none is changed.
 *
 * The glossary and ADR formats are adapted from the domain-modeling skill
 * of mattpocock-skills: https://github.com/mattpocock/skills.git
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { GpsError, UsageError, isSlug, localDate } = require('./lib/guard');
const { readCurrentPointer, sessionsDirOf } = require('./lib/session-store');

const ADR_RE = /^(\d{4})-(.+)\.md$/;
const WORK_GLOSSARY = path.join('.work', 'GLOSSARY.md');
const WORK_ADR_DIR = path.join('.work', 'adr');
const PROJECT_ADR_DIR = path.join('docs', 'adr');
// Root glossaries, newest name first. CONTEXT.md is a common name for other
// things too, so it only counts when it reads like a glossary.
const ROOT_GLOSSARIES = ['GLOSSARY.md', 'CONTEXT.md'];
const ROOT_MAPS = ['GLOSSARY-MAP.md', 'CONTEXT-MAP.md'];
const GLOSSARY_LIKE_RE = /^## Language\b|^_Avoid_:/m;

const exists = (projectRoot, rel) => fs.existsSync(path.join(projectRoot, rel));
const isDir = (projectRoot, rel) => {
  try {
    return fs.statSync(path.join(projectRoot, rel)).isDirectory();
  } catch (_err) {
    return false;
  }
};
const adrFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => f.match(ADR_RE)).filter(Boolean) : []);

// Where the project's domain docs live: { map, glossary, workGlossary, adrDir },
// each a project-relative path or null. `glossary` is the project's own root
// glossary; `workGlossary` is gps's .work/GLOSSARY.md when it exists.
function locate(projectRoot) {
  const map = ROOT_MAPS.find((f) => exists(projectRoot, f)) || null;
  const glossary = ROOT_GLOSSARIES.find((f) => exists(projectRoot, f)
    && (f === 'GLOSSARY.md' || GLOSSARY_LIKE_RE.test(fs.readFileSync(path.join(projectRoot, f), 'utf-8')))) || null;
  const workGlossary = exists(projectRoot, WORK_GLOSSARY) ? WORK_GLOSSARY : null;
  const adrDir = isDir(projectRoot, PROJECT_ADR_DIR) ? PROJECT_ADR_DIR : WORK_ADR_DIR;
  return { map, glossary, workGlossary, adrDir };
}

function warnDuplicates(projectRoot, docs, warn) {
  const own = docs.map || docs.glossary;
  if (own && docs.workGlossary) {
    warn(`${docs.workGlossary} duplicates the project's ${own}: move its terms into ${own}, then delete it.`);
  }
  if (docs.adrDir === PROJECT_ADR_DIR && adrFiles(path.join(projectRoot, WORK_ADR_DIR)).length > 0) {
    warn(`${WORK_ADR_DIR} duplicates the project's ${PROJECT_ADR_DIR}: move its ADRs into ${PROJECT_ADR_DIR} (renumbered), then delete it.`);
  }
}

function where(projectRoot, warn) {
  const docs = locate(projectRoot);
  warnDuplicates(projectRoot, docs, warn);
  const lines = [];
  if (docs.map) lines.push(`Glossary map: ${docs.map} (several contexts: read it, then the glossary of each context the work touches)`);
  else if (docs.glossary) lines.push(`Glossary: ${docs.glossary}`);
  else if (docs.workGlossary) lines.push(`Glossary: ${docs.workGlossary}`);
  else lines.push(`Glossary: none yet (domain-doc.js glossary creates ${WORK_GLOSSARY} for the first resolved term)`);
  const adrs = adrFiles(path.join(projectRoot, docs.adrDir));
  lines.push(adrs.length > 0
    ? `ADRs: ${docs.adrDir}/ (${adrs.length})`
    : `ADRs: none yet (domain-doc.js adr creates the first in ${docs.adrDir}/)`);
  lines.push('Next: read what exists before asking anything, then run the grill.');
  return { text: lines.join('\n'), data: { ...docs, adrCount: adrs.length } };
}

function glossary(projectRoot, warn) {
  const docs = locate(projectRoot);
  warnDuplicates(projectRoot, docs, warn);
  if (docs.map) {
    return {
      text: [
        `Glossary map: ${docs.map}`,
        `Next: find the context the term belongs to in ${docs.map}, and add it under "## Language" in that context's glossary (Edit).`,
      ].join('\n'),
      data: { ...docs, path: docs.map, created: false },
    };
  }
  const rel = docs.glossary || WORK_GLOSSARY;
  const glossaryPath = path.join(projectRoot, rel);
  const created = !fs.existsSync(glossaryPath);
  if (created) {
    fs.mkdirSync(path.dirname(glossaryPath), { recursive: true });
    fs.writeFileSync(glossaryPath, renderTemplate(loadTemplate('glossary.md'), { 'project-name': path.basename(projectRoot) }));
  }
  return {
    text: [
      created ? `✅ Glossary created: ${glossaryPath}` : `Glossary: ${glossaryPath}${docs.glossary ? ' (the project\'s own)' : ''}`,
      created
        ? 'Next: replace its gps:fill marker, then add the resolved term under "## Language" (Edit), following the rules in its comment.'
        : 'Next: add or update the resolved term under "## Language" (Edit), following the format already in the file.',
    ].join('\n'),
    data: { ...docs, path: glossaryPath, created },
  };
}

function adr(projectRoot, slug, title, warn) {
  const docs = locate(projectRoot);
  warnDuplicates(projectRoot, docs, warn);
  const adrDir = path.join(projectRoot, docs.adrDir);
  const existing = adrFiles(adrDir);
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
  usage: 'domain-doc.js where | domain-doc.js glossary | domain-doc.js adr <slug> --title <title> [--json]',
  positionals: { min: 1, max: 2 },
  options: { title: 'string' },
  run({ positionals: [kind, slug], options, projectRoot, warn }) {
    if (kind === 'where' || kind === 'glossary') {
      if (slug !== undefined || options.title !== null) throw new UsageError(`${kind} takes no other arguments.`);
      return kind === 'where' ? where(projectRoot, warn) : glossary(projectRoot, warn);
    }
    if (kind === 'adr') {
      if (!isSlug(slug)) throw new UsageError(`adr needs a slug (lowercase a-z 0-9 . _ -), got: ${slug === undefined ? 'nothing' : slug}`);
      if (!options.title || !options.title.trim()) throw new UsageError('adr needs --title <title>.');
      return adr(projectRoot, slug, options.title.trim(), warn);
    }
    throw new UsageError(`Unknown kind: ${kind} (use where, glossary or adr).`);
  },
});
