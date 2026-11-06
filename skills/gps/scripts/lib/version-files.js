// skills/gps/scripts/lib/version-files.js
//
// Reads and writes the version of the project files a release bumps:
// package.json, the plugin manifests, pyproject.toml, Cargo.toml and
// CMakeLists.txt. JSON files are rewritten whole (2-space indent, trailing
// newline); text files are edited by replacing the version token only.
// Cargo.toml takes [package] or [workspace.package]; rewriteCargoPins moves the
// path-dependency pins of a workspace along with it.

const fs = require('fs');
const path = require('path');
const { GpsError, readJson, replaceFile } = require('./guard');
const { parseVersion } = require('./semver');

const KNOWN_VERSION_FILES = [
  'package.json',
  'plugin.json',
  '.codex-plugin/plugin.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'pyproject.toml',
  'Cargo.toml',
  'CMakeLists.txt',
];

const TOML_TABLES = {
  'pyproject.toml': ['project', 'tool.poetry'],
  'Cargo.toml': ['package', 'workspace.package'],
};

const isMarketplace = (file) => path.basename(file) === 'marketplace.json';
const isToml = (file) => file.endsWith('.toml');

function abs(projectRoot, file) {
  return path.join(projectRoot, ...file.split('/'));
}

// Atomic like writeJsonAtomic (temp file + rename), plus the trailing newline
// that writeJsonAtomic does not add.
function writeJsonFile(filePath, data) {
  replaceFile(filePath, JSON.stringify(data, null, 2) + '\n');
}

function jsonVersion(data, file) {
  const holder = isMarketplace(file) ? data && Array.isArray(data.plugins) && data.plugins[0] : data;
  return holder && typeof holder.version === 'string' && holder.version ? holder.version : null;
}

