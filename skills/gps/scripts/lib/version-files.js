// skills/gps/scripts/lib/version-files.js
//
// Reads and writes the version of the project files a release bumps:
// package.json, the plugin manifests, pyproject.toml, Cargo.toml and
// CMakeLists.txt. JSON files are rewritten whole (2-space indent, trailing
// newline); text files are edited by replacing the version token only.

const fs = require('fs');
const path = require('path');
const { GpsError, readJson } = require('./guard');
const { parseVersion } = require('./semver');

const KNOWN_VERSION_FILES = [
  'package.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'pyproject.toml',
  'Cargo.toml',
  'CMakeLists.txt',
];

const TOML_TABLES = {
  'pyproject.toml': ['project', 'tool.poetry'],
  'Cargo.toml': ['package'],
};

const isMarketplace = (file) => path.basename(file) === 'marketplace.json';
const isToml = (file) => file.endsWith('.toml');

function abs(projectRoot, file) {
  return path.join(projectRoot, ...file.split('/'));
}

function replaceFile(filePath, content) {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
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

module.exports = { KNOWN_VERSION_FILES, detectVersionFiles, readVersions, writeVersion };
