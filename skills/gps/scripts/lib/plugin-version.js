// skills/gps/scripts/lib/plugin-version.js
//
// What outside tools need to read gps's JSON safely: the status schema
// version (docs/STATUS-JSON.md: renaming or removing a field bumps it) and
// the version of the gps copy that is running. That copy may be a plugin
// cache, not the checkout: the version comes from the plugin.json two levels
// above the skill directory, the file both hosts' caches ship.

const path = require('path');
const { readJsonOrNull } = require('./guard');

const SCHEMA_VERSION = 2;
const PLUGIN_MANIFEST = path.join(__dirname, '..', '..', '..', '..', 'plugin.json');

// The running gps version, or null when plugin.json is missing or holds none.
function gpsVersion(manifestPath = PLUGIN_MANIFEST) {
  const manifest = readJsonOrNull(manifestPath);
  return manifest && typeof manifest.version === 'string' ? manifest.version : null;
}

// The two fields every gps JSON contract starts with.
function contractHeader() {
  return { schemaVersion: SCHEMA_VERSION, gpsVersion: gpsVersion() };
}

module.exports = { SCHEMA_VERSION, PLUGIN_MANIFEST, gpsVersion, contractHeader };