// Lines of a TOML file with their line endings kept, with the table each is in.
function tomlLines(text) {
  let table = null;
  return text.split(/(?<=\n)/).map((line) => {
    const header = /^\s*\[([^[\]]+)\]\s*(?:#.*)?$/.exec(line.replace(/\r?\n$/, ''));
    if (header) table = header[1].trim();
    return { line, table, isHeader: Boolean(header) };
  });
}

const TOML_VERSION_RE = /^(\s*version\s*=\s*)(["'])([^"'\r\n]*)\2/;

function findTomlVersion(lines, file) {
  const tables = TOML_TABLES[file];
  for (const entry of lines) {
    if (entry.isHeader || !tables.includes(entry.table)) continue;
    const match = TOML_VERSION_RE.exec(entry.line);
    if (match) return { entry, match };
  }
  return null;
}

// Span of "x.y.z" in the VERSION keyword of the first project( ... ) call.
function findCmakeVersion(text) {
  const start = /\bproject\s*\(/i.exec(text);
  if (!start) return null;
  const open = start.index + start[0].length;
  const close = text.indexOf(')', open);
  if (close === -1) return null;
  const m = /\bVERSION\s+(\d[\w.]*)/.exec(text.slice(open, close));
  if (!m) return null;
  const from = open + m.index + m[0].length - m[1].length;
  return { from, to: from + m[1].length, version: m[1] };
}

function textVersion(text, file) {
  if (isToml(file)) {
    const found = findTomlVersion(tomlLines(text), file);
    return found ? found.match[3] || null : null;
  }
  const found = findCmakeVersion(text);
  return found ? found.version : null;
}

function readVersion(projectRoot, file) {
  const filePath = abs(projectRoot, file);
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf-8');
  if (file.endsWith('.json')) {
    try {
      return jsonVersion(JSON.parse(text), file);
    } catch (_err) {
      return null;
    }
  }
  return textVersion(text, file);
}

function readVersions(projectRoot, files) {
  return files.map((file) => ({ file, version: readVersion(projectRoot, file) }));
}

// The known files that exist and hold a readable version.
function detectVersionFiles(projectRoot) {
  return KNOWN_VERSION_FILES.filter((file) => readVersion(projectRoot, file) !== null);
}

// Throws GpsError when the file has no version field to update; never a silent no-op.
function writeVersion(projectRoot, file, version) {
  if (!parseVersion(version)) throw new GpsError(`Not a valid version: ${version}`, 'Use X.Y.Z.');
  const filePath = abs(projectRoot, file);
  const noVersion = () => new GpsError(
    `No version field found in ${file}.`,
    'Add one, or remove the file from release.versionFiles in .work/gps-config.json.'
  );

  if (file.endsWith('.json')) {
    const data = readJson(filePath, file);
    if (jsonVersion(data, file) === null) throw noVersion();
    if (isMarketplace(file)) {
      for (const plugin of data.plugins) if (plugin && typeof plugin === 'object') plugin.version = version;
    } else {
      data.version = version;
    }
    writeJsonFile(filePath, data);
    return;
  }

  if (!fs.existsSync(filePath)) throw new GpsError(`${file} not found: ${filePath}`);
  const text = fs.readFileSync(filePath, 'utf-8');
  if (isToml(file)) {
    const lines = tomlLines(text);
    const found = findTomlVersion(lines, file);
    if (!found) throw noVersion();
    const { entry, match } = found;
    const newLine = match[1] + match[2] + version + match[2] + entry.line.slice(match[0].length);
    replaceFile(filePath, lines.map((e) => (e === entry ? newLine : e.line)).join(''));
    return;
  }
  const found = findCmakeVersion(text);
  if (!found) throw noVersion();
  replaceFile(filePath, text.slice(0, found.from) + version + text.slice(found.to));
}

// Cargo workspace pins. A path dependency that also names a version (member
// crates, [workspace.dependencies]) must follow the workspace version, or
// cargo refuses the release. Only a version equal to the previous one moves.

const DEP_TABLE_RE = /(?:^|\.)(?:dependencies|dev-dependencies|build-dependencies)$/;
const DEP_SUBTABLE_RE = /(?:^|\.)(?:dependencies|dev-dependencies|build-dependencies)\.[^.]+$/;

// Index of the "}" closing the inline table opened at `open`, or -1.
function inlineTableEnd(line, open) {
  let depth = 0;
  for (let i = open; i < line.length; i++) {
    const c = line[i];
    if (c === '#') return -1;
    if (c === '"' || c === "'") {
      i++;
      while (i < line.length && line[i] !== c) i += c === '"' && line[i] === '\\' ? 2 : 1;
    } else if (c === '{') {
      depth++;
    } else if (c === '}' && --depth === 0) {
      return i;
    }
  }
  return -1;
}

// `foo = { path = "../foo", version = "<previous>" }` with the version moved, or null.
function pinInlineLine(line, previous, next) {
  const head = /^(\s*(?:[\w-]+|"[^"]*"|'[^']*')\s*=\s*)\{/.exec(line);
  if (!head) return null;
  const open = head[0].length - 1;
  const close = inlineTableEnd(line, open);
  if (close === -1) return null;
  const body = line.slice(open + 1, close);
  if (!/(?:^|,)\s*path\s*=\s*["']/.test(body)) return null;
  const v = /(?:^|,)\s*version\s*=\s*(["'])([^"'\r\n]*)\1/.exec(body);
  if (!v || v[2] !== previous) return null;
  const from = open + 1 + v.index + v[0].length - 1 - v[2].length;
  return line.slice(0, from) + next + line.slice(from + previous.length);
}

// The text with every pinned path dependency moved from `previous` to `next`.
function pinLines(lines, previous, next) {
  const withPath = new Set();
  for (const e of lines) {
    if (!e.isHeader && DEP_SUBTABLE_RE.test(e.table || '') && /^\s*path\s*=\s*["']/.test(e.line)) withPath.add(e.table);
  }
  return lines.map((e) => {
    if (e.isHeader || !e.table) return e.line;
    if (DEP_TABLE_RE.test(e.table)) return pinInlineLine(e.line, previous, next) || e.line;
    if (withPath.has(e.table)) {
      const m = TOML_VERSION_RE.exec(e.line);
      if (m && m[3] === previous) return m[1] + m[2] + next + m[2] + e.line.slice(m[0].length);
    }
    return e.line;
  }).join('');
}

// The strings of `key = [ ... ]` in `table` (single or multi-line), or null.
function tomlStringArray(lines, table, key) {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*\\[`);
  const start = lines.findIndex((e) => !e.isHeader && e.table === table && re.test(e.line));
  if (start === -1) return null;
  const out = [];
  let depth = 0;
  for (let i = start; i < lines.length && (i === start || !lines[i].isHeader); i++) {
    const { line } = lines[i];
    const text = i === start ? line.slice(line.indexOf('[', line.indexOf('='))) : line;
    for (let j = 0; j < text.length; j++) {
      const c = text[j];
      if (c === '#') break;
      if (c === '[') {
        depth++;
      } else if (c === ']') {
        if (--depth === 0) return out;
      } else if (c === '"' || c === "'") {
        let k = j + 1;
        while (k < text.length && text[k] !== c) k += c === '"' && text[k] === '\\' ? 2 : 1;
        out.push(text.slice(j + 1, k));
        j = k;
      }
    }
  }
  return out;
}

const cleanMember = (m) => m.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '');

// Manifests (relative, '/'-separated) of the crates in [workspace] members:
// literal paths and a trailing "/*" glob; anything else is warned about.
function workspaceManifests(projectRoot, lines, warn) {
  const excluded = new Set((tomlStringArray(lines, 'workspace', 'exclude') || []).map(cleanMember));
  const manifests = new Set();
  const addIfCrate = (dir, quiet) => {
    const manifest = `${dir}/Cargo.toml`;
    if (excluded.has(dir)) return;
    if (fs.existsSync(abs(projectRoot, manifest))) manifests.add(manifest);
    else if (!quiet) warn(`Workspace member "${dir}" has no Cargo.toml: skipped.`);
  };
  for (const member of (tomlStringArray(lines, 'workspace', 'members') || []).map(cleanMember)) {
    const glob = member.endsWith('/*');
    const base = glob ? member.slice(0, -2) : member;
    if (/[*?[\]{}]/.test(base)) {
      warn(`Workspace member "${member}" is not a literal path or a trailing "/*" glob: its path dependencies were not checked.`);
    } else if (glob) {
      const parent = abs(projectRoot, base);
      if (!fs.existsSync(parent)) continue;
      const names = fs.readdirSync(parent, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
      for (const name of names) addIfCrate(`${base}/${name}`, true);
    } else if (base && base !== '.') {
      addIfCrate(base, false);
    }
  }
  return [...manifests];
}

// Moves the pinned path dependencies of the root Cargo.toml and of its
// workspace members from `previous` to `next`. Returns the files it changed
// (relative, '/'-separated); a root without [workspace] changes nothing.
function rewriteCargoPins(projectRoot, previous, next, { warn = () => {} } = {}) {
  if (!parseVersion(next)) throw new GpsError(`Not a valid version: ${next}`, 'Use X.Y.Z.');
  const rootFile = 'Cargo.toml';
  if (!fs.existsSync(abs(projectRoot, rootFile))) return [];
  const rootLines = tomlLines(fs.readFileSync(abs(projectRoot, rootFile), 'utf-8'));
  if (!rootLines.some((e) => e.table === 'workspace' || (e.table || '').startsWith('workspace.'))) return [];
  const changed = [];
  for (const file of [rootFile, ...workspaceManifests(projectRoot, rootLines, warn)]) {
    const text = fs.readFileSync(abs(projectRoot, file), 'utf-8');
    const updated = pinLines(tomlLines(text), previous, next);
    if (updated === text) continue;
    replaceFile(abs(projectRoot, file), updated);
    changed.push(file);
  }
  return changed;
}

module.exports = { KNOWN_VERSION_FILES, detectVersionFiles, readVersions, writeVersion, rewriteCargoPins };
